import { Router, Request, Response } from 'express';
import { filtersMiddleware } from '../middleware/filters';
import multer from 'multer';
import sql from '../db/client';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/outstanding', filtersMiddleware, async (req: Request, res: Response) => {
  try {
    const partyType = String(req.query.partyType ?? 'debtor');
    const f = req.filters;
    const rows = await sql`
      SELECT c.customer_id, c.party_name, c.gstin,
             COALESCE(vo.total_pending,    0) AS total_pending,
             COALESCE(vo.max_overdue_days, 0) AS max_overdue_days,
             COALESCE(vo.overdue_90_plus,  0) AS overdue_90_plus,
             COALESCE(vo.overdue_60_89,    0) AS overdue_60_89,
             COALESCE(vo.overdue_30_59,    0) AS overdue_30_59,
             COUNT(DISTINCT fo.outstanding_id)::int AS bill_count
      FROM customers c
      JOIN finance_outstanding fo
        ON fo.party_id = c.customer_id
        AND fo.party_type = ${partyType}
        AND fo.pending_amount > 0
        AND (${f.dateFrom}::date IS NULL OR fo.transaction_date >= ${f.dateFrom}::date)
        AND (${f.dateTo}::date IS NULL   OR fo.transaction_date <= ${f.dateTo}::date)
      LEFT JOIN v_customer_outstanding vo ON vo.customer_id = c.customer_id
      WHERE c.deleted_at IS NULL
        AND (${f.customerId}::uuid IS NULL OR c.customer_id = ${f.customerId}::uuid)
      GROUP BY
        c.customer_id, c.party_name, c.gstin,
        vo.total_pending, vo.max_overdue_days,
        vo.overdue_90_plus, vo.overdue_60_89, vo.overdue_30_59
      ORDER BY vo.max_overdue_days DESC NULLS LAST, vo.total_pending DESC
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch outstanding' });
  }
});

router.get('/outstanding/summary', async (req: Request, res: Response) => {
  try {
    const partyType = String(req.query.partyType ?? 'debtor');
    const [kpis, syncRow] = await Promise.all([
      sql`
        SELECT
          COALESCE(SUM(pending_amount), 0) AS total_pending,
          COALESCE(SUM(CASE WHEN overdue_days >= 90 THEN pending_amount END), 0) AS bucket_90plus,
          COALESCE(SUM(CASE WHEN overdue_days >= 60 AND overdue_days < 90 THEN pending_amount END), 0) AS bucket_60_89,
          COALESCE(SUM(CASE WHEN overdue_days >= 30 AND overdue_days < 60 THEN pending_amount END), 0) AS bucket_30_59
        FROM finance_outstanding
        WHERE party_type = ${partyType} AND pending_amount > 0
      `,
      sql`SELECT MAX(synced_at) AS last_synced_at FROM finance_outstanding`,
    ]);
    res.json({ ...kpis[0], lastSyncedAt: syncRow[0].last_synced_at ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const ackParam = req.query.acknowledged;
    const onlyUnack = ackParam === 'false';
    const onlyAck   = ackParam === 'true';
    const thresholdDays = req.query.thresholdDays ? parseInt(String(req.query.thresholdDays), 10) : null;
    const rows = await sql`
      SELECT a.alert_id, a.outstanding_id, a.overdue_days, a.pending_amount,
             a.threshold_days, a.is_acknowledged, a.acknowledged_by, a.acknowledged_at,
             a.triggered_at, c.party_name, c.customer_id
      FROM finance_outstanding_alerts a
      JOIN customers c ON c.customer_id = a.party_id
      WHERE (NOT ${onlyUnack} OR a.is_acknowledged = false)
        AND (NOT ${onlyAck}   OR a.is_acknowledged = true)
        AND (${thresholdDays}::int IS NULL OR a.threshold_days = ${thresholdDays}::int)
      ORDER BY a.triggered_at DESC
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.patch('/alerts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_acknowledged, acknowledged_by } = req.body;
  try {
    const rows = await sql`
      UPDATE finance_outstanding_alerts SET
        is_acknowledged = ${is_acknowledged},
        acknowledged_by = ${acknowledged_by ?? null},
        acknowledged_at = CASE WHEN ${is_acknowledged} = true THEN NOW() ELSE NULL END
      WHERE alert_id = ${id}
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

router.post('/sync', upload.single('file') as any, async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const XLSX = await import('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (rawRows.length === 0) return res.status(400).json({ error: 'No data found in file' });

    await sql`DELETE FROM finance_outstanding WHERE 1=1`;

    const syncedAt = new Date();
    let inserted = 0;

    for (const row of rawRows) {
      const partyName = row['Party Name'] ?? row['party_name'];
      if (!partyName) continue;

      const customer = await sql`
        SELECT customer_id FROM customers WHERE party_name = ${partyName} AND deleted_at IS NULL LIMIT 1
      `;
      if (customer.length === 0) continue;

      await sql`
        INSERT INTO finance_outstanding (
          party_id, party_type, ref_number, tally_voucher_ref,
          transaction_type, transaction_date, due_date,
          opening_amount, pending_amount, overdue_days, synced_at
        ) VALUES (
          ${customer[0].customer_id},
          ${row['Party Type'] ?? 'debtor'},
          ${row['Ref No'] ?? row['ref_number'] ?? null},
          ${row['Voucher Ref'] ?? null},
          ${row['Transaction Type'] ?? row['transaction_type'] ?? null},
          ${row['Date'] ?? row['transaction_date'] ?? null},
          ${row['Due Date'] ?? row['due_date'] ?? null},
          ${parseFloat(row['Opening Amount'] ?? row['opening_amount'] ?? '0') || 0},
          ${parseFloat(row['Pending Amount'] ?? row['pending_amount'] ?? '0') || 0},
          ${parseInt(row['Overdue Days'] ?? row['overdue_days'] ?? '0') || 0},
          ${syncedAt}
        )
      `;
      inserted++;
    }

    res.json({ inserted, syncedAt: syncedAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sync Tally data' });
  }
});

export default router;
