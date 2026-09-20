import sql from '../db/client';
import type { Scope } from '../db/agentClient';
import { LIMITS } from './config';

// Recipe + glossary memory. These run on the app's main connection (they live
// in public.agent_* tables, which the agent's own read-only roles cannot see).

export function scopeKey(scopes: Scope[]): string {
  return [...new Set(scopes)].sort().join('+');
}

const STOP = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'what', 'which', 'who', 'how', 'much', 'many', 'from', 'that',
  'this', 'with', 'have', 'has', 'give', 'show', 'tell', 'list', 'get', 'please', 'can', 'you', 'our', 'all',
  'me', 'my', 'of', 'in', 'on', 'to', 'is', 'a', 'an', 'by', 'at', 'as', 'it', 'be',
]);

export function tokens(q: string): Set<string> {
  return new Set(
    q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface Recipe {
  id: number;
  question: string;
  sql_template: string;
  views_used: string[];
  score: number;
}

// Word-overlap match over the (small) set of verified recipes for this scope.
// Embeddings can replace this later without changing callers.
export async function findRecipe(question: string, key: string): Promise<Recipe | null> {
  const rows = await sql`
    SELECT id, question, sql_template, views_used
    FROM agent_recipes
    WHERE scope_key = ${key} AND verified AND invalidated_at IS NULL
    ORDER BY use_count DESC, last_used_at DESC NULLS LAST
    LIMIT 300`;
  let best: Recipe | null = null;
  for (const r of rows) {
    const score = similarity(question, r.question);
    if (score >= LIMITS.recipeMatchThreshold && (!best || score > best.score)) {
      best = { id: Number(r.id), question: r.question, sql_template: r.sql_template, views_used: r.views_used, score };
    }
  }
  return best;
}

export async function markRecipeUsed(id: number) {
  await sql`UPDATE agent_recipes SET use_count = use_count + 1, last_used_at = now() WHERE id = ${id}`;
}

export async function invalidateRecipe(id: number) {
  await sql`UPDATE agent_recipes SET invalidated_at = now() WHERE id = ${id}`;
}

export function viewsInSql(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b(?:tally_analytics|agent_api)\.([a-z_][a-z0-9_]*)/gi)) found.add(m[0].toLowerCase());
  return [...found];
}

// A thumbs-up turns the exact SQL that produced the answer into a verified recipe.
export async function saveRecipeFromLog(logId: number, userId: string, key: string): Promise<number | null> {
  const [log] = await sql`
    SELECT id, question, sql_executed, recipe_id, error FROM agent_query_log WHERE id = ${logId}`;
  if (!log || !log.sql_executed || log.error) return null;
  if (log.recipe_id) return Number(log.recipe_id); // already backed by a recipe
  const [dupe] = await sql`
    SELECT id FROM agent_recipes WHERE scope_key = ${key} AND sql_template = ${log.sql_executed} AND invalidated_at IS NULL LIMIT 1`;
  if (dupe) return Number(dupe.id);
  const [row] = await sql`
    INSERT INTO agent_recipes (scope_key, question, sql_template, views_used, verified, created_by)
    VALUES (${key}, ${log.question}, ${log.sql_executed}, ${viewsInSql(log.sql_executed)}, true, ${userId})
    RETURNING id`;
  return Number(row.id);
}

export async function getGlossary(key: string): Promise<string[]> {
  const rows = await sql`
    SELECT term, meaning FROM agent_glossary WHERE scope_key IN (${key}, 'all') ORDER BY created_at DESC LIMIT 40`;
  return rows.map((r) => `${r.term} = ${r.meaning}`);
}

export async function saveGlossary(key: string, term: string, meaning: string, userId: string) {
  await sql`
    INSERT INTO agent_glossary (scope_key, term, meaning, created_by)
    VALUES (${key}, ${term.slice(0, 80)}, ${meaning.slice(0, 500)}, ${userId})
    ON CONFLICT (scope_key, term) DO UPDATE SET meaning = EXCLUDED.meaning`;
}

// ── Budgets ────────────────────────────────────────────────────────────────
export async function spentTodayInr(userId: string): Promise<number> {
  const [r] = await sql`
    SELECT COALESCE(SUM(cost_inr), 0)::float AS s FROM agent_query_log
    WHERE user_id = ${userId} AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`;
  return r.s;
}

export async function spentMonthInr(): Promise<number> {
  const [r] = await sql`
    SELECT COALESCE(SUM(cost_inr), 0)::float AS s FROM agent_query_log
    WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`;
  return r.s;
}

export async function logQuery(entry: {
  userId: string; role: string; question: string; model: string;
  input: number; cached: number; output: number; costInr: number; latencyMs: number;
  recipeId: number | null; sqlExecuted: string | null; rowCount: number | null; error: string | null;
}): Promise<number> {
  const [row] = await sql`
    INSERT INTO agent_query_log
      (user_id, role, question, model, input_tokens, cached_tokens, output_tokens, cost_inr,
       latency_ms, recipe_id, sql_executed, row_count, error)
    VALUES (${entry.userId}, ${entry.role}, ${entry.question}, ${entry.model}, ${entry.input}, ${entry.cached},
            ${entry.output}, ${entry.costInr}, ${entry.latencyMs}, ${entry.recipeId}, ${entry.sqlExecuted},
            ${entry.rowCount}, ${entry.error})
    RETURNING id`;
  return Number(row.id);
}
