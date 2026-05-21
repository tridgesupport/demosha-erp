import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import sql from '../db/client';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const search = req.query.search ? `%${String(req.query.search)}%` : null;
  const page   = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
  const limit  = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? '200'), 10)));
  const offset = (page - 1) * limit;

  try {
    const [rows, countRows] = await Promise.all([
      sql`
        SELECT vendor_id, vendor_name, addr1, addr2, city, pincode, state, country,
               phone, mobile, email, attn, gstin, is_active
        FROM vendors
        WHERE deleted_at IS NULL
          AND (${search}::text IS NULL
               OR vendor_name ILIKE ${search}::text
               OR city        ILIKE ${search}::text
               OR gstin       ILIKE ${search}::text)
        ORDER BY vendor_name
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS total FROM vendors
        WHERE deleted_at IS NULL
          AND (${search}::text IS NULL
               OR vendor_name ILIKE ${search}::text
               OR city        ILIKE ${search}::text
               OR gstin       ILIKE ${search}::text)
      `,
    ]);
    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT * FROM vendors WHERE vendor_id = ${req.params.id} AND deleted_at IS NULL
    `;
    if (!rows.length) return res.status(404).json({ error: 'Vendor not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { vendor_name, addr1, addr2, city, pincode, state, country,
          phone, mobile, email, attn, gstin, notes } = req.body;
  if (!vendor_name?.trim()) return res.status(400).json({ error: 'vendor_name is required' });
  try {
    const rows = await sql`
      INSERT INTO vendors (vendor_name, addr1, addr2, city, pincode, state, country,
                           phone, mobile, email, attn, gstin, notes)
      VALUES (
        ${vendor_name.trim()},
        ${addr1  ?? null}, ${addr2    ?? null}, ${city    ?? null},
        ${pincode ?? null}, ${state   ?? null}, ${country ?? 'India'},
        ${phone  ?? null}, ${mobile   ?? null}, ${email   ?? null},
        ${attn   ?? null}, ${gstin    ?? null}, ${notes   ?? null}
      )
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const { vendor_name, addr1, addr2, city, pincode, state, country,
          phone, mobile, email, attn, gstin, notes, is_active } = req.body;
  if (!vendor_name?.trim()) return res.status(400).json({ error: 'vendor_name is required' });
  try {
    const rows = await sql`
      UPDATE vendors SET
        vendor_name = ${vendor_name.trim()},
        addr1       = ${addr1    ?? null},
        addr2       = ${addr2    ?? null},
        city        = ${city     ?? null},
        pincode     = ${pincode  ?? null},
        state       = ${state    ?? null},
        country     = ${country  ?? 'India'},
        phone       = ${phone    ?? null},
        mobile      = ${mobile   ?? null},
        email       = ${email    ?? null},
        attn        = ${attn     ?? null},
        gstin       = ${gstin    ?? null},
        notes       = ${notes    ?? null},
        is_active   = ${is_active ?? true},
        updated_at  = NOW()
      WHERE vendor_id = ${req.params.id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: 'Vendor not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

export default router;
