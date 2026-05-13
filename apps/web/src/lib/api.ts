const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export type GlobalFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  fyKey?: number | null;
  customerId?: string | null;
  consigneeId?: string | null;
  agentId?: string | null;
  status?: string[] | null;
  piFrom?: number | null;
  piTo?: number | null;
};

function buildParams(filters?: GlobalFilters, extra?: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  if (filters) {
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.fyKey != null) params.set('fyKey', String(filters.fyKey));
    if (filters.customerId) params.set('customerId', filters.customerId);
    if (filters.consigneeId) params.set('consigneeId', filters.consigneeId);
    if (filters.agentId) params.set('agentId', filters.agentId);
    if (filters.status && filters.status.length > 0) params.set('status', filters.status.join(','));
    if (filters.piFrom != null) params.set('piFrom', String(filters.piFrom));
    if (filters.piTo != null) params.set('piTo', String(filters.piTo));
  }
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => {
      if (v != null) params.set(k, String(v));
    });
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

// Dashboard
export const fetchDashboard = (filters?: GlobalFilters) =>
  request(`/api/dashboard${buildParams(filters)}`);

// Orders
export const fetchOrders = (filters?: GlobalFilters, page = 1, limit = 50) =>
  request(`/api/orders${buildParams(filters, { page, limit })}`);

export const fetchOrder = (id: string) =>
  request(`/api/orders/${id}`);

export const createOrder = (body: unknown) =>
  request('/api/orders', { method: 'POST', body: JSON.stringify(body) });

export const updateOrder = (id: string, body: unknown) =>
  request(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const updateOrderStatus = (id: string, status: string) =>
  request(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const reviseOrder = (id: string) =>
  request(`/api/orders/${id}/revise`, { method: 'POST' });

export const fetchNextPiNumber = (fyKey: number) =>
  request<{ piNumber: string; seqNumber: number }>(`/api/pi/next-number?fyKey=${fyKey}`);

// Customers
export const fetchCustomers = (filters?: GlobalFilters, search?: string, page = 1, limit = 50) =>
  request(`/api/customers${buildParams(filters, { search, page, limit })}`);

export const fetchCustomer = (id: string) =>
  request(`/api/customers/${id}`);

export const createCustomer = (body: unknown) =>
  request('/api/customers', { method: 'POST', body: JSON.stringify(body) });

export const updateCustomer = (id: string, body: unknown) =>
  request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const fetchCustomerOutstanding = (id: string) =>
  request(`/api/customers/${id}/outstanding`);

export const fetchCustomerOrders = (id: string, filters?: GlobalFilters) =>
  request(`/api/customers/${id}/orders${buildParams(filters)}`);

export const fetchConsignees = (buyerId: string) =>
  request(`/api/customers/${buyerId}/consignees`);

export const createConsignee = (buyerId: string, body: unknown) =>
  request(`/api/customers/${buyerId}/consignees`, { method: 'POST', body: JSON.stringify(body) });

// Catalog
export const fetchProducts = (search?: string) =>
  request(`/api/catalog/products${search ? `?search=${encodeURIComponent(search)}` : ''}`);

export const createProduct = (body: unknown) =>
  request('/api/catalog/products', { method: 'POST', body: JSON.stringify(body) });

export const updateProduct = (id: string, body: unknown) =>
  request(`/api/catalog/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const fetchVariants = (productId: string) =>
  request(`/api/catalog/products/${productId}/variants`);

export const createVariant = (body: unknown) =>
  request('/api/catalog/variants', { method: 'POST', body: JSON.stringify(body) });

export const updateVariant = (id: string, body: unknown) =>
  request(`/api/catalog/variants/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const fetchAgents = () =>
  request('/api/catalog/agents');

export const createAgent = (body: unknown) =>
  request('/api/catalog/agents', { method: 'POST', body: JSON.stringify(body) });

export const updateAgent = (id: string, body: unknown) =>
  request(`/api/catalog/agents/${id}`, { method: 'PUT', body: JSON.stringify(body) });

// Finance
export const fetchOutstanding = (partyType: string, filters?: GlobalFilters) =>
  request(`/api/finance/outstanding${buildParams(filters, { partyType })}`);

export const fetchOutstandingSummary = (partyType: string) =>
  request(`/api/finance/outstanding/summary?partyType=${partyType}`);

export const fetchAlerts = (acknowledged?: boolean, thresholdDays?: number) => {
  const p = new URLSearchParams();
  if (acknowledged != null) p.set('acknowledged', String(acknowledged));
  if (thresholdDays != null) p.set('thresholdDays', String(thresholdDays));
  return request(`/api/finance/alerts?${p.toString()}`);
};

export const acknowledgeAlert = (id: string, acknowledgedBy: string) =>
  request(`/api/finance/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_acknowledged: true, acknowledged_by: acknowledgedBy }),
  });

// Document uploads
export const uploadProforma = (orderId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${BASE_URL}/api/orders/${orderId}/upload-proforma`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};
export const uploadApprovedPi = (orderId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${BASE_URL}/api/orders/${orderId}/upload-approved-pi`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};
export const uploadSalesBill = (orderId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${BASE_URL}/api/orders/${orderId}/upload-sales-bill`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};
export const uploadSignature = (userId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${BASE_URL}/api/auth/users/${userId}/signature`, { method: 'PATCH', headers: getAuthHeader(), body: fd }).then(r => r.json());
};

export const syncTallyFile = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE_URL}/api/finance/sync`, { method: 'POST', body: form }).then((r) => r.json());
};

// Lookup
export const fetchStates = () => request('/api/lookup/states');
export const fetchFinancialYears = () => request('/api/lookup/financial-years');
export const setCurrentFY = (fyKey: number) =>
  request(`/api/lookup/financial-years/${fyKey}/set-current`, { method: 'PATCH' });
export const createFY = (body: unknown) =>
  request('/api/lookup/financial-years', { method: 'POST', body: JSON.stringify(body) });
export const fetchPackagingTypes = () => request('/api/lookup/packaging-types');
export const createPackagingType = (pkg_name: string) =>
  request('/api/lookup/packaging-types', { method: 'POST', body: JSON.stringify({ pkg_name }) });
export const updatePackagingType = (id: number, pkg_name: string) =>
  request(`/api/lookup/packaging-types/${id}`, { method: 'PUT', body: JSON.stringify({ pkg_name }) });
export const deletePackagingType = (id: number) =>
  request(`/api/lookup/packaging-types/${id}`, { method: 'DELETE' });
export const fetchPaymentTermsSuggestions = () => request('/api/lookup/payment-terms-suggestions');
