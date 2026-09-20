import { parse, astVisitor } from 'pgsql-ast-parser';

// Second line of defence. The database roles (029_agent_roles.sql) are the
// real boundary; this rejects anything that isn't a plain read query before it
// reaches Postgres, and gives the model a clear message to correct itself.

const ALLOWED_SCHEMAS = new Set(['tally_analytics', 'agent_api']);

const ALLOWED_FUNCTIONS = new Set([
  'sum', 'count', 'avg', 'min', 'max', 'round', 'abs', 'coalesce', 'nullif',
  'greatest', 'least', 'lower', 'upper', 'trim', 'concat', 'substr', 'length',
  'date_trunc', 'to_char', 'extract', 'now', 'current_date',
  'row_number', 'rank', 'dense_rank', 'lag', 'lead', 'first_value', 'last_value',
  'fiscal_year', 'fiscal_quarter', 'month_label',
  'fiscal_quarter_number', 'fiscal_month_number',
]);

export const DEFAULT_ROW_LIMIT = 200;

export interface GuardResult {
  ok: boolean;
  error?: string;
  sql?: string; // sanitized query with a row cap applied
}

export function guardSql(raw: string, rowLimit = DEFAULT_ROW_LIMIT): GuardResult {
  const text = raw.trim().replace(/;+\s*$/, '');
  if (!text) return { ok: false, error: 'Empty query.' };

  let statements;
  try {
    statements = parse(text);
  } catch (e: any) {
    return { ok: false, error: `Could not parse the query (${e.message?.split('\n')[0] ?? 'syntax error'}). Simplify it and use standard SQL.` };
  }
  if (statements.length !== 1) return { ok: false, error: 'Exactly one statement is allowed.' };

  const stmt = statements[0];
  if (!['select', 'union', 'union all', 'with', 'with recursive'].includes(stmt.type)) {
    return { ok: false, error: `Only SELECT queries are allowed (got ${stmt.type}).` };
  }
  if (stmt.type === 'with recursive') return { ok: false, error: 'Recursive queries are not allowed.' };

  let problem: string | undefined;
  const visitor = astVisitor(() => ({
    tableRef: (t) => {
      if (t.schema && !ALLOWED_SCHEMAS.has(t.schema)) problem = `Schema "${t.schema}" is not accessible.`;
      if (/^pg_/i.test(t.name) || t.name === 'information_schema') problem = 'System catalogs are not accessible.';
    },
    call: (c) => {
      const name = c.function.name.toLowerCase();
      if (c.function.schema && !ALLOWED_SCHEMAS.has(c.function.schema)) problem = `Function schema "${c.function.schema}" is not accessible.`;
      else if (!ALLOWED_FUNCTIONS.has(name)) problem = `Function ${name}() is not allowed.`;
    },
  }));
  try {
    visitor.statement(stmt);
  } catch {
    return { ok: false, error: 'Query structure not supported. Simplify it.' };
  }
  if (problem) return { ok: false, error: problem };

  // Row cap. Wrapping keeps the inner ORDER BY (Postgres preserves it for a
  // plain outer LIMIT) and avoids editing the AST.
  return { ok: true, sql: `SELECT * FROM (${text}) AS agent_q LIMIT ${Math.floor(rowLimit)}` };
}
