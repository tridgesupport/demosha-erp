import { Request, Response, NextFunction } from 'express';

export interface ParsedFilters {
  dateFrom: string | null;
  dateTo: string | null;
  fyKey: number | null;
  customerId: string | null;
  consigneeId: string | null;
  agentId: string | null;
  status: string[] | null;
  piFrom: number | null;
  piTo: number | null;
}

declare global {
  namespace Express {
    interface Request {
      filters: ParsedFilters;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES = ['draft', 'sent', 'approved', 'dispatched', 'invoiced', 'cancelled'];

function parseUuid(val: unknown): string | null {
  if (typeof val === 'string' && UUID_RE.test(val)) return val;
  return null;
}

function parseDate(val: unknown): string | null {
  if (typeof val === 'string' && DATE_RE.test(val)) return val;
  return null;
}

function parseInteger(val: unknown): number | null {
  if (typeof val === 'string' && /^\d+$/.test(val)) return parseInt(val, 10);
  return null;
}

function parseStatus(val: unknown): string[] | null {
  if (!val) return null;
  const statuses = (Array.isArray(val) ? val : String(val).split(',')).filter(
    (s) => VALID_STATUSES.includes(s)
  );
  return statuses.length > 0 ? statuses : null;
}

export function filtersMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const q = req.query;
  req.filters = {
    dateFrom: parseDate(q.dateFrom),
    dateTo: parseDate(q.dateTo),
    fyKey: parseInteger(q.fyKey),
    customerId: parseUuid(q.customerId),
    consigneeId: parseUuid(q.consigneeId),
    agentId: parseUuid(q.agentId),
    status: parseStatus(q.status),
    piFrom: parseInteger(q.piFrom),
    piTo: parseInteger(q.piTo),
  };
  next();
}
