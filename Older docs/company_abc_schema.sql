-- ============================================================
-- COMPANY ABC — Sales & Operations Database
-- PostgreSQL 15+ · Cloud-hosted (Supabase / Neon / RDS)
-- ============================================================
-- OPEN MERCATO ALIGNMENT MAP
-- -------------------------------------------------------
-- Our table                  → Mercato module / entity
-- lookup_state_codes         → custom seed (India-specific)
-- lookup_financial_years     → custom seed (India FY)
-- lookup_packaging_types     → catalog: product attributes
-- catalog_agents             → staff / people module
-- catalog_products           → catalog: products
-- catalog_product_variants   → catalog: product variants
-- customers                  → customers module: people/companies
-- sales_orders               → sales module: orders / quotes
-- sales_order_lines          → sales module: order line items
-- sales_pi_sequences         → custom (PI numbering utility)
-- finance_outstanding        → custom finance module (Tally sync)
-- finance_outstanding_alerts → custom finance module
-- -------------------------------------------------------
-- CONVENTIONS
--   · UUID primary keys (gen_random_uuid())
--   · snake_case everywhere
--   · tenant_id + organization_id on all business entities
--     (single-tenant now; columns ready for Mercato multi-tenancy)
--   · deleted_at for soft deletes (Mercato pattern)
--   · created_at / updated_at on all mutable tables
--   · NUMERIC(14,2) for all monetary values
--   · NUMERIC(5,4) for rates/percentages (e.g. 0.1800 = 18%)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- LOOKUP MODULE  —  Seed / reference tables
-- ============================================================

