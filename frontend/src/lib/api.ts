import axios, { AxiosInstance, AxiosError } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// Attach Bearer token from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh token on 401
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const userId = localStorage.getItem('userId');
        const refreshToken = localStorage.getItem('refreshToken');
        if (userId && refreshToken) {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { userId, refreshToken });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        }
      } catch {
        // Refresh failed — clear session and redirect to login
        if (typeof window !== 'undefined') {
          localStorage.clear();
          window.location.href = '/auth/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

// ── Typed endpoint helpers ────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then(r => r.data),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }).then(r => r.data),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }).then(r => r.data),
  verifyEmail: (token: string) =>
    api.post('/auth/verify-email', { token }).then(r => r.data),
  resendVerification: () =>
    api.post('/auth/resend-verification').then(r => r.data),
};

export const customersApi = {
  list: (params?: any) => api.get('/crm/customers', { params }).then(r => r.data),
  get: (id: string) => api.get(`/crm/customers/${id}`).then(r => r.data),
  create: (data: any) => api.post('/crm/customers', data).then(r => r.data),
  update: (id: string, data: any) => api.patch(`/crm/customers/${id}`, data).then(r => r.data),
  stats: () => api.get('/crm/customers/stats').then(r => r.data),
  communications: (id: string) => api.get(`/crm/customers/${id}/communications`).then(r => r.data),
  kycDocuments: (id: string) => api.get(`/crm/customers/${id}/kyc-documents`).then(r => r.data),
  updateKycStatus: (id: string, status: string, notes: string) =>
    api.patch(`/crm/customers/${id}/kyc-status`, { status, notes }).then(r => r.data),
};

export const policiesApi = {
  list: (params?: any) => api.get('/underwriting/policies', { params }).then(r => r.data),
  get: (id: string) => api.get(`/underwriting/policies/${id}`).then(r => r.data),
  getByNumber: (n: string) => api.get(`/underwriting/policies/number/${n}`).then(r => r.data),
  quote: (data: any) => api.post('/underwriting/quote', data).then(r => r.data),
  issue: (data: any) => api.post('/underwriting/policies', data).then(r => r.data),
  activate: (id: string) => api.patch(`/underwriting/policies/${id}/activate`).then(r => r.data),
  cancel: (id: string, reason: string) =>
    api.patch(`/underwriting/policies/${id}/cancel`, { reason }).then(r => r.data),
  renew: (id: string) => api.post(`/underwriting/policies/${id}/renew`).then(r => r.data),
  stats: () => api.get('/underwriting/policies/stats').then(r => r.data),
  endorsements: (id: string) => api.get(`/underwriting/policies/${id}/endorsements`).then(r => r.data),
};

export const productsApi = {
  list: (activeOnly = false) =>
    api.get('/underwriting/products', { params: { activeOnly } }).then(r => r.data),
  get: (id: string) => api.get(`/underwriting/products/${id}`).then(r => r.data),
  create: (data: any) => api.post('/underwriting/products', data).then(r => r.data),
  update: (id: string, data: any) => api.patch(`/underwriting/products/${id}`, data).then(r => r.data),
  activate: (id: string) => api.patch(`/underwriting/products/${id}/activate`).then(r => r.data),
};

export const claimsApi = {
  list: (params?: any) => api.get('/claims', { params }).then(r => r.data),
  get: (id: string) => api.get(`/claims/${id}`).then(r => r.data),
  submit: (data: any) => api.post('/claims', data).then(r => r.data),
  updateStatus: (id: string, data: any) =>
    api.patch(`/claims/${id}/status`, data).then(r => r.data),
  settle: (id: string, data: any) => api.post(`/claims/${id}/settle`, data).then(r => r.data),
  confirmSettlement: (id: string, paymentRef: string) =>
    api.patch(`/claims/${id}/confirm-settlement`, { paymentRef }).then(r => r.data),
  stats: () => api.get('/claims/stats').then(r => r.data),
  documents: (id: string) => api.get(`/claims/${id}/documents`).then(r => r.data),
};

export const financeApi = {
  dashboard: () => api.get('/finance/dashboard').then(r => r.data),
  accounts: (type?: string) => api.get('/finance/accounts', { params: { type } }).then(r => r.data),
  invoices: (params?: any) => api.get('/finance/invoices', { params }).then(r => r.data),
  postJournal: (data: any) => api.post('/finance/journals', data).then(r => r.data),
  trialBalance: (period?: string) =>
    api.get('/finance/statements/trial-balance', { params: { period } }).then(r => r.data),
  pnl: (period?: string) =>
    api.get('/finance/statements/pnl', { params: { period } }).then(r => r.data),
  balanceSheet: () => api.get('/finance/statements/balance-sheet').then(r => r.data),
  initiatePayment: (data: any) => api.post('/payments/initiate', data).then(r => r.data),
  seedAccounts: () => api.post('/finance/accounts/seed').then(r => r.data),
};

export const reportsApi = {
  dashboard: () => api.get('/reports/dashboard').then(r => r.data),
  gwp: (from: string, to: string) =>
    api.get('/reports/gwp', { params: { from, to } }).then(r => r.data),
  claims: (from: string, to: string) =>
    api.get('/reports/claims', { params: { from, to } }).then(r => r.data),
  outstandingPremiums: () => api.get('/reports/outstanding-premiums').then(r => r.data),
  brokerPerformance: (from: string, to: string) =>
    api.get('/reports/broker-performance', { params: { from, to } }).then(r => r.data),
  ipec: (quarter: string) =>
    api.get('/reports/regulatory/ipec', { params: { quarter } }).then(r => r.data),
  fiuAml: (from: string, to: string) =>
    api.get('/reports/regulatory/fiu-aml', { params: { from, to } }).then(r => r.data),
};

export const usersApi = {
  list: (params?: any) => api.get('/users', { params }).then(r => r.data),
  get: (id: string) => api.get(`/users/${id}`).then(r => r.data),
  create: (data: any) => api.post('/users', data).then(r => r.data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data).then(r => r.data),
  setStatus: (id: string, status: string) =>
    api.patch(`/users/${id}/status`, { status }).then(r => r.data),
  stats: () => api.get('/users/stats').then(r => r.data),
};

export const brokersApi = {
  list: (params?: any) => api.get('/brokers', { params }).then(r => r.data),
  get: (id: string) => api.get(`/brokers/${id}`).then(r => r.data),
  create: (data: any) => api.post('/brokers', data).then(r => r.data),
  accredit: (id: string) => api.patch(`/brokers/${id}/accredit`).then(r => r.data),
  suspend: (id: string, reason: string) =>
    api.patch(`/brokers/${id}/suspend`, { reason }).then(r => r.data),
  portfolio: (id: string) => api.get(`/brokers/${id}/portfolio`).then(r => r.data),
  statements: (id: string) => api.get(`/brokers/${id}/statements`).then(r => r.data),
  generateStatement: (id: string, period: string) =>
    api.post(`/brokers/${id}/statements/generate`, { period }).then(r => r.data),
  markStatementPaid: (statementId: string, paymentRef: string) =>
    api.patch(`/brokers/statements/${statementId}/mark-paid`, { paymentRef }).then(r => r.data),
  performance: (id: string, from?: string, to?: string) =>
    api.get(`/brokers/${id}/performance`, { params: { from, to } }).then(r => r.data),
};

export const fixedAssetsApi = {
  list: (params?: any) => api.get('/finance/assets', { params }).then(r => r.data),
  get: (id: string) => api.get(`/finance/assets/${id}`).then(r => r.data),
  create: (data: any) => api.post('/finance/assets', data).then(r => r.data),
  summary: () => api.get('/finance/assets/summary').then(r => r.data),
  runDepreciation: (period: string) =>
    api.post('/finance/assets/depreciation/run', { period }).then(r => r.data),
  dispose: (id: string, proceeds: number, notes: string) =>
    api.patch(`/finance/assets/${id}/dispose`, { proceeds, notes }).then(r => r.data),
};

export const reinsuranceApi = {
  summary: () => api.get('/finance/reinsurance/summary').then(r => r.data),
  treaties: (params?: any) => api.get('/finance/reinsurance/treaties', { params }).then(r => r.data),
  getTreaty: (id: string) => api.get(`/finance/reinsurance/treaties/${id}`).then(r => r.data),
  createTreaty: (data: any) => api.post('/finance/reinsurance/treaties', data).then(r => r.data),
  activateTreaty: (id: string) => api.patch(`/finance/reinsurance/treaties/${id}/activate`).then(r => r.data),
  cedePolicy: (treatyId: string, input: any) =>
    api.post(`/finance/reinsurance/treaties/${treatyId}/cede`, input).then(r => r.data),
  getCessions: (policyId: string) =>
    api.get(`/finance/reinsurance/policies/${policyId}/cessions`).then(r => r.data),
  generateBordereau: (treatyId: string, period: string) =>
    api.post(`/finance/reinsurance/treaties/${treatyId}/bordereaux/generate`, { period }).then(r => r.data),
  getBordereaux: (treatyId: string) =>
    api.get(`/finance/reinsurance/treaties/${treatyId}/bordereaux`).then(r => r.data),
  settleBordereau: (id: string, settlementRef: string) =>
    api.patch(`/finance/reinsurance/bordereaux/${id}/settle`, { settlementRef }).then(r => r.data),
};

export const weatherIndexApi = {
  events: (params?: any) => api.get('/underwriting/weather/events', { params }).then(r => r.data),
  getEvent: (id: string) => api.get(`/underwriting/weather/events/${id}`).then(r => r.data),
  readings: (stationId: string, from?: string, to?: string) =>
    api.get('/underwriting/weather/readings', { params: { stationId, from, to } }).then(r => r.data),
  ingest: (data: any) => api.post('/underwriting/weather/readings', data).then(r => r.data),
  checkTriggers: () => api.post('/underwriting/weather/check-triggers').then(r => r.data),
  processPayouts: (eventId: string) =>
    api.post(`/underwriting/weather/events/${eventId}/process-payouts`).then(r => r.data),
  approveEvent: (eventId: string, notes: string) =>
    api.patch(`/underwriting/weather/events/${eventId}/approve`, { notes }).then(r => r.data),
  rejectEvent: (eventId: string, notes: string) =>
    api.patch(`/underwriting/weather/events/${eventId}/reject`, { notes }).then(r => r.data),
};

export const aiApi = {
  getAtRiskRenewals: (lookaheadDays = 60) =>
    api.get('/ai/predictive/at-risk-renewals', { params: { lookaheadDays } }).then(r => r.data),
  getCustomerValue: (customerId: string) =>
    api.get(`/ai/predictive/customer-value/${customerId}`).then(r => r.data),
  getGwpForecast: (horizonMonths = 6) =>
    api.get('/ai/forecasting/gwp', { params: { horizonMonths } }).then(r => r.data),
  getClaimsForecast: (horizonMonths = 6) =>
    api.get('/ai/forecasting/claims', { params: { horizonMonths } }).then(r => r.data),
  getChatHistory: (customerId: string) =>
    api.get(`/ai/chat/history/${customerId}`).then(r => r.data),
};
