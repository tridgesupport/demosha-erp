import { Router, Request, Response } from 'express';
import sql from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { runScopedQuery } from '../db/agentClient';
import { agentAccess, scopesForRole } from '../agent/access';
import { runAgent, BudgetError } from '../agent/runAgent';
import { invalidateRecipe, saveRecipeFromLog, scopeKey } from '../agent/memory';

const router = Router();

// Access is decided on the server from agent_role_scopes (see agent/access.ts). Hiding the
// chat tab in the UI is only a convenience: a role with no scopes gets a 403 here.

// POST /api/agent/chat  { question, history?, deep?, allow_web? }
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const scopes = await scopesForRole(req.user!.role);
    if (scopes.length === 0) return res.status(403).json({ error: 'The data assistant is not enabled for your role.' });
    const b = req.body ?? {};
    const access = await agentAccess(req.user!.role);
    const result = await runAgent(
      { user_id: req.user!.user_id, role: req.user!.role },
      scopes,
      {
        question: b.question,
        history: Array.isArray(b.history) ? b.history : [],
        deep: b.deep === true && access.deep, // silently ignored for roles without deep access
        allowWeb: b.allow_web === true && access.web,
      },
    );
    res.json({
      answer: result.answer,
      log_id: result.logId,
      model: result.model,
      cost_inr: Number(result.costInr.toFixed(4)),
      used_saved_answer: result.recipeId !== null,
      sql: result.sql, // shown behind a "How I got this" toggle in the UI
    });
  } catch (e: any) {
    if (e instanceof BudgetError) return res.status(429).json({ error: e.message });
    console.error('agent/chat failed:', e?.message);
    res.status(500).json({ error: 'The data assistant is unavailable right now.' });
  }
});

// POST /api/agent/feedback  { log_id, rating: 1 | -1, comment? }
// A thumbs-up saves the exact SQL behind the answer as a verified recipe;
// a thumbs-down retires the recipe that produced it.
router.post('/feedback', requireAuth, async (req: Request, res: Response) => {
  const logId = Number(req.body?.log_id);
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(logId) || (rating !== 1 && rating !== -1)) return res.status(400).json({ error: 'log_id and rating (1 or -1) are required' });
  try {
    const [log] = await sql`SELECT id, user_id, recipe_id FROM agent_query_log WHERE id = ${logId}`;
    if (!log || log.user_id !== req.user!.user_id) return res.status(404).json({ error: 'Not found' });
    await sql`
      INSERT INTO agent_feedback (query_log_id, user_id, rating, comment)
      VALUES (${logId}, ${req.user!.user_id}, ${rating}, ${req.body?.comment ? String(req.body.comment).slice(0, 1000) : null})`;
    let recipeId: number | null = null;
    if (rating === 1) {
      const scopes = await scopesForRole(req.user!.role);
      recipeId = await saveRecipeFromLog(logId, req.user!.user_id, scopeKey(scopes));
    } else if (log.recipe_id) {
      await invalidateRecipe(Number(log.recipe_id));
    }
    res.json({ ok: true, recipe_id: recipeId });
  } catch (e: any) {
    console.error('agent/feedback failed:', e?.message);
    res.status(500).json({ error: 'Could not save feedback' });
  }
});

// Admin-only diagnostic from Phase 1: runs a query as another role's scopes.
router.post('/sql-test', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const query = String(req.body?.sql ?? '');
  const asRole = String(req.body?.as_role ?? req.user!.role);
  try {
    const scopes = await scopesForRole(asRole);
    if (scopes.length === 0) return res.status(403).json({ error: `Role "${asRole}" has no agent scopes.` });
    const result = await runScopedQuery(scopes, query, 50);
    res.json({ as_role: asRole, scopes, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