CREATE TABLE lookup_state_codes (
    state_code   SMALLINT    PRIMARY KEY,
    state_name   VARCHAR(100) NOT NULL,
    region       VARCHAR(50),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  lookup_state_codes             IS 'Indian GST state/UT codes (1–37). Pre-seeded, read-only.';
COMMENT ON COLUMN lookup_state_codes.state_code  IS 'Official GST state code used on invoices and GSTIN.';

-- ----

CREATE TABLE lookup_financial_years (
    fy_key      SMALLINT    PRIMARY KEY,           -- 23 = FY 2022-23, 26 = FY 2025-26
    fy_label    VARCHAR(10) NOT NULL UNIQUE,        -- '2025-26'
    start_date  DATE        NOT NULL,
    end_date    DATE        NOT NULL,
    is_current  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  lookup_financial_years           IS 'Indian financial years (Apr–Mar). PI number = fy_key * 10000 + seq.';
COMMENT ON COLUMN lookup_financial_years.fy_key    IS 'Last 2 digits of end-year. FY 2025-26 → 26. Used in PI number formula.';
COMMENT ON COLUMN lookup_financial_years.is_current IS 'Only one row should be TRUE at a time.';

-- ----

CREATE TABLE lookup_packaging_types (
    pkg_id     SERIAL       PRIMARY KEY,
    pkg_name   VARCHAR(80)  NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lookup_packaging_types IS 'Packaging formats: Drum, Pl. Drum, HDPE Bag, Bucket, Jumbo Bag, etc.';

-- ============================================================
-- CATALOG MODULE
-- ============================================================

CREATE TABLE catalog_agents (
    agent_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name      VARCHAR(150) NOT NULL,
    contact_phone   VARCHAR(40),
    contact_email   VARCHAR(150),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Mercato compatibility
    tenant_id       VARCHAR(50),
    organization_id VARCHAR(50),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE catalog_agents IS 'Sales agents/reps. "DIRECT" is a valid agent (seed it). Maps to Mercato staff.';

-- ----

CREATE TABLE catalog_products (
    product_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name    VARCHAR(200) NOT NULL,
    hs_code         VARCHAR(20),                   -- e.g. '28311010', '28170010'
    item_type       VARCHAR(30)  NOT NULL
                    CHECK (item_type IN (
                        'finished_goods', 'raw_material', 'packing_material',
                        'store_spares', 'wip', 'other'
                    )),
    description     TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Mercato compatibility
    tenant_id       VARCHAR(50),
    organization_id VARCHAR(50),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE  catalog_products          IS 'Base product definitions. Maps to Mercato catalog products.';
COMMENT ON COLUMN catalog_products.hs_code  IS 'HSN/SAC code used on GST invoices. e.g. 28311010 = Sodium Hydrosulphite.';

-- ----

CREATE TABLE catalog_product_variants (
    variant_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID        NOT NULL REFERENCES catalog_products(product_id),
    legacy_code_id   SMALLINT    UNIQUE,            -- row number from original CODES sheet (1–49+)
    grade            VARCHAR(80),                   -- 'Grade A1', 'CHIPS', 'POWDER', 'Grade WS', 'ZN', etc.
    qty_per_pkg      SMALLINT    NOT NULL,           -- package size in kg
    pkg_id           INT         NOT NULL REFERENCES lookup_packaging_types(pkg_id),
    full_description VARCHAR(350),                  -- computed display string (mirrors CODES sheet col F)
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Mercato compatibility
    tenant_id        VARCHAR(50),
    organization_id  VARCHAR(50),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

COMMENT ON TABLE  catalog_product_variants                IS 'Sellable SKUs: product + grade + qty + packaging. Maps to Mercato product variants.';
COMMENT ON COLUMN catalog_product_variants.legacy_code_id IS 'Original row number (1–49) from the CODES sheet. Preserved for data migration traceability.';
COMMENT ON COLUMN catalog_product_variants.full_description IS 'Auto-generated string: "(HS Code - Product) - Grade - Qty Kg (Packaging)". Same as CODES sheet col F.';

CREATE INDEX idx_cpv_product_id ON catalog_product_variants(product_id);
CREATE INDEX idx_cpv_active     ON catalog_product_variants(is_active) WHERE is_active = TRUE;

-- ============================================================
-- CUSTOMERS MODULE
-- ============================================================

CREATE TABLE customers (
    customer_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    party_name         VARCHAR(250) NOT NULL,
    gstin              VARCHAR(20),                 -- 15-char GST number
    primary_state_code SMALLINT     REFERENCES lookup_state_codes(state_code),
    primary_address    TEXT,
    contact_phone      VARCHAR(60),
    contact_email      VARCHAR(150),
    tally_ref          VARCHAR(150),                -- party name in Tally (for sync matching)
    notes              TEXT,
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Mercato compatibility
    tenant_id          VARCHAR(50),
    organization_id    VARCHAR(50),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

COMMENT ON TABLE  customers            IS 'All trading parties — buyers (Sundry Debtors) and suppliers (Sundry Creditors). Maps to Mercato customers.';
COMMENT ON COLUMN customers.tally_ref  IS 'Exact party name in Tally used to match Tally exports when syncing outstanding data.';
COMMENT ON COLUMN customers.gstin      IS 'Primary GSTIN. Per-order GSTINs (different delivery locations) are stored on sales_orders.';

CREATE INDEX idx_cust_gstin      ON customers(gstin)      WHERE gstin IS NOT NULL;
CREATE INDEX idx_cust_tally_ref  ON customers(tally_ref)  WHERE tally_ref IS NOT NULL;
CREATE INDEX idx_cust_name_fts   ON customers USING GIN(to_tsvector('simple', party_name));

-- ============================================================
-- SALES MODULE
-- ============================================================

CREATE TABLE sales_orders (
    order_id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- PI number (format: fy_key * 10000 + seq_number)
    pi_number            VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. '260106'
    fy_key               SMALLINT     NOT NULL REFERENCES lookup_financial_years(fy_key),
    seq_number           INT          NOT NULL,

    -- Dates
    order_date           DATE         NOT NULL,
    buyer_order_date     DATE,
    buyer_po_number      VARCHAR(100),

    -- Bill To (Buyer)
    buyer_id             UUID         NOT NULL REFERENCES customers(customer_id),
    buyer_address        TEXT,
    buyer_gstin          VARCHAR(20),
    buyer_state_code     SMALLINT     REFERENCES lookup_state_codes(state_code),

    -- Ship To (Consignee) — same as buyer or different
    consignee_id         UUID         NOT NULL REFERENCES customers(customer_id),
    consignee_address    TEXT,
    consignee_gstin      VARCHAR(20),
    consignee_state_code SMALLINT     REFERENCES lookup_state_codes(state_code),

    -- Agent & commercial terms
    agent_id             UUID         REFERENCES catalog_agents(agent_id),
    payment_terms        VARCHAR(100),               -- free text: 'Advance', '30 DAYS', 'TO PAY'
    freight_desc         VARCHAR(100),               -- 'Door Delivery', 'TO PAY', 'Party Tempo', etc.
    freight_per_kg       NUMERIC(10,4) NOT NULL DEFAULT 0,
    insurance_pct        NUMERIC(6,5)  NOT NULL DEFAULT 0,  -- e.g. 0.00500 = 0.5%
    schedule_notes       TEXT,

    -- GST
    gst_type             VARCHAR(15)  NOT NULL CHECK (gst_type IN ('IGST', 'CGST_SGST')),
    igst_rate            NUMERIC(5,4) NOT NULL DEFAULT 0,   -- e.g. 0.1800
    cgst_rate            NUMERIC(5,4) NOT NULL DEFAULT 0,   -- e.g. 0.0900
    tcs_rate             NUMERIC(6,5) NOT NULL DEFAULT 0,   -- e.g. 0.00075

    -- Computed totals (stored for audit & reporting, recomputed on save)
    gross_value          NUMERIC(14,2) NOT NULL DEFAULT 0,
    insurance_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    freight_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    assessable_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    cgst_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    tcs_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- Lifecycle status
    status               VARCHAR(30)  NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'sent', 'approved', 'dispatched', 'invoiced', 'cancelled')),

    -- Revision chain — new PI gets new number; original is auto-cancelled
    parent_order_id      UUID         REFERENCES sales_orders(order_id),
    revision_number      SMALLINT     NOT NULL DEFAULT 0,   -- 0 = original
    is_cancelled         BOOLEAN      NOT NULL DEFAULT FALSE,

    -- Mercato compatibility
    tenant_id            VARCHAR(50),
    organization_id      VARCHAR(50),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ,

    CONSTRAINT uq_fy_seq UNIQUE (fy_key, seq_number)
);

COMMENT ON TABLE  sales_orders                   IS 'Proforma Invoice headers. Maps to Mercato sales orders / quotes.';
COMMENT ON COLUMN sales_orders.pi_number         IS 'Format: fy_key * 10000 + seq_number. FY26, seq 106 → 260106.';
COMMENT ON COLUMN sales_orders.parent_order_id   IS 'Non-null when this PI is a revision. Points to the PI being superseded (which is set to is_cancelled=TRUE).';
COMMENT ON COLUMN sales_orders.revision_number   IS '0 = original PI. 1 = first revision (gets a new pi_number). Original parent is cancelled.';
COMMENT ON COLUMN sales_orders.gst_type          IS 'IGST for inter-state; CGST_SGST for intra-state (Gujarat buyer). Determined by buyer vs. seller state.';
COMMENT ON COLUMN sales_orders.buyer_gstin        IS 'Stored on the order because same customer can have different GSTINs for different delivery locations.';

CREATE INDEX idx_so_buyer_id       ON sales_orders(buyer_id);
CREATE INDEX idx_so_consignee_id   ON sales_orders(consignee_id);
CREATE INDEX idx_so_fy_key         ON sales_orders(fy_key);
CREATE INDEX idx_so_status         ON sales_orders(status);
CREATE INDEX idx_so_order_date     ON sales_orders(order_date DESC);
CREATE INDEX idx_so_parent         ON sales_orders(parent_order_id) WHERE parent_order_id IS NOT NULL;
CREATE INDEX idx_so_agent          ON sales_orders(agent_id)        WHERE agent_id IS NOT NULL;

-- ----

CREATE TABLE sales_order_lines (
    line_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID         NOT NULL REFERENCES sales_orders(order_id) ON DELETE CASCADE,
    line_number     SMALLINT     NOT NULL CHECK (line_number >= 1),
    variant_id      UUID         NOT NULL REFERENCES catalog_product_variants(variant_id),
    num_packages    INT          NOT NULL CHECK (num_packages > 0),
    qty_kg          NUMERIC(10,3) NOT NULL CHECK (qty_kg > 0),
    rate_per_mt     NUMERIC(10,2) NOT NULL CHECK (rate_per_mt > 0),
    line_amount     NUMERIC(14,2) NOT NULL,          -- (qty_kg / 1000) * rate_per_mt
    -- Mercato compatibility
    tenant_id       VARCHAR(50),
    organization_id VARCHAR(50),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_order_line UNIQUE (order_id, line_number)
);

COMMENT ON TABLE  sales_order_lines              IS 'PI line items. No hard cap — use as many rows as needed. Maps to Mercato order lines.';
COMMENT ON COLUMN sales_order_lines.rate_per_mt  IS 'Rate in ₹ per metric tonne. line_amount = (qty_kg / 1000) * rate_per_mt.';
COMMENT ON COLUMN sales_order_lines.line_number  IS 'Display order on the printed PI (1, 2, 3...).';

CREATE INDEX idx_sol_order_id   ON sales_order_lines(order_id);
CREATE INDEX idx_sol_variant_id ON sales_order_lines(variant_id);

-- ============================================================
-- PI NUMBER AUTO-GENERATION UTILITY
-- ============================================================

CREATE TABLE sales_pi_sequences (
    fy_key    SMALLINT  PRIMARY KEY REFERENCES lookup_financial_years(fy_key),
    last_seq  INT       NOT NULL DEFAULT 0
);

COMMENT ON TABLE sales_pi_sequences IS 'Tracks last-used sequence number per FY. Used by get_next_pi_number(). Do not modify manually.';

CREATE OR REPLACE FUNCTION get_next_pi_number(p_fy_key SMALLINT)
RETURNS VARCHAR(20)
LANGUAGE plpgsql AS $$
DECLARE
    v_seq INT;
BEGIN
    -- Atomic upsert + increment — safe under concurrent inserts
    INSERT INTO sales_pi_sequences (fy_key, last_seq)
    VALUES (p_fy_key, 1)
    ON CONFLICT (fy_key) DO UPDATE
        SET last_seq = sales_pi_sequences.last_seq + 1
    RETURNING last_seq INTO v_seq;

    RETURN ((p_fy_key::INT * 10000) + v_seq)::VARCHAR;
END;
$$;

COMMENT ON FUNCTION get_next_pi_number IS
'Returns next PI number for a given FY. Call before INSERT on sales_orders.
 Example: SELECT get_next_pi_number(26) → ''260001'', then ''260002'', etc.
 Thread-safe: uses upsert row-level lock. Never reuses a number, even on rollback.';

-- ============================================================
-- FINANCE MODULE  —  Outstanding / AR / AP (Tally sync)
-- ============================================================

CREATE TABLE finance_outstanding (
    outstanding_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Party
    party_id          UUID         NOT NULL REFERENCES customers(customer_id),
    party_type        VARCHAR(10)  NOT NULL CHECK (party_type IN ('debtor', 'creditor')),
                      -- debtor  = Sundry Debtors  (money owed TO us)
                      -- creditor = Sundry Creditors (money we OWE)

    -- Tally-sourced fields
    ref_number        VARCHAR(100),                 -- Tally invoice / voucher number
    tally_voucher_ref VARCHAR(100),                 -- Internal Tally voucher ref (e.g. RM-261885)
    transaction_type  VARCHAR(50),                  -- 'Pur-RM', 'Pur-OT', 'RI', 'TI', 'GDN', etc.
    transaction_date  DATE,
    due_date          DATE,
    opening_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    pending_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    overdue_days      INT           NOT NULL DEFAULT 0,

    -- Link back to our sales order when this is a debtor entry from a PI
    linked_order_id   UUID          REFERENCES sales_orders(order_id),

    -- Sync metadata
    synced_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- Mercato compatibility
    tenant_id         VARCHAR(50),
    organization_id   VARCHAR(50),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  finance_outstanding                 IS 'AR/AP ledger synced from Tally. One row per pending bill line. Refreshed on each Tally export.';
COMMENT ON COLUMN finance_outstanding.party_type      IS 'debtor = Sundry Debtors sheet (sales). creditor = Sundry Creditors sheet (purchases).';
COMMENT ON COLUMN finance_outstanding.linked_order_id IS 'Optional FK to sales_orders when this outstanding line corresponds to a PI raised in this system.';
COMMENT ON COLUMN finance_outstanding.synced_at       IS 'Timestamp of last Tally sync. Use to show "data as of X" on the outstanding dashboard.';

CREATE INDEX idx_fo_party_id   ON finance_outstanding(party_id);
CREATE INDEX idx_fo_party_type ON finance_outstanding(party_type);
CREATE INDEX idx_fo_due_date   ON finance_outstanding(due_date)     WHERE pending_amount > 0;
CREATE INDEX idx_fo_overdue    ON finance_outstanding(overdue_days) WHERE overdue_days > 0;
CREATE INDEX idx_fo_linked     ON finance_outstanding(linked_order_id) WHERE linked_order_id IS NOT NULL;

-- ----

CREATE TABLE finance_outstanding_alerts (
    alert_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    outstanding_id    UUID         NOT NULL REFERENCES finance_outstanding(outstanding_id) ON DELETE CASCADE,
    party_id          UUID         NOT NULL REFERENCES customers(customer_id),
    party_type        VARCHAR(10)  NOT NULL,
    overdue_days      INT          NOT NULL,
    pending_amount    NUMERIC(14,2) NOT NULL,
    threshold_days    INT          NOT NULL CHECK (threshold_days IN (30, 60, 90)),
    is_acknowledged   BOOLEAN      NOT NULL DEFAULT FALSE,
    acknowledged_by   VARCHAR(150),
    acknowledged_at   TIMESTAMPTZ,
    triggered_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Mercato compatibility
    tenant_id         VARCHAR(50),
    organization_id   VARCHAR(50)
);

COMMENT ON TABLE  finance_outstanding_alerts                IS 'Overdue alerts auto-created when outstanding crosses 30 / 60 / 90 day thresholds.';
COMMENT ON COLUMN finance_outstanding_alerts.threshold_days IS '30, 60, or 90 — the band that triggered this alert.';

CREATE INDEX idx_foa_outstanding_id ON finance_outstanding_alerts(outstanding_id);
CREATE INDEX idx_foa_party_id       ON finance_outstanding_alerts(party_id);
CREATE INDEX idx_foa_unacked        ON finance_outstanding_alerts(is_acknowledged) WHERE is_acknowledged = FALSE;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- 1. updated_at auto-stamp

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'catalog_agents',
        'catalog_products',
        'catalog_product_variants',
        'customers',
        'sales_orders',
        'sales_order_lines',
        'finance_outstanding'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_updated_at_%1$s
             BEFORE UPDATE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
            t
        );
    END LOOP;
END;
$$;

-- ----

-- 2. Overdue alert trigger — fires when finance_outstanding is inserted/updated
--    Creates one alert per threshold band (30 / 60 / 90), no duplicates.

CREATE OR REPLACE FUNCTION fn_overdue_alert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_threshold INT;
BEGIN
    IF NEW.pending_amount <= 0 OR NEW.overdue_days < 30 THEN
        RETURN NEW;
    END IF;

    -- Determine which threshold band we're in
    v_threshold := CASE
        WHEN NEW.overdue_days >= 90 THEN 90
        WHEN NEW.overdue_days >= 60 THEN 60
        ELSE 30
    END;

    -- Insert alert only if no unacknowledged alert at this band already exists
    INSERT INTO finance_outstanding_alerts (
        outstanding_id, party_id, party_type,
        overdue_days, pending_amount, threshold_days,
        tenant_id, organization_id
    )
    SELECT
        NEW.outstanding_id, NEW.party_id, NEW.party_type,
        NEW.overdue_days, NEW.pending_amount, v_threshold,
        NEW.tenant_id, NEW.organization_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM   finance_outstanding_alerts
        WHERE  outstanding_id = NEW.outstanding_id
          AND  threshold_days = v_threshold
          AND  is_acknowledged = FALSE
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_overdue_alert
AFTER INSERT OR UPDATE OF overdue_days, pending_amount
ON finance_outstanding
FOR EACH ROW EXECUTE FUNCTION fn_overdue_alert();

-- ----

-- 3. Revision guard — when a revised PI is inserted, auto-cancel the parent

CREATE OR REPLACE FUNCTION fn_cancel_parent_on_revision()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.parent_order_id IS NOT NULL THEN
        UPDATE sales_orders
        SET    is_cancelled = TRUE,
               status       = 'cancelled',
               updated_at   = NOW()
        WHERE  order_id = NEW.parent_order_id
          AND  is_cancelled = FALSE;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancel_parent_revision
AFTER INSERT ON sales_orders
FOR EACH ROW EXECUTE FUNCTION fn_cancel_parent_on_revision();

-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Outstanding summary per customer (for salesperson pre-order check)
CREATE VIEW v_customer_outstanding AS
SELECT
    c.customer_id,
    c.party_name,
    c.gstin,
    fo.party_type,
    COUNT(*)                                        AS bill_count,
    SUM(fo.pending_amount)                          AS total_pending,
    MAX(fo.overdue_days)                            AS max_overdue_days,
    SUM(CASE WHEN fo.overdue_days >= 90 THEN fo.pending_amount ELSE 0 END) AS overdue_90_plus,
    SUM(CASE WHEN fo.overdue_days >= 60
              AND fo.overdue_days < 90 THEN fo.pending_amount ELSE 0 END)  AS overdue_60_89,
    SUM(CASE WHEN fo.overdue_days >= 30
              AND fo.overdue_days < 60 THEN fo.pending_amount ELSE 0 END)  AS overdue_30_59,
    MAX(fo.synced_at)                               AS last_synced_at
FROM   customers c
JOIN   finance_outstanding fo ON fo.party_id = c.customer_id
WHERE  fo.pending_amount > 0
GROUP  BY c.customer_id, c.party_name, c.gstin, fo.party_type;

COMMENT ON VIEW v_customer_outstanding IS 'Per-customer outstanding summary. Use when salesperson is creating a new order to check buyer credit exposure.';

-- ----

-- Active orders with customer and line count
CREATE VIEW v_sales_orders_summary AS
SELECT
    so.order_id,
    so.pi_number,
    fy.fy_label,
    so.order_date,
    so.status,
    buyer.party_name                                AS buyer_name,
    buyer.gstin                                     AS buyer_gstin,
    cons.party_name                                 AS consignee_name,
    ag.agent_name,
    so.total_amount,
    so.gst_type,
    COUNT(sol.line_id)                              AS line_count,
    SUM(sol.qty_kg)                                 AS total_qty_kg,
    so.is_cancelled,
    so.revision_number,
    so.parent_order_id,
    so.created_at
FROM      sales_orders so
JOIN      customers buyer            ON buyer.customer_id   = so.buyer_id
JOIN      customers cons             ON cons.customer_id    = so.consignee_id
JOIN      lookup_financial_years fy  ON fy.fy_key           = so.fy_key
LEFT JOIN catalog_agents ag          ON ag.agent_id         = so.agent_id
LEFT JOIN sales_order_lines sol      ON sol.order_id        = so.order_id
GROUP BY
    so.order_id, so.pi_number, fy.fy_label, so.order_date, so.status,
    buyer.party_name, buyer.gstin, cons.party_name,
    ag.agent_name, so.total_amount, so.gst_type,
    so.is_cancelled, so.revision_number, so.parent_order_id, so.created_at;

COMMENT ON VIEW v_sales_orders_summary IS 'Full sales order summary with buyer, consignee, agent, totals, and line count.';

-- ============================================================
-- SEED DATA
-- ============================================================

-- State codes (all 37 GST states/UTs)
INSERT INTO lookup_state_codes (state_code, state_name, region) VALUES
(1,  'Jammu & Kashmir',       'North'),
(2,  'Himachal Pradesh',      'North'),
(3,  'Punjab',                'North'),
(4,  'Chandigarh',            'North'),
(5,  'Uttarakhand',           'North'),
(6,  'Haryana',               'North'),
(7,  'Delhi',                 'North'),
(8,  'Rajasthan',             'West'),
(9,  'Uttar Pradesh',         'North'),
(10, 'Bihar',                 'East'),
(11, 'Sikkim',                'East'),
(12, 'Arunachal Pradesh',     'East'),
(13, 'Nagaland',              'East'),
(14, 'Manipur',               'East'),
(15, 'Mizoram',               'East'),
(16, 'Tripura',               'East'),
(17, 'Meghalaya',             'East'),
(18, 'Assam',                 'East'),
(19, 'West Bengal',           'East'),
(20, 'Jharkhand',             'East'),
(21, 'Odisha',                'East'),
(22, 'Chhattisgarh',         'Central'),
(23, 'Madhya Pradesh',        'Central'),
(24, 'Gujarat',               'West'),
(25, 'Daman & Diu',           'West'),
(26, 'Dadra & Nagar Haveli',  'West'),
(27, 'Maharashtra',           'West'),
(28, 'Andhra Pradesh',        'South'),
(29, 'Karnataka',             'South'),
(30, 'Goa',                   'West'),
(31, 'Lakshadweep',           'South'),
(32, 'Kerala',                'South'),
(33, 'Tamil Nadu',            'South'),
(34, 'Pondicherry',           'South'),
(35, 'Andaman & Nicobar',     'East'),
(36, 'Telangana',             'South'),
(37, 'Andhra Pradesh (NEW)',  'South');

-- Financial years (historical + current + next)
INSERT INTO lookup_financial_years (fy_key, fy_label, start_date, end_date, is_current) VALUES
(23, '2022-23', '2022-04-01', '2023-03-31', FALSE),
(24, '2023-24', '2023-04-01', '2024-03-31', FALSE),
(25, '2024-25', '2024-04-01', '2025-03-31', FALSE),
(26, '2025-26', '2025-04-01', '2026-03-31', TRUE),
(27, '2026-27', '2026-04-01', '2027-03-31', FALSE);

-- Seed PI sequences for all historical FYs
-- (actual last_seq values to be set during data migration from DATA_GST sheet)
INSERT INTO sales_pi_sequences (fy_key, last_seq) VALUES
(23, 0), (24, 0), (25, 0), (26, 0), (27, 0);

-- Packaging types (from CODES sheet)
INSERT INTO lookup_packaging_types (pkg_name) VALUES
('Drum'),
('Pl. Drum'),
('HDPE Bag'),
('Paper Bag'),
('Pouch Bag'),
('Pouch Pl. Drum'),
('Pouch Box'),
('Bucket'),
('Jumbo Bag'),
('Expt Jumbo Bag'),
('Jar'),
('Bag'),
('Carbo'),
('Canvas Bag');

-- Seed the DIRECT agent
INSERT INTO catalog_agents (agent_name) VALUES ('DIRECT');

-- ============================================================
-- OPEN MERCATO MIGRATION NOTES
-- ============================================================
-- When migrating to Open Mercato:
--
-- 1. catalog_products      → eject the 'catalog' module, map to its
--    catalog_product_variants  Product + ProductVariant entities.
--    Add hs_code, item_type as custom fields or extend the entity.
--
-- 2. customers             → eject the 'customers' module, map to
--    its People/Company entity. tally_ref becomes a custom field.
--
-- 3. sales_orders          → eject the 'sales' module. Map to Order
--    sales_order_lines        + OrderLine. pi_number, fy_key, gst_type,
--    igst_rate, etc. become custom fields on Order.
--
-- 4. finance_outstanding   → build as a custom module. Mercato has
--    no native Tally sync — implement as an event subscriber that
--    ingests Tally CSV exports and upserts rows here.
--
-- 5. lookup_state_codes    → store as a Dictionary in Mercato's
--    dictionaries module (organization-scoped enumeration).
--
-- 6. tenant_id /           → populate from Mercato's directory module
--    organization_id          once the app is registered as a tenant.
--
-- 7. All UUID PKs and snake_case naming are already Mercato-compatible.
--    MikroORM will recognise these tables if entity classes are declared
--    with @Entity({ tableName: '...' }).
-- ============================================================
