-- Migration 023: sales bill becomes optional, add invoice number, and add
-- planning-only "splits" to the Dispatch Schedule tab.

-- The sales bill was previously mandatory before an order could be marked
-- dispatched (enforced in code, not here) — that check is being removed.
-- Nothing to change schema-side for that; sales_bill_url was already
-- nullable. Invoice number is new: a plain reference field, not tied to
-- any status gate.
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(80);

-- Dispatch-schedule splits are entirely separate from the real invoicing
-- split (sales_orders.part_suffix, see migration 018) — they never touch
-- sales_orders or sales_order_lines. They exist purely so someone planning
-- dispatch can say "part of this order will actually go out in two
-- batches" and give each batch its own tentative date/remark, labeled
-- D1/D2/... against the order's PI number for display. The real split
-- (done from Orders > Mark Dispatched, based on actual invoicing) is
-- unaffected either way.
CREATE TABLE IF NOT EXISTS dispatch_schedule_splits (
  split_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID        NOT NULL REFERENCES sales_orders(order_id),
  split_number   SMALLINT    NOT NULL,
  tentative_date DATE,
  remark         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, split_number)
);

CREATE TABLE IF NOT EXISTS dispatch_schedule_split_lines (
  split_line_id UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id      UUID    NOT NULL REFERENCES dispatch_schedule_splits(split_id) ON DELETE CASCADE,
  order_line_id UUID    NOT NULL REFERENCES sales_order_lines(line_id),
  qty_kg        NUMERIC NOT NULL,
  num_packages  INT     NOT NULL DEFAULT 0
);
