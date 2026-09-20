import postgres from 'postgres';
import dotenv from 'dotenv';
import { guardSql } from '../lib/sqlGuard';

dotenv.config();

// Separate connection from the app's main pool: it logs in as agent_runner,
// which has no rights of its own and can only SET ROLE into the read-only
// scope roles created in 029_agent_roles.sql. Use the Neon POOLED string here
// (SET LOCAL inside a transaction is safe through the pooler).
let agentSql: ReturnType<typeof postgres> | null = null;
function client() {
  if (!process.env.AGENT_DATABASE_URL) {
    throw new Error('AGENT_DATABASE_URL environment variable is required for the data agent');
  }
  agentSql ??= postgres(process.env.AGENT_DATABASE_URL, {
    ssl: 'require',
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return agentSql;
}

export type Scope = 'tally' | 'sales' | 'ops';

// Fixed whitelist: the role name is never built from user or model input.
const ROLE_BY_SCOPE_SET: Record<string, string> = {
  'tally': 'agent_tally',
  'sales': 'agent_sales',
  'ops': 'agent_ops',
  'ops,sales': 'agent_sales_ops',
  'ops,sales,tally': 'agent_all',
};

export function roleForScopes(scopes: Scope[]): string | null {
  const key = [...new Set(scopes)].sort().join(',');
  return ROLE_BY_SCOPE_SET[key] ?? null; // e.g. tally+sales needs its own role; not defined yet
}

export interface ScopedResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  sql: string;
}

export async function runScopedQuery(scopes: Scope[], rawSql: string, rowLimit?: number): Promise<ScopedResult> {
  const role = roleForScopes(scopes);
  if (!role) throw new Error('No agent access configured for this role.');

  const guarded = guardSql(rawSql, rowLimit);
  if (!guarded.ok) throw new Error(guarded.error);

  const rows = await client().begin('read only', async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${role}`); // role is from the whitelist above
    await tx.unsafe(`SET LOCAL statement_timeout = '10s'`);
    return tx.unsafe(guarded.sql!);
  });
  return { rows: rows as unknown as Record<string, unknown>[], rowCount: rows.length, sql: guarded.sql! };
}

export interface ViewInfo {
  schema: string;
  view: string;
  description: string | null;
  columns?: { name: string; type: string; description: string | null }[];
}

// Lists the views this scope can actually read (has_table_privilege runs as the
// scope role, so nothing outside the user's access is ever revealed). With no
// view name returns names + descriptions only, to keep the model's context small.
export async function describeViews(scopes: Scope[], view?: string): Promise<ViewInfo[]> {
  const role = roleForScopes(scopes);
  if (!role) throw new Error('No agent access configured for this role.');
  const name = view?.replace(/^(tally_analytics|agent_api)\./, '') ?? null;
  const rows = await client().begin('read only', async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    return tx`
      SELECT n.nspname AS schema, c.relname AS view, obj_description(c.oid, 'pg_class') AS description,
        CASE WHEN ${name}::text IS NULL THEN NULL ELSE (
          SELECT json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
                                            'description', col_description(c.oid, a.attnum)) ORDER BY a.attnum)
          FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) END AS columns
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('tally_analytics', 'agent_api') AND c.relkind IN ('v', 'm')
        AND has_table_privilege(current_user, c.oid, 'SELECT')
        AND (${name}::text IS NULL OR c.relname = ${name}::text)
      ORDER BY n.nspname, c.relname`;
  });
  return rows.map((r: any) => ({ schema: r.schema, view: r.view, description: r.description, columns: r.columns ?? undefined }));
}
