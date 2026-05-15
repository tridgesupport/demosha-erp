import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import sql from './db/client';
import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import ordersRouter from './routes/orders';
import customersRouter from './routes/customers';
import catalogRouter from './routes/catalog';
import financeRouter from './routes/finance';
import lookupRouter from './routes/lookup';
import purchaseItemsRouter from './routes/purchase_items';
import purchaseIndentsRouter from './routes/purchase_indents';
import purchaseOrdersRouter from './routes/purchase_orders';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors({
  origin: (process.env.FRONTEND_URL ?? 'http://localhost:5173').trim(),
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/pi', ordersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/finance', financeRouter);
app.use('/api/lookup', lookupRouter);
app.use('/api/purchase/items', purchaseItemsRouter);
app.use('/api/purchase/indents', purchaseIndentsRouter);
app.use('/api/purchase/orders', purchaseOrdersRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function bootstrap() {
  await sql`
    CREATE TABLE IF NOT EXISTS role_tab_permissions (
      role TEXT NOT NULL,
      tab  TEXT NOT NULL,
      PRIMARY KEY (role, tab)
    )
  `;
  const existing = await sql`SELECT COUNT(*)::int AS c FROM role_tab_permissions`;
  if (existing[0].c === 0) {
    await sql`
      INSERT INTO role_tab_permissions (role, tab) VALUES
        ('admin',       'sales'),
        ('admin',       'purchase'),
        ('admin',       'management'),
        ('manager',     'sales'),
        ('manager',     'purchase'),
        ('manager',     'management'),
        ('salesperson', 'sales'),
        ('factory',     'purchase'),
        ('factory',     'management')
    `;
  }
}

bootstrap()
  .then(() => app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`)))
  .catch((err) => { console.error('Bootstrap failed', err); process.exit(1); });

export default app;
