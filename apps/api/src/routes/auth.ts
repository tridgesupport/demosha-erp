import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
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
    res.json({ token: signToken(user), user: { user_id: user.user_id, email: user.email, name: user.name, role: user.role, signature_url: user.signature_url } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await sql`SELECT user_id, email, name, role, signature_url FROM users WHERE user_id = ${req.user!.user_id} AND deleted_at IS NULL`;
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PATCH /api/auth/password
router.patch('/password', requireAuth, async (req: Request, res: Response) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const rows = await sql`SELECT * FROM users WHERE user_id = ${req.user!.user_id}`;
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    await sql`UPDATE users SET password_hash = ${hash} WHERE user_id = ${req.user!.user_id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
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
    const rows = await sql`SELECT user_id, email, name, role, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`;
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
      INSERT INTO users (email, name, role, password_hash)
      VALUES (${email.toLowerCase()}, ${name}, ${role}, ${hash})
      RETURNING user_id, email, name, role, created_at
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
    await sql`UPDATE users SET password_hash = ${hash} WHERE user_id = ${req.params.id} AND deleted_at IS NULL`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
