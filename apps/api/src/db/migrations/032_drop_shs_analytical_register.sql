-- Migration 032: Remove the SHS Analytical Register.
--
-- The "SHS Analytical Register" tab, its API routes and its Excel upload are
-- gone; SHS data now comes from the daily production report PDF upload
-- (shs_daily_report, migration 031). THIS DELETES ALL ROWS in the old table
-- (sieve %, alkalinity, grade, colour, tax grade, approval status, carboys),
-- which the daily report does not contain. No backup is taken (by decision).
--
-- Run AFTER the new version of the app is deployed, so the old endpoints are
-- never left pointing at a missing table. Run 031 before deploying.

DROP TABLE IF EXISTS shs_analytical_register;

-- The nav link is gone: drop any role permission rows that still point at it.
DELETE FROM role_link_permissions
WHERE tab = 'production' AND link_path = '/production/analytical-register';
