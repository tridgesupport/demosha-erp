#!/usr/bin/env python3
"""
Company ABC — Excel → PostgreSQL Migration Script (Hardened)
Skips any bad row with a warning. Never crashes.
"""

import os, re, sys, uuid, logging
from datetime import datetime, date
from decimal import Decimal, InvalidOperation

import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DB_URL          = os.getenv("DATABASE_URL")
XLS_FILE        = os.getenv("XLS_FILE",  "Proforma_Invoice_22_25.xls")
XLSX_FILE       = os.getenv("XLSX_FILE", "OUT_STANDING.xlsx")
TENANT_ID       = os.getenv("TENANT_ID",       "openmercato")
ORGANIZATION_ID = os.getenv("ORGANIZATION_ID", "openmercato-main")

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

skipped_rows = []

def uid(): return str(uuid.uuid4())

def clean(val):
    if val is None or (isinstance(val, float) and np.isnan(val)): return None
    s = str(val).strip()
    return s if s and s.lower() not in ("nan","none","nat","") else None

def to_dec(val, default=0):
    try:
        s = str(val).strip()
        if not s or s.lower() in ("nan","none"): return Decimal(str(default))
        return Decimal(s)
    except InvalidOperation:
        return Decimal(str(default))

def to_int(val, default=0):
    try:
        v = float(val)
        return default if np.isnan(v) else int(v)
    except: return default

def to_date(val):
    if val is None: return None
    if isinstance(val, (datetime, pd.Timestamp)): return val.date()
    if isinstance(val, date): return val
    s = str(val).strip()
    for wrong, right in [('N0v','Nov'),('0ct','Oct'),('0ec','Dec'),('Ju1','Jul'),('Ap1','Apr')]:
        s = s.replace(wrong, right)
    try: return pd.to_datetime(s, dayfirst=True).date()
    except: return None

def parse_hs_item(raw):
    raw = str(raw).strip().strip("()")
    m = re.search(r"(\d{8})\s*[-]\s*(.+)", raw)
    if m: return m.group(1).strip(), m.group(2).strip()
    m = re.search(r"(.+?)\s*\((\d{8})\)", raw)
    if m: return m.group(2).strip(), m.group(1).strip()
    return None, raw.strip("()")

def clean_pkg(raw): return str(raw).strip().strip("()")
def fy_key_from_label(label):
    m = re.search(r"(\d{2,4})[-_](\d{2,4})", str(label))
    return int(str(m.group(2))[-2:]) if m else None

def get_conn():
    """Connection with TCP keepalives to survive Neon idle timeouts."""
    conn = psycopg2.connect(
        DB_URL,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
        connect_timeout=30,
    )
    conn.autocommit = False
    return conn

def safe_execute(cur, sql, params, context=""):
    try:
        cur.execute(sql, params)
        return True
    except psycopg2.OperationalError as e:
        # Connection dropped — propagate so caller can reconnect
        raise
    except Exception as e:
        skipped_rows.append(f"{context}: {str(e)[:120]}")
        try:
            cur.execute("ROLLBACK TO SAVEPOINT sp")
        except Exception:
            pass
        return False

def migrate_packaging_types(cur, codes_df):
    log.info("Step 1 — Packaging types")
    raw_pkgs = set()
    for _, row in codes_df.iterrows():
        pkg = clean(row[4])
        if pkg: raw_pkgs.add(clean_pkg(pkg))
    for pkg in sorted(raw_pkgs):
        cur.execute("SAVEPOINT sp")
        safe_execute(cur, "INSERT INTO lookup_packaging_types (pkg_name) VALUES (%s) ON CONFLICT (pkg_name) DO NOTHING", (pkg,), f"pkg:{pkg}")
    cur.execute("SELECT pkg_id, pkg_name FROM lookup_packaging_types")
    result = {r["pkg_name"]: r["pkg_id"] for r in cur.fetchall()}
    log.info("  ✓ %d packaging types", len(result))
    return result

