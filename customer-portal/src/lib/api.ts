import axios, { AxiosInstance, AxiosError } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('eba_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const userId = localStorage.getItem('eba_user_id');
        const refreshToken = localStorage.getItem('eba_refresh_token');
        if (userId && refreshToken) {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { userId, refreshToken });
          localStorage.setItem('eba_access_token', data.accessToken);
          localStorage.setItem('eba_refresh_token', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        }
      } catch {
        if (typeof window !== 'undefined') {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  register: (data: any) =>
    api.post('/auth/register-customer', data).then(r => r.data),
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

export const portalApi = {
  getProfile: () => api.get('/portal/me').then(r => r.data),
  updateProfile: (data: any) => api.patch('/portal/me', data).then(r => r.data),
  uploadKycDocument: (data: any) => api.post('/portal/me/kyc-documents', data).then(r => r.data),
  getKycDocuments: () => api.get('/portal/me/kyc-documents').then(r => r.data),

  getQuote: (data: any) => api.post('/portal/quote', data).then(r => r.data),
  purchasePolicy: (data: any) => api.post('/portal/policies', data).then(r => r.data),
  getPolicies: () => api.get('/portal/policies').then(r => r.data),
  getPolicy: (id: string) => api.get(`/portal/policies/${id}`).then(r => r.data),
  downloadScheduleUrl: (id: string) => `${BASE_URL}/portal/policies/${id}/documents/schedule`,
  downloadCertificateUrl: (id: string) => `${BASE_URL}/portal/policies/${id}/documents/certificate`,

  submitClaim: (data: any) => api.post('/portal/claims', data).then(r => r.data),
  getClaims: () => api.get('/portal/claims').then(r => r.data),
  getClaim: (id: string) => api.get(`/portal/claims/${id}`).then(r => r.data),
  addClaimDocument: (id: string, data: any) => api.post(`/portal/claims/${id}/documents`, data).then(r => r.data),

  getInvoices: () => api.get('/portal/invoices').then(r => r.data),
  initiatePayment: (data: any) => api.post('/portal/payments', data).then(r => r.data),

  createTicket: (data: any) => api.post('/portal/support-tickets', data).then(r => r.data),
  getTickets: () => api.get('/portal/support-tickets').then(r => r.data),

  startChat: () => api.post('/portal/chat/start').then(r => r.data),
  sendChatMessage: (sessionId: string, message: string) =>
    api.post(`/portal/chat/${sessionId}/message`, { message }).then(r => r.data),
  getChatHistory: () => api.get('/portal/chat/history').then(r => r.data),
};

export const uploadsApi = {
  getPresignedUrl: (data: { fileName: string; fileType: string; fileSizeBytes: number; folder: string }) =>
    api.post('/uploads/presigned-url', data).then(r => r.data),
};

export async function uploadFileDirect(file: File, folder: 'kyc-documents' | 'claim-documents' | 'profile-photos'): Promise<string> {
  const { uploadUrl, fileKey } = await uploadsApi.getPresignedUrl({
    fileName: file.name, fileType: file.type, fileSizeBytes: file.size, folder,
  });

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!response.ok) throw new Error('File upload failed. Please try again.');
  return fileKey;
}

export async function fetchAuthedBlob(url: string): Promise<Blob> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('eba_access_token') : null;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Download failed');
  return response.blob();
}
