-- Drop tenant_id / organization_id columns.
--
-- These appeared on every row of 11 tables holding 'openmercato' /
-- 'openmercato-main' literal strings (customers, sales_orders,
-- sales_order_lines, catalog_products, catalog_product_variants,
-- catalog_agents, purchase_orders, purchase_indents, purchase_items,
-- finance_outstanding, finance_outstanding_alerts). Nothing in
-- apps/api/src or apps/web/src reads or writes either column anywhere —
-- confirmed by grep across both apps before writing this migration. This
-- app is single-tenant; there is no multi-tenancy code path these support.
-- Best guess: leftover from whatever scaffold/tool produced the original
-- schema and bulk data import (name suggests the "OpenMercato" open-source
-- commerce/ERP starter), never wired up, never cleaned out.

ALTER TABLE customers                  DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE sales_orders               DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE sales_order_lines          DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE catalog_products           DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE catalog_product_variants   DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE catalog_agents             DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE purchase_orders            DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE purchase_indents           DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE purchase_items             DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE finance_outstanding        DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
ALTER TABLE finance_outstanding_alerts DROP COLUMN IF EXISTS tenant_id, DROP COLUMN IF EXISTS organization_id;
