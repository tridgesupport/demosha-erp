-- Migration 029: Read-only Postgres roles for the data agent
--
-- Access control is enforced by Postgres, not by the prompt. The agent's SQL
-- runs as one of the scope-set roles below (via SET LOCAL ROLE inside a
-- read-only transaction), so even a fully compromised prompt cannot read
-- outside the user's scopes or write anything.
--
-- RUN AS THE NEON OWNER ROLE on the DIRECT (non-pooler) connection, in ONE
-- session, setting the login password first so it never lands in git:
--   SELECT set_config('agent.runner_password', '<long-random-password>', false);
--   then run the rest of this file in the same session.
-- Test on a Neon branch first: role changes are not covered by the usual
-- one-way-migration safety net.
--
-- Layout
--   base scope roles (NOLOGIN)   agent_tally, agent_sales, agent_ops
--   scope-set roles (NOLOGIN)    agent_sales_ops, agent_all  (inherit from bases)
--   login role                   agent_runner  (NOINHERIT: has no rights of its own,
--                                only the ability to SET ROLE into the roles above)
-- The app picks the role from a user's rows in agent_role_scopes.
-- Base ERP tables (users, password hashes, permissions) are never granted.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_tally')     THEN CREATE ROLE agent_tally     NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_sales')     THEN CREATE ROLE agent_sales     NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_ops')       THEN CREATE ROLE agent_ops       NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_sales_ops') THEN CREATE ROLE agent_sales_ops NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_all')       THEN CREATE ROLE agent_all       NOLOGIN; END IF;
END $$;

GRANT agent_sales, agent_ops               TO agent_sales_ops;
GRANT agent_tally, agent_sales, agent_ops  TO agent_all;

-- Login role. The password comes from the session setting agent.runner_password
-- (set it in the same session before running this file), so it never lands in git.
-- If the setting is not available (e.g. the SQL editor runs statements in
-- separate sessions), create the login role yourself first, as its own run:
--   CREATE ROLE agent_runner LOGIN NOINHERIT PASSWORD '<long-random-password>';
-- This file then only adjusts the existing role and does not touch its password.
DO $$
DECLARE pw text := current_setting('agent.runner_password', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_runner') THEN
    IF pw IS NULL OR pw = '' THEN
      RAISE EXCEPTION 'agent_runner does not exist: create it first (see comment above) or set agent.runner_password';
    END IF;
    EXECUTE format('CREATE ROLE agent_runner LOGIN NOINHERIT PASSWORD %L', pw);
  ELSIF pw IS NOT NULL AND pw <> '' THEN
    EXECUTE format('ALTER ROLE agent_runner LOGIN NOINHERIT PASSWORD %L', pw);
  ELSE
    ALTER ROLE agent_runner LOGIN NOINHERIT;
  END IF;
END $$;

GRANT agent_tally, agent_sales, agent_ops, agent_sales_ops, agent_all TO agent_runner;

-- Hard limits that apply whatever the app or the model does.
ALTER ROLE agent_runner SET default_transaction_read_only = on;
ALTER ROLE agent_runner SET statement_timeout = '10s';
ALTER ROLE agent_runner SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE agent_runner SET lock_timeout = '2s';
-- The base roles carry the same limits because SET ROLE does not pick up the
-- login role's per-role settings.
ALTER ROLE agent_tally     SET default_transaction_read_only = on;
ALTER ROLE agent_sales     SET default_transaction_read_only = on;
ALTER ROLE agent_ops       SET default_transaction_read_only = on;
ALTER ROLE agent_sales_ops SET default_transaction_read_only = on;
ALTER ROLE agent_all       SET default_transaction_read_only = on;

-- Nothing by default: lock down anything these roles might inherit via PUBLIC.
REVOKE ALL ON SCHEMA public FROM agent_tally, agent_sales, agent_ops, agent_sales_ops, agent_all, agent_runner;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM agent_tally, agent_sales, agent_ops, agent_sales_ops, agent_all, agent_runner;

-- ── tally scope ────────────────────────────────────────────────────────────
-- Only the combined tally_analytics schema. Views run with their owner's
-- rights, so the roles need no access to the raw "tallydb-*" schemas or the
-- per-year tally_analytics_fy* copies (and are deliberately not given any).
GRANT USAGE ON SCHEMA tally_analytics TO agent_tally;
GRANT SELECT ON ALL TABLES IN SCHEMA tally_analytics TO agent_tally;  -- views + materialized views
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tally_analytics TO agent_tally;

-- The per-year schemas' fiscal_*() SQL functions call each other by
-- schema-qualified name, and function bodies run with the CALLER's rights
-- (views only borrow the owner's rights for tables, not for nested function
-- bodies). So the role needs USAGE + EXECUTE there, but deliberately NO
-- SELECT on any per-year view or table.
GRANT USAGE ON SCHEMA tally_analytics_fy2123, tally_analytics_fy2325, tally_analytics_fy2527 TO agent_tally;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tally_analytics_fy2123, tally_analytics_fy2325, tally_analytics_fy2527 TO agent_tally;

-- Re-run the two GRANT SELECT / EXECUTE lines above after any rebuild that
-- adds new views (sql-combined/*.sql uses CREATE OR REPLACE for existing
-- ones, which keeps grants, but a brand-new view needs a fresh grant).

-- ── sales / ops scopes ─────────────────────────────────────────────────────
-- Granted only on curated views in schema agent_api, created in migration 030
-- after a column-by-column review of the ERP tables (sensitive columns such as
-- costs, margins and personal data are left out on purpose).
CREATE SCHEMA IF NOT EXISTS agent_api;
GRANT USAGE ON SCHEMA agent_api TO agent_sales, agent_ops;
-- No SELECT is granted here. 030 grants each view to exactly the scope(s) that may see it.

-- Ensure unqualified names resolve only inside schemas the role can use.
ALTER ROLE agent_tally SET search_path = tally_analytics;
ALTER ROLE agent_sales SET search_path = agent_api;
ALTER ROLE agent_ops   SET search_path = agent_api;
ALTER ROLE agent_sales_ops SET search_path = agent_api;
ALTER ROLE agent_all   SET search_path = tally_analytics, agent_api;
