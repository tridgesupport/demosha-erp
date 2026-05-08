import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import ordersRouter from './routes/orders';
import customersRouter from './routes/customers';
import catalogRouter from './routes/catalog';
import financeRouter from './routes/finance';
import lookupRouter from './routes/lookup';

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

export default app;
