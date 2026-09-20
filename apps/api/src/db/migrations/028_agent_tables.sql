-- Migration 028: Tables backing the natural-language data agent
--
-- The agent answers questions by running read-only SQL. These tables hold
-- what it needs to remember and to be held accountable:
--   agent_role_scopes  which data scopes each app role may query
--   agent_recipes      verified question -> SQL patterns, so repeat questions
--                      skip the expensive reasoning step
--   agent_glossary     business definitions taught by users ("GP", "outstanding")
--   agent_query_log    every question, model, token usage and cost
--   agent_feedback     thumbs up/down that decide what becomes a recipe
--
-- Requires the pgvector extension (Neon: enabled per-project, no superuser needed).
-- The embedding dimension (1536) matches OpenAI text-embedding-3-small; change it
-- here before first use if a different embedding model is chosen.

CREATE EXTENSION IF NOT EXISTS vector;

-- Scopes are coarse data domains, enforced in Postgres by per-scope roles
-- (see 029_agent_roles.sql), not by the prompt.
--   tally  -> tally_analytics views (sales/purchase/outstanding/P&L/BS/cash/inventory)
--   sales  -> curated ERP sales views
--   ops    -> curated ERP production/inventory/purchase views
CREATE TABLE IF NOT EXISTS agent_role_scopes (
  role  TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('tally', 'sales', 'ops')),
  PRIMARY KEY (role, scope)
);

-- The accountant role is new: it only exists here (and in Settings > roles)
-- so finance staff can be given the agent with tally scope. Tab access still
-- has to be granted in Settings, like any other role.
INSERT INTO roles (role_name) VALUES ('accountant') ON CONFLICT DO NOTHING;

-- Defaults. Edit freely; the agent reads this table at request time.
-- A role with no rows here cannot use the agent at all.
INSERT INTO agent_role_scopes (role, scope) VALUES
  ('admin',       'tally'),
  ('admin',       'sales'),
  ('admin',       'ops'),
  ('manager',     'tally'),
  ('manager',     'sales'),
  ('manager',     'ops'),
  ('accountant',  'tally'),
  ('salesperson', 'sales'),
  ('factory',          'ops'),
  ('factory_dispatch',  'ops'),
  ('factory_purchase',  'ops'),
  ('factory_data',      'ops'),
  ('purchase',          'ops'),
  ('plant_incharge',    'ops')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS agent_recipes (
  id                 BIGSERIAL PRIMARY KEY,
  -- Which role-set may reuse this: a recipe is only served to users whose
  -- scopes cover every view it touches (checked against views_used).
  scope_key          TEXT NOT NULL DEFAULT 'all',
  question           TEXT NOT NULL,
  question_embedding vector(1536),
  sql_template       TEXT NOT NULL,
  params             JSONB NOT NULL DEFAULT '{}'::jsonb,
  views_used         TEXT[] NOT NULL DEFAULT '{}',
  verified           BOOLEAN NOT NULL DEFAULT false,
  use_count          INTEGER NOT NULL DEFAULT 0,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at       TIMESTAMPTZ,
  -- Set when an underlying view changes or a user reports the answer wrong.
  invalidated_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_recipes_embedding_idx
  ON agent_recipes USING hnsw (question_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS agent_recipes_live_idx
  ON agent_recipes (scope_key) WHERE verified AND invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_glossary (
  id         BIGSERIAL PRIMARY KEY,
  scope_key  TEXT NOT NULL DEFAULT 'all',
  term       TEXT NOT NULL,
  meaning    TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope_key, term)
);

CREATE TABLE IF NOT EXISTS agent_query_log (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT,
  role           TEXT,
  question       TEXT NOT NULL,
  model          TEXT,
  input_tokens   INTEGER,
  cached_tokens  INTEGER,
  output_tokens  INTEGER,
  cost_inr       NUMERIC(12, 4),
  latency_ms     INTEGER,
  recipe_id      BIGINT REFERENCES agent_recipes(id) ON DELETE SET NULL,
  sql_executed   TEXT,
  row_count      INTEGER,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_query_log_user_day_idx
  ON agent_query_log (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_feedback (
  id            BIGSERIAL PRIMARY KEY,
  query_log_id  BIGINT NOT NULL REFERENCES agent_query_log(id) ON DELETE CASCADE,
  user_id       TEXT,
  rating        SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
