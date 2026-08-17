const BASE_URL = '';

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
export const uploadLr = (orderId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${BASE_URL}/api/orders/${orderId}/upload-lr`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};
export const uploadSignature = (userId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${BASE_URL}/api/auth/users/${userId}/signature`, { method: 'PATCH', headers: getAuthHeader(), body: fd }).then(r => r.json());
};

// Dispatch Schedules
export const fetchDispatchSchedules = (page = 1, limit = 50) =>
  request(`/api/dispatch-schedules${buildParams(undefined, { page, limit })}`);

export const fetchDispatchSchedule = (id: string) =>
  request(`/api/dispatch-schedules/${id}`);

export const fetchEligibleOrders = () =>
  request('/api/dispatch-schedules/eligible-orders');

export const createDispatchSchedule = (body: unknown) =>
  request('/api/dispatch-schedules', { method: 'POST', body: JSON.stringify(body) });

export const updateDispatchSchedule = (id: string, body: unknown) =>
  request(`/api/dispatch-schedules/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const updateDispatchScheduleLine = (scheduleId: string, lineId: string, body: unknown) =>
  request(`/api/dispatch-schedules/${scheduleId}/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify(body) });

export const uploadDispatchSchedulePdf = (scheduleId: string, file: Blob) => {
  const fd = new FormData();
  fd.append('file', file, 'dispatch_schedule.pdf');
  return fetch(`${BASE_URL}/api/dispatch-schedules/${scheduleId}/upload-pdf`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};

export const deleteDispatchSchedule = (id: string) =>
  request(`/api/dispatch-schedules/${id}`, { method: 'DELETE' });

// Auth — password & reset flows
export const updateProfile = (name: string) =>
  request('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ name }) });

export const forgotPassword = (email: string) =>
  request<{ success: boolean; reset_url: string | null }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });

export const resetPassword = (token: string, new_password: string) =>
  request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }) });

export const forceChangePassword = (new_password: string) =>
  request('/api/auth/force-change-password', { method: 'PATCH', body: JSON.stringify({ new_password }) });

export const generateResetLink = (userId: string) =>
  request<{ reset_url: string }>(`/api/auth/users/${userId}/reset-link`, { method: 'POST' });

export const setMustChangePassword = (userId: string) =>
  request(`/api/auth/users/${userId}/must-change-password`, { method: 'PATCH' });

