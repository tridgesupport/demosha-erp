import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { randomBytes } from 'crypto';
import sql from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadToImagekit } from '../lib/imagekit';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function signToken(user: any) {
  return jwt.sign(
    { user_id: user.user_id, email: user.email, role: user.role, name: user.name, signature_url: user.signature_url ?? null },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );
}

function frontendUrl() {
  return (process.env.FRONTEND_URL ?? 'http://localhost:5173').trim();
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} AND deleted_at IS NULL`;
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const tabRows = await sql`SELECT tab FROM role_tab_permissions WHERE role = ${user.role} ORDER BY tab`;
    const allowed_tabs = tabRows.map((r: any) => r.tab);
    res.json({
      token: signToken(user),
      user: {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        role: user.role,
        signature_url: user.signature_url,
        allowed_tabs,
        must_change_password: user.must_change_password ?? false,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT u.user_id, u.email, u.name, u.role, u.signature_url, u.must_change_password,
        COALESCE(
          array_agg(rtp.tab ORDER BY rtp.tab) FILTER (WHERE rtp.tab IS NOT NULL),
          ARRAY[]::text[]
        ) AS allowed_tabs
      FROM users u
      LEFT JOIN role_tab_permissions rtp ON rtp.role = u.role
      WHERE u.user_id = ${req.user!.user_id} AND u.deleted_at IS NULL
      GROUP BY u.user_id, u.email, u.name, u.role, u.signature_url, u.must_change_password
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PATCH /api/auth/password  (change own password while logged in)
router.patch('/password', requireAuth, async (req: Request, res: Response) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const rows = await sql`SELECT * FROM users WHERE user_id = ${req.user!.user_id}`;
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    await sql`UPDATE users SET password_hash = ${hash}, must_change_password = false WHERE user_id = ${req.user!.user_id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// PATCH /api/auth/force-change-password  (first-login forced change, no current password needed)
router.patch('/force-change-password', requireAuth, async (req: Request, res: Response) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = await bcrypt.hash(new_password, 10);
    await sql`UPDATE users SET password_hash = ${hash}, must_change_password = false WHERE user_id = ${req.user!.user_id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/forgot-password  (public — generates a reset token)
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const users = await sql`SELECT user_id FROM users WHERE email = ${email.toLowerCase()} AND deleted_at IS NULL`;
    if (users.length === 0) {
      // Don't reveal whether the email exists; but for internal apps return a hint
      return res.json({ success: true, reset_url: null });
    }
    const token = randomBytes(32).toString('hex');
    await sql`DELETE FROM password_reset_tokens WHERE user_id = ${users[0].user_id}`;
    await sql`INSERT INTO password_reset_tokens (user_id, token) VALUES (${users[0].user_id}, ${token})`;
    const reset_url = `${frontendUrl()}/reset-password?token=${token}`;
    res.json({ success: true, reset_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password  (public — validates token and sets new password)
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) return res.status(400).json({ error: 'Token and new password required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const rows = await sql`
      SELECT prt.user_id FROM password_reset_tokens prt
      JOIN users u ON u.user_id = prt.user_id
      WHERE prt.token = ${token}
        AND prt.used_at IS NULL
        AND prt.expires_at > NOW()
        AND u.deleted_at IS NULL
    `;
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset link' });
    const hash = await bcrypt.hash(new_password, 10);
    await sql`UPDATE users SET password_hash = ${hash}, must_change_password = false WHERE user_id = ${rows[0].user_id}`;
    await sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE token = ${token}`;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// PATCH /api/auth/users/:id/signature
router.patch('/users/:id/signature', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (req.user!.user_id !== req.params.id && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `sig_${req.params.id}`, 'signatures');
    await sql`UPDATE users SET signature_url = ${url}, signature_file_id = ${fileId} WHERE user_id = ${req.params.id}`;
    res.json({ signature_url: url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload signature' });
  }
});

// GET /api/auth/users  (admin only)
router.get('/users', requireAuth, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT u.user_id, u.email, u.name, u.role, u.created_at, u.must_change_password,
        (SELECT COUNT(*)::int FROM password_reset_tokens prt
          WHERE prt.user_id = u.user_id AND prt.used_at IS NULL AND prt.expires_at > NOW()) AS pending_reset
      FROM users u
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/auth/register  (admin only)
router.post('/register', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  const role = req.body.role?.toLowerCase();
  if (!email || !name || !role || !password) return res.status(400).json({ error: 'All fields required' });
  if (!['admin', 'manager', 'salesperson', 'factory'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (email, name, role, password_hash, must_change_password)
      VALUES (${email.toLowerCase()}, ${name}, ${role}, ${hash}, true)
      RETURNING user_id, email, name, role, created_at, must_change_password
    `;
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// DELETE /api/auth/users/:id  (admin only)
router.delete('/users/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  if (req.params.id === req.user!.user_id) return res.status(400).json({ error: 'Cannot delete yourself' });
  try {
    await sql`UPDATE users SET deleted_at = NOW() WHERE user_id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// PATCH /api/auth/users/:id/role  (admin only)
router.patch('/users/:id/role', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const role = req.body.role?.toLowerCase();
  if (!['admin', 'manager', 'salesperson', 'factory'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (req.params.id === req.user!.user_id) return res.status(400).json({ error: 'Cannot change your own role' });
  try {
    await sql`UPDATE users SET role = ${role} WHERE user_id = ${req.params.id} AND deleted_at IS NULL`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// PATCH /api/auth/users/:id/reset-password  (admin only)
router.patch('/users/:id/reset-password', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = await bcrypt.hash(new_password, 10);
    await sql`UPDATE users SET password_hash = ${hash}, must_change_password = true WHERE user_id = ${req.params.id} AND deleted_at IS NULL`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// PATCH /api/auth/users/:id/must-change-password  (admin only — flag user to change on next login)
router.patch('/users/:id/must-change-password', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await sql`UPDATE users SET must_change_password = true WHERE user_id = ${req.params.id} AND deleted_at IS NULL`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update flag' });
  }
});

// POST /api/auth/users/:id/reset-link  (admin only — generates a shareable reset link)
router.post('/users/:id/reset-link', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const check = await sql`SELECT user_id FROM users WHERE user_id = ${req.params.id} AND deleted_at IS NULL`;
    if (!check.length) return res.status(404).json({ error: 'User not found' });
    const token = randomBytes(32).toString('hex');
    await sql`DELETE FROM password_reset_tokens WHERE user_id = ${req.params.id}`;
    await sql`INSERT INTO password_reset_tokens (user_id, token) VALUES (${req.params.id}, ${token})`;
    const reset_url = `${frontendUrl()}/reset-password?token=${token}`;
    res.json({ reset_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate reset link' });
  }
});

const VALID_ROLES = ['admin', 'manager', 'salesperson', 'factory'];
const VALID_TABS  = ['sales', 'purchase', 'management'];

// GET /api/auth/tab-permissions  (admin only)
router.get('/tab-permissions', requireAuth, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const rows = await sql`SELECT role, tab FROM role_tab_permissions ORDER BY role, tab`;
    const result: Record<string, Record<string, boolean>> = {};
    for (const r of VALID_ROLES) {
      result[r] = {};
      for (const t of VALID_TABS) result[r][t] = false;
    }
    for (const row of rows as any[]) {
      if (result[row.role]) result[row.role][row.tab] = true;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tab permissions' });
  }
});

// PATCH /api/auth/tab-permissions  (admin only)
router.patch('/tab-permissions', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const { role, tab, allowed } = req.body;
  if (!VALID_ROLES.includes(role) || !VALID_TABS.includes(tab)) {
    return res.status(400).json({ error: 'Invalid role or tab' });
  }
  try {
    if (allowed) {
      await sql`INSERT INTO role_tab_permissions (role, tab) VALUES (${role}, ${tab}) ON CONFLICT DO NOTHING`;
    } else {
      const count = await sql`SELECT COUNT(*)::int AS c FROM role_tab_permissions WHERE role = ${role}`;
      if (count[0].c <= 1) return res.status(400).json({ error: 'Role must retain at least one tab' });
      await sql`DELETE FROM role_tab_permissions WHERE role = ${role} AND tab = ${tab}`;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tab permission' });
  }
});

export default router;
