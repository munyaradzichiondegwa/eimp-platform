// ── Auth ──────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string; email: string; firstName: string; lastName: string;
  role: UserRole; status: string; mfaEnabled: boolean; lastLogin?: string;
}
export type UserRole = 'super_admin'|'admin'|'underwriter'|'claims_officer'|'finance'|'compliance'|'broker'|'customer'|'readonly';

// ── Customer ──────────────────────────────────────────────────────────────────
export interface Customer {
  id: string; customerNumber: string; type: 'individual'|'corporate';
  firstName?: string; lastName?: string; companyName?: string;
  email: string; phone?: string; idNumber?: string;
  kycStatus: KycStatus; status: string; segment: string;
  city?: string; province?: string; country: string;
  createdAt: string; updatedAt: string;
  fullName?: string;
}
export type KycStatus = 'not_submitted'|'pending_review'|'approved'|'rejected'|'expired'|'re_verification_required';

// ── Policy ────────────────────────────────────────────────────────────────────
export interface Policy {
  id: string; policyNumber: string; customerId: string; productId: string;
  status: PolicyStatus; sumInsured: number; grossPremium: number; netPremium: number;
  currency: string; startDate: string; endDate: string; issueDate?: string;
  distributionChannel: string; underwritingDecision: string; riskScore?: number;
  outstandingPremium: number; brokerCommission?: number; brokerId?: string;
  product?: Product; customer?: Customer;
  createdAt: string;
}
export type PolicyStatus = 'quotation'|'pending_payment'|'active'|'lapsed'|'cancelled'|'expired'|'renewed';

// ── Product ───────────────────────────────────────────────────────────────────
export interface Product {
  id: string; code: string; name: string; type: string; status: string;
  description?: string; premiumRules: any; coverageConfig: any;
  brokerCommissionRate: number; isPortalSellable: boolean;
}

// ── Claim ─────────────────────────────────────────────────────────────────────
export interface Claim {
  id: string; claimNumber: string; policyId: string; customerId: string;
  status: ClaimStatus; claimType: string; channel: string;
  eventDate: string; eventDescription?: string;
  claimedAmount?: number; reserveAmount: number; approvedAmount?: number;
  settlementAmount?: number; currency: string;
  fraudScore: number; fraudFlagged: boolean;
  policy?: Policy; customer?: Customer;
  fnolDate: string; updatedAt: string;
}
export type ClaimStatus = 'fnol_submitted'|'registered'|'under_assessment'|'pending_documents'|'referred_to_senior'|'approved'|'partially_approved'|'rejected'|'settlement_processing'|'settled'|'closed'|'withdrawn'|'fraud_investigation';

// ── Finance ───────────────────────────────────────────────────────────────────
export interface GlAccount {
  id: string; code: string; name: string; type: string;
  category: string; currentBalance: number; isActive: boolean;
}
export interface Invoice {
  id: string; invoiceNumber: string; policyId: string; customerId: string;
  invoiceType: string; status: string; totalAmount: number;
  paidAmount: number; outstandingAmount: number; currency: string;
  dueDate: string; createdAt: string;
}
export interface Payment {
  id: string; paymentRef: string; channel: string; status: string;
  amount: number; currency: string; payerPhone?: string;
  confirmedAt?: string; initiatedAt: string;
}

// ── Reporting ─────────────────────────────────────────────────────────────────
export interface ExecutiveDashboard {
  gwp: { current: number; previousMonth: number; ytd: number; growth: number };
  policies: { active: number; lapsed: number; pendingPayment: number; expiringSoon: number };
  claims: { open: number; settled: number; claimsRatio: number; avgDays: number; fraudFlagged: number };
  customers: { total: number; newThisMonth: number; kycPending: number };
  collections: { thisMonth: number; outstanding: number; collectionRate: number };
  retention: { renewalRate: number; lapseRate: number };
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> { data: T[]; total: number; }

// ── Utilities ─────────────────────────────────────────────────────────────────
export function cn(...classes: (string|undefined|false|null)[]): string {
  return classes.filter(Boolean).join(' ');
}
export function fmtCurrency(amount: number, currency = 'USD'): string {
  return `${currency} ${Number(amount || 0).toLocaleString('en-ZW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtDate(d?: string|Date): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtPct(n?: number): string {
  return `${Number(n || 0).toFixed(1)}%`;
}