export const syncTallyFile = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE_URL}/api/finance/sync`, { method: 'POST', body: form }).then((r) => r.json());
};

// Purchase Departments
export const fetchPurchaseDepartments = () =>
  request('/api/purchase/indents/departments');

export const createPurchaseDepartment = (dept_name: string) =>
  request('/api/purchase/indents/departments', { method: 'POST', body: JSON.stringify({ dept_name }) });

// Roles
export const fetchRoles = (): Promise<string[]> =>
  request('/api/auth/roles');

export const createRole = (role_name: string) =>
  request('/api/auth/roles', { method: 'POST', body: JSON.stringify({ role_name }) });

export const deleteRole = (role: string) =>
  request(`/api/auth/roles/${encodeURIComponent(role)}`, { method: 'DELETE' });

// Purchase Items
export const fetchPurchaseItems = (search?: string, group?: string, category?: string) => {
  const p = new URLSearchParams({ q: search ?? '' });
  if (group)    p.set('group',    group);
  if (category) p.set('category', category);
  return request(`/api/purchase/items/search?${p.toString()}`);
};

export const fetchPurchaseItemGroups = (): Promise<Record<string, string[]>> =>
  request('/api/purchase/items/groups');

export const createPurchaseItem = (body: unknown) =>
  request('/api/purchase/items', { method: 'POST', body: JSON.stringify(body) });

// Purchase Indents
export const fetchPurchaseIndents = (params?: { fyKey?: number; status?: string[]; page?: number }) => {
  const p = new URLSearchParams();
  if (params?.fyKey != null) p.set('fyKey', String(params.fyKey));
  if (params?.status?.length) p.set('status', params.status.join(','));
  if (params?.page) p.set('page', String(params.page));
  const qs = p.toString();
  return request(`/api/purchase/indents${qs ? `?${qs}` : ''}`);
};

export const fetchPurchaseIndent = (id: string) =>
  request(`/api/purchase/indents/${id}`);

export const fetchNextIndentNumber = (fyKey: number) =>
  request<{ indentNumber: string }>(`/api/purchase/indents/next-number?fyKey=${fyKey}`);

export const createPurchaseIndent = (body: unknown) =>
  request('/api/purchase/indents', { method: 'POST', body: JSON.stringify(body) });

export const updatePurchaseIndent = (id: string, body: unknown) =>
  request(`/api/purchase/indents/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const updatePurchaseIndentStatus = (id: string, status: string) =>
  request(`/api/purchase/indents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const reviseIndent = (id: string) =>
  request(`/api/purchase/indents/${id}/revise`, { method: 'POST' });

// Purchase Orders
export const fetchPurchaseOrders = (params?: { fyKey?: number; status?: string[]; page?: number }) => {
  const p = new URLSearchParams();
  if (params?.fyKey != null) p.set('fyKey', String(params.fyKey));
  if (params?.status?.length) p.set('status', params.status.join(','));
  if (params?.page) p.set('page', String(params.page));
  const qs = p.toString();
  return request(`/api/purchase/orders${qs ? `?${qs}` : ''}`);
};

export const fetchPurchaseOrder = (id: string) =>
  request(`/api/purchase/orders/${id}`);

export const fetchNextPoNumber = (fyKey: number) =>
  request<{ seqNumber: number }>(`/api/purchase/orders/next-number?fyKey=${fyKey}`);

export const createPurchaseOrder = (body: unknown) =>
  request('/api/purchase/orders', { method: 'POST', body: JSON.stringify(body) });

export const updatePurchaseOrder = (id: string, body: unknown) =>
  request(`/api/purchase/orders/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const updatePurchaseOrderStatus = (id: string, status: string, grn_number?: string) =>
  request(`/api/purchase/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, grn_number }) });

export const uploadPoPdf = (orderId: string, file: Blob, filename: string) => {
  const fd = new FormData(); fd.append('file', file, filename);
  return fetch(`${BASE_URL}/api/purchase/orders/${orderId}/upload-po-pdf`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};

export const uploadApprovedPo = (orderId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${BASE_URL}/api/purchase/orders/${orderId}/upload-approved-po`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};

export const uploadDispatchDoc = (orderId: string, file: File) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${BASE_URL}/api/purchase/orders/${orderId}/upload-dispatch-doc`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};

// Vendors
export const fetchVendors = (search?: string, page = 1, limit = 200) => {
  const p = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) p.set('search', search);
  return request(`/api/purchase/vendors?${p.toString()}`);
};

export const fetchVendor = (id: string) =>
  request(`/api/purchase/vendors/${id}`);

export const createVendor = (body: unknown) =>
  request('/api/purchase/vendors', { method: 'POST', body: JSON.stringify(body) });

export const updateVendor = (id: string, body: unknown) =>
  request(`/api/purchase/vendors/${id}`, { method: 'PUT', body: JSON.stringify(body) });

// Stock Levels
export const fetchStockLevels = (params?: { q?: string; category?: string; alert_only?: boolean }) => {
  const p = new URLSearchParams();
  if (params?.q)          p.set('q',          params.q);
  if (params?.category)   p.set('category',   params.category);
  if (params?.alert_only) p.set('alert_only', 'true');
  const qs = p.toString();
  return request(`/api/purchase/items/stock-levels${qs ? `?${qs}` : ''}`);
};

export const updateItemStock = (itemId: string, body: { current_stock?: number | null; min_level?: number | null }) =>
  request(`/api/purchase/items/${itemId}/stock`, { method: 'PUT', body: JSON.stringify(body) });

// Production
export const fetchProductionProducts = () =>
  request('/api/production/products');

export const fetchNextLogsheetNumber = (productCode: string, fyKey: number) =>
  request<{ logsheet_no: string }>(`/api/production/logsheets/next-number?productCode=${productCode}&fyKey=${fyKey}`);

export const fetchLogsheets = (params?: { productCode?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number }) => {
  const p = new URLSearchParams();
  if (params?.productCode) p.set('productCode', params.productCode);
  if (params?.status)      p.set('status',      params.status);
  if (params?.dateFrom)    p.set('dateFrom',     params.dateFrom);
  if (params?.dateTo)      p.set('dateTo',       params.dateTo);
  if (params?.page)        p.set('page',         String(params.page));
  const qs = p.toString();
  return request(`/api/production/logsheets${qs ? `?${qs}` : ''}`);
};

export const fetchLogsheet = (id: string) =>
  request(`/api/production/logsheets/${id}`);

export const createLogsheet = (body: unknown) =>
  request('/api/production/logsheets', { method: 'POST', body: JSON.stringify(body) });

export const updateLogsheetSection = (id: string, section_key: string, data: Record<string, unknown>) =>
  request(`/api/production/logsheets/${id}/section`, { method: 'PATCH', body: JSON.stringify({ section_key, data }) });

export const updateLogsheetStatus = (id: string, status: string) =>
  request(`/api/production/logsheets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const bulkApproveLogsheets = (ids: string[]) =>
  request('/api/production/logsheets/bulk-approve', { method: 'POST', body: JSON.stringify({ ids }) });

export const uploadLogsheetPdf = (logsheetId: string, file: Blob) => {
  const fd = new FormData();
  fd.append('file', file, 'logsheet.pdf');
  return fetch(`${BASE_URL}/api/production/logsheets/${logsheetId}/upload-pdf`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(r => r.json());
};

export interface AnalyticalRegisterFilters {
  dateFrom?: string;
  dateTo?: string;
  grade?: string;
  zincUsed?: string;
  page?: number;
}

function analyticalRegisterQuery(params?: AnalyticalRegisterFilters): string {
  const p = new URLSearchParams();
  if (params?.dateFrom) p.set('dateFrom', params.dateFrom);
  if (params?.dateTo)   p.set('dateTo',   params.dateTo);
  if (params?.grade)    p.set('grade',    params.grade);
  if (params?.zincUsed) p.set('zincUsed', params.zincUsed);
  if (params?.page)     p.set('page',     String(params.page));
  return p.toString();
}

export const fetchAnalyticalRegister = (params?: AnalyticalRegisterFilters) => {
  const qs = analyticalRegisterQuery(params);
  return request(`/api/production/analytical-register${qs ? `?${qs}` : ''}`);
};

export const fetchAnalyticalRegisterSummary = (params?: Omit<AnalyticalRegisterFilters, 'page'>) => {
  const qs = analyticalRegisterQuery(params);
  return request(`/api/production/analytical-register/summary${qs ? `?${qs}` : ''}`);
};

export const uploadAnalyticalRegister = (file: File) => {
  const fd = new FormData();
  fd.append('file', file, file.name);
  return fetch(`${BASE_URL}/api/production/analytical-register/upload`, { method: 'POST', headers: getAuthHeader(), body: fd }).then(async r => {
    const body = await r.json();
    if (!r.ok) throw new Error(body?.error ?? 'Upload failed');
    return body;
  });
};

// Catalogue SKUs
export const fetchSkus = (search?: string) => {
  const p = new URLSearchParams({ q: search ?? '' });
  return request(`/api/catalog/skus?${p.toString()}`);
};

export const createSku = (body: unknown) =>
  request('/api/catalog/skus', { method: 'POST', body: JSON.stringify(body) });

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
