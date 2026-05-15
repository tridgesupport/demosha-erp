import express from 'express';
import cors from 'cors';
import sql from './db/client';

import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import ordersRouter from './routes/orders';
import customersRouter from './routes/customers';
import catalogRouter from './routes/catalog';
import financeRouter from './routes/finance';
import lookupRouter from './routes/lookup';

const app = express();

// Ensure role_tab_permissions table exists (idempotent on every cold start)
const bootstrapped = sql`
  CREATE TABLE IF NOT EXISTS role_tab_permissions (
    role TEXT NOT NULL,
    tab  TEXT NOT NULL,
    PRIMARY KEY (role, tab)
  )
`.then(() => sql`SELECT COUNT(*)::int AS c FROM role_tab_permissions`)
  .then(async (rows) => {
    if (rows[0].c === 0) {
      await sql`
        INSERT INTO role_tab_permissions (role, tab) VALUES
          ('admin','sales'),('admin','purchase'),('admin','management'),
          ('manager','sales'),('manager','purchase'),('manager','management'),
          ('salesperson','sales'),('factory','management')
      `;
    }
  })
  .catch(console.error);

app.use(cors({
  origin: (process.env.FRONTEND_URL ?? 'http://localhost:5173').trim(),
  credentials: true,
}));
app.use(express.json());
app.use((_req, _res, next) => { bootstrapped.then(() => next()).catch(next); });

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/pi', ordersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/finance', financeRouter);
app.use('/api/lookup', lookupRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
