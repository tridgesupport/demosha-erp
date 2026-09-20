import type Anthropic from '@anthropic-ai/sdk';
import { runScopedQuery, describeViews, Scope } from '../db/agentClient';
import { LIMITS } from './config';
import { saveGlossary } from './memory';

export interface ToolContext {
  scopes: Scope[];
  scopeKey: string;
  userId: string;
  executedSql: string[]; // every query the model ran, in order (last one is logged/saved)
  lastRowCount: number | null;
}

// Order and wording are fixed on purpose: the tool list is part of the cached prefix.
export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'describe_schema',
    description:
      'List the views you may query, or the columns of one view. Call with no view to see all available views with a one-line description. Call with a view name (e.g. v_ar_customer_summary) before writing SQL against it if you are unsure of its columns.',
    input_schema: {
      type: 'object',
      properties: { view: { type: 'string', description: 'Optional view name, with or without schema prefix.' } },
    },
  },
  {
    name: 'run_sql',
    description:
      'Run ONE read-only PostgreSQL SELECT and get the rows back (max 50). Always schema-qualify views (tally_analytics.v_... or agent_api.v_...). Aggregate in SQL (SUM, COUNT, GROUP BY, ORDER BY, LIMIT) rather than fetching raw rows. Only SELECT / WITH is allowed.',
    input_schema: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'A single SELECT statement.' } },
      required: ['sql'],
    },
  },
  {
    name: 'save_glossary',
    description:
      'Save a business definition the user has just told you (e.g. "by outstanding I mean receivables more than 60 days overdue"). Use ONLY when the user explicitly defines or corrects a term. Never for your own guesses.',
    input_schema: {
      type: 'object',
      properties: {
        term: { type: 'string' },
        meaning: { type: 'string' },
      },
      required: ['term', 'meaning'],
    },
  },
];

function clip(text: string): string {
  return text.length > LIMITS.resultCharCap ? text.slice(0, LIMITS.resultCharCap) + '\n...[output truncated]' : text;
}

export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<{ content: string; isError: boolean }> {
  const args = (input ?? {}) as Record<string, unknown>;
  try {
    if (name === 'describe_schema') {
      const view = typeof args.view === 'string' && args.view ? args.view : undefined;
      const views = await describeViews(ctx.scopes, view);
      if (view && views.length === 0) return { content: `No accessible view named "${view}".`, isError: true };
      return { content: clip(JSON.stringify(views)), isError: false };
    }
    if (name === 'run_sql') {
      if (typeof args.sql !== 'string' || !args.sql.trim()) return { content: 'sql must be a non-empty string.', isError: true };
      const original = args.sql.trim().replace(/;+\s*$/, '');
      const res = await runScopedQuery(ctx.scopes, original, LIMITS.resultRowCap + 1);
      ctx.executedSql.push(original);
      // Keep whole rows only: cap the row count, then halve until the JSON fits the size cap,
      // so the model never receives a row (or JSON) cut off in the middle.
      let rows = res.rows.slice(0, LIMITS.resultRowCap);
      let payload = JSON.stringify({ row_count: rows.length, rows });
      while (payload.length > LIMITS.resultCharCap && rows.length > 1) {
        rows = rows.slice(0, Math.max(1, Math.floor(rows.length / 2)));
        payload = JSON.stringify({ row_count: rows.length, rows });
      }
      const truncated = rows.length < res.rows.length;
      ctx.lastRowCount = rows.length;
      return {
        content: JSON.stringify({
          row_count: rows.length,
          truncated,
          ...(truncated ? { note: 'More rows exist. Aggregate, filter or select fewer columns to see what you need.' } : {}),
          rows,
        }),
        isError: false,
      };
    }
    if (name === 'save_glossary') {
      if (typeof args.term !== 'string' || typeof args.meaning !== 'string' || !args.term.trim() || !args.meaning.trim()) {
        return { content: 'term and meaning are required strings.', isError: true };
      }
      await saveGlossary(ctx.scopeKey, args.term.trim(), args.meaning.trim(), ctx.userId);
      return { content: 'Saved.', isError: false };
    }
    return { content: `Unknown tool ${name}.`, isError: true };
  } catch (e: any) {
    // Postgres / guard errors are returned to the model so it can correct itself.
    return { content: String(e?.message ?? e).slice(0, 500), isError: true };
  }
}
