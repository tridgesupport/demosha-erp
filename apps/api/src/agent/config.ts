// Every knob that affects cost or behaviour lives here, overridable by env.

export const MODELS = {
  // Cheap model: used when a verified recipe matches, so it only adapts and runs known SQL.
  router: process.env.AGENT_MODEL_ROUTER ?? 'claude-haiku-4-5',
  // Default for new questions.
  main: process.env.AGENT_MODEL_MAIN ?? 'claude-sonnet-5',
  // Opt-in "deep analysis" only.
  deep: process.env.AGENT_MODEL_DEEP ?? 'claude-opus-5',
};

// USD per 1M tokens (input / output). Cache reads cost 0.1x input, 5-minute cache writes 1.25x.
// Prices change: check the Anthropic pricing page and adjust here; costs are logged from these.
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-opus-5': { in: 5, out: 25 },
};

export const USD_INR = Number(process.env.AGENT_USD_INR ?? 88);

export interface Usage {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export function costInr(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES['claude-sonnet-5'];
  const usd =
    (u.input * p.in + u.cacheRead * p.in * 0.1 + u.cacheWrite * p.in * 1.25 + u.output * p.out) / 1_000_000;
  return usd * USD_INR;
}

export const LIMITS = {
  maxToolIterations: 6,
  maxOutputTokens: 4096,
  resultRowCap: 50, // rows returned to the model
  resultCharCap: 12000, // hard cap on characters of tool output sent to the model
  historyTurns: 8, // previous chat turns accepted from the client
  maxQuestionChars: 2000,
  dailyBudgetInrPerUser: Number(process.env.AGENT_DAILY_BUDGET_INR ?? 100),
  monthlyBudgetInr: Number(process.env.AGENT_MONTHLY_BUDGET_INR ?? 3000),
  recipeMatchThreshold: 0.6, // word-overlap score needed to reuse a saved recipe
};