def migrate_products(cur, codes_df, pkg_map):
    log.info("Step 2 — Products & variants")
    product_map = {}

    def get_or_create_product(name, hs_code):
        if name in product_map: return product_map[name]
        pid = uid()
        cur.execute("SAVEPOINT sp")
        cur.execute("INSERT INTO catalog_products (product_id,product_name,hs_code,item_type,tenant_id,organization_id) VALUES (%s,%s,%s,'finished_goods',%s,%s) ON CONFLICT DO NOTHING RETURNING product_id",
                    (pid, name, hs_code, TENANT_ID, ORGANIZATION_ID))
        row = cur.fetchone()
        if not row:
            cur.execute("SELECT product_id FROM catalog_products WHERE product_name=%s", (name,))
            row = cur.fetchone()
        if row: product_map[name] = row["product_id"]
        return product_map.get(name)

    variant_map = {}
    for _, row in codes_df.iterrows():
        code_id_raw = row[0]
        if pd.isna(code_id_raw): continue
        legacy_code_id = to_int(code_id_raw)
        if legacy_code_id == 0: continue
        raw_item = clean(row[1])
        if not raw_item: continue
        hs_code, product_name = parse_hs_item(raw_item)
        if not product_name or not product_name.strip(): continue
        grade     = clean(row[2])
        qty       = to_int(row[3], 0)
        raw_pkg   = clean(row[4])
        full_desc = clean(row[5])
        pkg_name  = clean_pkg(raw_pkg) if raw_pkg else None
        pkg_id    = pkg_map.get(pkg_name) if pkg_name and pkg_name not in ("","0") else None
        qty_val   = qty if qty and qty > 0 else None
        product_id = get_or_create_product(product_name, hs_code)
        if not product_id: continue
        vid = uid()
        cur.execute("SAVEPOINT sp")
        cur.execute("INSERT INTO catalog_product_variants (variant_id,product_id,legacy_code_id,grade,qty_per_pkg,pkg_id,full_description,is_active,tenant_id,organization_id) VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE,%s,%s) ON CONFLICT (legacy_code_id) DO NOTHING RETURNING variant_id",
                    (vid, product_id, legacy_code_id, grade, qty_val, pkg_id, full_desc, TENANT_ID, ORGANIZATION_ID))
        fetched = cur.fetchone()
        if not fetched:
            cur.execute("SELECT variant_id FROM catalog_product_variants WHERE legacy_code_id=%s", (legacy_code_id,))
            fetched = cur.fetchone()
        if fetched: variant_map[legacy_code_id] = fetched["variant_id"]

    log.info("  ✓ %d products, %d variants", len(product_map), len(variant_map))
    return variant_map

def migrate_agents(cur, gst_df):
    log.info("Step 3 — Agents")
    agent_map = {}
    for name in sorted(set((clean(r[14]) or "").upper() for _, r in gst_df.iterrows() if clean(r[14]))):
        aid = uid()
        cur.execute("SAVEPOINT sp")
        cur.execute("INSERT INTO catalog_agents (agent_id,agent_name,tenant_id,organization_id) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING agent_id",
                    (aid, name, TENANT_ID, ORGANIZATION_ID))
        row = cur.fetchone()
        if not row:
            cur.execute("SELECT agent_id FROM catalog_agents WHERE UPPER(agent_name)=%s", (name,))
            row = cur.fetchone()
        if row: agent_map[name] = row["agent_id"]
    log.info("  ✓ %d agents", len(agent_map))
    return agent_map

