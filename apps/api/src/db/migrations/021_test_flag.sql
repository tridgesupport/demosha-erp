-- "Is this a test?" checkbox on New Pro Forma / New Indent.
--
-- Test PIs/indents must never advance get_next_pi_number()/get_next_indent_number()
-- — those per-FY counters are permanent and shared with every real PI/indent, so
-- spending one on a test entry would leave a gap in the real numbering. Instead a
-- test row gets a throwaway 'TEST-<epoch ms>' number (assigned in application code)
-- and its seq_number is drawn from a dedicated sequence below — unique, but never
-- touching the real counters or colliding with real seq_number values.

ALTER TABLE sales_orders     ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE purchase_indents ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

CREATE SEQUENCE IF NOT EXISTS sales_orders_test_seq;
CREATE SEQUENCE IF NOT EXISTS purchase_indents_test_seq;