def migrate_customers(cur, gst_df):
    log.info("Step 4 — Customers")
    parties = {}
    def add(name, addr, state, gstin):
        name = (name or "").strip(); gstin = (gstin or "").strip()
        key = (name.upper(), gstin.upper())
        if key not in parties and name:
            parties[key] = {"party_name":name,"primary_address":addr,
                            "primary_state_code":to_int(state) if state else None,"gstin":gstin or None}
    for _, row in gst_df.iterrows():
        add(clean(row[6]), clean(row[7]), row[8], clean(row[9]))
        add(clean(row[10]),clean(row[11]),row[12],clean(row[13]))
    customer_map = {}
    for key, p in parties.items():
        if not p["party_name"]: continue
        cid = uid()
        cur.execute("SAVEPOINT sp")
        cur.execute("INSERT INTO customers (customer_id,party_name,gstin,primary_state_code,primary_address,tenant_id,organization_id) VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING customer_id",
                    (cid,p["party_name"],p["gstin"],p["primary_state_code"],p["primary_address"],TENANT_ID,ORGANIZATION_ID))
        row = cur.fetchone()
        if not row:
            cur.execute("SELECT customer_id FROM customers WHERE UPPER(party_name)=%s AND (gstin=%s OR (gstin IS NULL AND %s IS NULL)) LIMIT 1",
                        (key[0],p["gstin"],p["gstin"]))
            row = cur.fetchone()
        if row: customer_map[key] = row["customer_id"]
    log.info("  ✓ %d customers", len(customer_map))
    return customer_map

def migrate_sales_orders(conn, gst_df, customer_map, agent_map, variant_map):
    """Inserts orders in batches of 200, committing after each batch.
    Reconnects automatically if Neon drops the connection mid-run."""
    log.info("Step 5 — Sales orders & lines")
    BATCH_SIZE = 200

    def lookup_customer(name, gstin):
        name=(name or "").strip().upper(); gstin=(gstin or "").strip().upper()
        if (name,gstin) in customer_map: return customer_map[(name,gstin)]
        for (n,_),cid in customer_map.items():
            if n==name: return cid
        return None

    # Load existing PI numbers so we skip already-migrated rows
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT pi_number,order_id FROM sales_orders")
        pi_to_order_id = {r["pi_number"]:r["order_id"] for r in cur.fetchall()}
    existing_pi = set(pi_to_order_id.keys())

    rows_data = [row for _,row in gst_df.iterrows()
                 if clean(row[0]) and clean(row[0]) not in ("0","No.")]
    rows_data.sort(key=lambda r: str(clean(r[0]) or ""))

    oi = li = os_ = ls = 0
    batch_n = 0

    for i, row in enumerate(rows_data):
        pi_number    = str(clean(row[0])).strip()
        fy_label     = clean(row[1])
        seq_number   = to_int(row[2])
        is_revised   = to_int(row[3])==1
        is_cancelled = to_int(row[4])==1

        if pi_number in existing_pi: continue

        fy_key = fy_key_from_label(fy_label)
        if not fy_key:
            skipped_rows.append(f"order:{pi_number} — bad FY '{fy_label}'"); os_+=1; continue

        buyer_id     = lookup_customer(clean(row[6]), clean(row[9]))
        consignee_id = lookup_customer(clean(row[10]),clean(row[13])) or buyer_id
        agent_id     = agent_map.get((clean(row[14]) or "").upper())

        if not buyer_id:
            skipped_rows.append(f"order:{pi_number} — buyer '{clean(row[6])}' not found")
            os_+=1; continue

        igst_rate = to_dec(row[21],0); cgst_rate = to_dec(row[22],0)
        gst_type  = "IGST" if igst_rate>0 or cgst_rate==0 else "CGST_SGST"
        parent_order_id = pi_to_order_id.get(str(fy_key*10000+seq_number-1)) if is_revised else None
        order_id = uid()

        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SAVEPOINT sp")
            ok = safe_execute(cur, """
                INSERT INTO sales_orders (
                    order_id,pi_number,fy_key,seq_number,order_date,buyer_order_date,buyer_po_number,
                    buyer_id,buyer_address,buyer_gstin,buyer_state_code,
                    consignee_id,consignee_address,consignee_gstin,consignee_state_code,
                    agent_id,payment_terms,freight_desc,freight_per_kg,insurance_pct,schedule_notes,
                    gst_type,igst_rate,cgst_rate,tcs_rate,status,parent_order_id,revision_number,
                    is_cancelled,tenant_id,organization_id
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (pi_number) DO NOTHING RETURNING order_id
            """, (order_id,pi_number,fy_key,seq_number,
                  to_date(row[5]),to_date(row[16]),clean(row[15]),
                  buyer_id,clean(row[7]),clean(row[9]),to_int(row[8]) or None,
                  consignee_id,clean(row[11]),clean(row[13]),to_int(row[12]) or None,
                  agent_id,clean(row[20]),clean(row[19]),
                  float(to_dec(row[18],0)),float(to_dec(row[17],0)),clean(row[24]),
                  gst_type,float(igst_rate),float(cgst_rate),float(to_dec(row[23],0)),
                  "cancelled" if is_cancelled else ("draft" if is_revised else "invoiced"),
                  parent_order_id,1 if is_revised else 0,is_cancelled,
                  TENANT_ID,ORGANIZATION_ID), f"order:{pi_number}")

            if not ok: os_+=1; cur.close(); continue

            fetched = cur.fetchone()
            actual_order_id = fetched["order_id"] if fetched else order_id
            pi_to_order_id[pi_number] = actual_order_id
            existing_pi.add(pi_number)
            oi+=1

            line_number=0
            for slot in range(10):
                base=25+slot*3
                pkg_code=to_int(row[base],0); qty_kg=to_dec(row[base+1],0); rate=to_dec(row[base+2],0)
                if pkg_code==0 or qty_kg==0: continue
                variant_id=variant_map.get(pkg_code)
                if not variant_id:
                    skipped_rows.append(f"line:{pi_number}:slot{slot+1} — unknown variant {pkg_code}"); ls+=1; continue
                cur.execute("SELECT qty_per_pkg FROM catalog_product_variants WHERE variant_id=%s",(variant_id,))
                vrow=cur.fetchone(); qpp=vrow["qty_per_pkg"] if vrow and vrow["qty_per_pkg"] else None
                num_pkg=int(float(qty_kg)/qpp) if qpp and qpp>0 else 0
                line_amount=round((float(qty_kg)/1000.0)*float(rate),2)
                line_number+=1
                cur.execute("SAVEPOINT sp")
                ok2=safe_execute(cur, """
                    INSERT INTO sales_order_lines
                        (line_id,order_id,line_number,variant_id,num_packages,qty_kg,rate_per_mt,line_amount,tenant_id,organization_id)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING
                """, (uid(),actual_order_id,line_number,variant_id,num_pkg,float(qty_kg),float(rate),line_amount,TENANT_ID,ORGANIZATION_ID),
                f"line:{pi_number}:slot{slot+1}")
                if ok2: li+=1
                else: ls+=1

            cur.close()
            batch_n += 1

            # Commit every BATCH_SIZE orders to avoid timeout
            if batch_n >= BATCH_SIZE:
                conn.commit()
                log.info("  … committed batch (%d orders so far)", oi)
                batch_n = 0

        except psycopg2.OperationalError as e:
            log.warning("  Connection lost at PI %s — reconnecting...", pi_number)
            try: conn.close()
            except: pass
            import time; time.sleep(2)
            conn = get_conn()
            skipped_rows.append(f"order:{pi_number} — reconnected after timeout, row skipped")
            os_+=1; batch_n=0
            continue

    # Final commit and PI sequence sync
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO sales_pi_sequences (fy_key,last_seq)
            SELECT fy_key,MAX(seq_number) FROM sales_orders GROUP BY fy_key
            ON CONFLICT (fy_key) DO UPDATE SET last_seq=GREATEST(sales_pi_sequences.last_seq,EXCLUDED.last_seq)
        """)
    conn.commit()
    log.info("  ✓ %d orders, %d lines inserted | ⚠ %d orders, %d lines skipped", oi, li, os_, ls)
    return conn  # return potentially-reconnected conn

def migrate_outstanding(cur, xlsx_path, customer_map):
    log.info("Step 6 — Outstanding")
    xl = pd.ExcelFile(xlsx_path, engine="openpyxl")
    cur.execute("DELETE FROM finance_outstanding_alerts")
    cur.execute("DELETE FROM finance_outstanding")
    total=0
    for sheet_name, party_type in {"Sundry Debtors":"debtor","Sundry Creditors":"creditor"}.items():
        if sheet_name not in xl.sheet_names: continue
        df=pd.read_excel(xl, sheet_name=sheet_name, header=None)
        def find_customer(name):
            name=(name or "").strip().upper()
            if not name: return None
            for (n,_),cid in customer_map.items():
                if n==name: return cid
            for (n,_),cid in customer_map.items():
                if n and (n in name or name in n): return cid
            cid=uid(); cur.execute("SAVEPOINT sp")
            cur.execute("INSERT INTO customers (customer_id,party_name,tenant_id,organization_id) VALUES (%s,%s,%s,%s) RETURNING customer_id",
                        (cid,name.title(),TENANT_ID,ORGANIZATION_ID))
            r=cur.fetchone(); cid=r["customer_id"] if r else cid
            customer_map[(name,"")]=cid; return cid
        current_cid=None; rows_done=0
        for idx,row in df.iterrows():
            if idx<5: continue
            date_val=clean(row[0]); ref_num=clean(row[1]); party_col=clean(row[2])
            if party_col and not date_val and not ref_num:
                current_cid=find_customer(party_col); continue
            if not date_val or not current_cid: continue
            if party_type=="creditor":
                txn_type=clean(row[2]); tally_ref=clean(row[3]); pending_amt=to_dec(row[4],0)
                opening_amt=to_dec(row[6],0); due_raw=clean(row[8]); overdue=to_int(row[9],0)
            else:
                txn_type=None; tally_ref=ref_num; opening_amt=to_dec(row[3],0)
                pending_amt=to_dec(row[4],0); due_raw=clean(row[5]); overdue=to_int(row[6],0)
            if pending_amt==0 and opening_amt==0: continue
            cur.execute("SAVEPOINT sp")
            safe_execute(cur, """
                INSERT INTO finance_outstanding (outstanding_id,party_id,party_type,ref_number,tally_voucher_ref,transaction_type,transaction_date,due_date,opening_amount,pending_amount,overdue_days,synced_at,tenant_id,organization_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s,%s)
            """, (uid(),current_cid,party_type,ref_num,tally_ref,txn_type,to_date(date_val),to_date(due_raw),
                  float(opening_amt),float(pending_amt),overdue,TENANT_ID,ORGANIZATION_ID), f"outstanding:{idx}")
            rows_done+=1
        log.info("  ✓ %s: %d records", sheet_name, rows_done); total+=rows_done
    log.info("  ✓ Total outstanding: %d", total)

def compute_order_totals(cur):
    log.info("Step 7 — Computing totals")
    cur.execute("""
        UPDATE sales_orders so SET
            gross_value=COALESCE(l.gross,0),
            insurance_amount=ROUND(COALESCE(l.gross,0)*so.insurance_pct,2),
            assessable_value=ROUND(COALESCE(l.gross,0)*(1+so.insurance_pct+so.freight_per_kg/1000),2),
            igst_amount=CASE WHEN so.gst_type='IGST' THEN ROUND(COALESCE(l.gross,0)*(1+so.insurance_pct+so.freight_per_kg/1000)*so.igst_rate,2) ELSE 0 END,
            cgst_amount=CASE WHEN so.gst_type='CGST_SGST' THEN ROUND(COALESCE(l.gross,0)*(1+so.insurance_pct+so.freight_per_kg/1000)*so.cgst_rate,2) ELSE 0 END,
            sgst_amount=CASE WHEN so.gst_type='CGST_SGST' THEN ROUND(COALESCE(l.gross,0)*(1+so.insurance_pct+so.freight_per_kg/1000)*so.cgst_rate,2) ELSE 0 END,
            updated_at=NOW()
        FROM (SELECT order_id,SUM(line_amount) AS gross FROM sales_order_lines GROUP BY order_id) l
        WHERE so.order_id=l.order_id
    """)
    cur.execute("""
        UPDATE sales_orders SET
            tcs_amount=ROUND(assessable_value*tcs_rate,2),
            total_amount=ROUND(assessable_value+igst_amount+cgst_amount+sgst_amount+ROUND(assessable_value*tcs_rate,2),2),
            updated_at=NOW()
        WHERE gross_value>0
    """)
    log.info("  ✓ Done")

def print_report(cur):
    log.info("\n"+"="*60)
    log.info("MIGRATION REPORT")
    log.info("="*60)
    for label,sql in [
        ("Packaging types","SELECT COUNT(*) FROM lookup_packaging_types"),
        ("Products","SELECT COUNT(*) FROM catalog_products"),
        ("Product variants","SELECT COUNT(*) FROM catalog_product_variants"),
        ("Agents","SELECT COUNT(*) FROM catalog_agents"),
        ("Customers","SELECT COUNT(*) FROM customers"),
        ("Sales orders","SELECT COUNT(*) FROM sales_orders"),
        ("  — Cancelled","SELECT COUNT(*) FROM sales_orders WHERE is_cancelled"),
        ("  — Revised","SELECT COUNT(*) FROM sales_orders WHERE revision_number>0"),
        ("Order lines","SELECT COUNT(*) FROM sales_order_lines"),
        ("Orders with totals>0","SELECT COUNT(*) FROM sales_orders WHERE total_amount>0"),
        ("Outstanding debtors","SELECT COUNT(*) FROM finance_outstanding WHERE party_type='debtor'"),
        ("Outstanding creditors","SELECT COUNT(*) FROM finance_outstanding WHERE party_type='creditor'"),
        ("Overdue alerts","SELECT COUNT(*) FROM finance_outstanding_alerts"),
    ]:
        cur.execute(sql); log.info("  %-30s %d", label, cur.fetchone()[0])
    if skipped_rows:
        log.info("\n  ⚠ SKIPPED (%d total):", len(skipped_rows))
        for s in skipped_rows[:20]: log.info("    – %s", s)
        if len(skipped_rows)>20: log.info("    … and %d more", len(skipped_rows)-20)
    else:
        log.info("\n  ✓ Zero rows skipped — clean migration!")

def main():
    log.info("="*60+"\nCompany ABC — Migration (Hardened)\n"+"="*60)
    if not DB_URL: log.error("DATABASE_URL not set in .env"); sys.exit(1)
    log.info("Loading Excel files...")
    try:
        xl=pd.ExcelFile(XLS_FILE,engine="xlrd")
        codes_df=pd.read_excel(xl,sheet_name="CODES",header=None).iloc[1:]
        gst_df=pd.read_excel(xl,sheet_name="DATA_GST",header=None).iloc[2:]
        gst_df=gst_df[gst_df[0].notna()]
        gst_df=gst_df[~gst_df[0].astype(str).str.strip().isin(["0","No."])]
        log.info("  Loaded %d PI records", len(gst_df))
    except FileNotFoundError as e: log.error("File not found: %s",e); sys.exit(1)
    conn=get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SAVEPOINT sp")
            pkg_map=migrate_packaging_types(cur,codes_df); conn.commit()
            variant_map=migrate_products(cur,codes_df,pkg_map); conn.commit()
            agent_map=migrate_agents(cur,gst_df); conn.commit()
            customer_map=migrate_customers(cur,gst_df); conn.commit()
            conn=migrate_sales_orders(conn,gst_df,customer_map,agent_map,variant_map)
            migrate_outstanding(cur,XLSX_FILE,customer_map); conn.commit()
            compute_order_totals(cur); conn.commit()
            print_report(cur)
        log.info("\n✅  Migration complete.")
    except Exception as e:
        conn.rollback(); log.exception("❌  Unexpected crash: %s",e); sys.exit(1)
    finally:
        conn.close()

if __name__=="__main__":
    main()
