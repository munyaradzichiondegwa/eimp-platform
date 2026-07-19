export interface PortalUser {
  id: string; email: string; firstName: string; lastName: string; role: string;
  emailVerified?: boolean;
}

export interface Customer {
  id: string; customerNumber: string; type: 'individual' | 'corporate';
  firstName?: string; lastName?: string; companyName?: string;
  email: string; phone?: string; idNumber?: string;
  kycStatus: KycStatus; status: string;
  addressLine1?: string; addressLine2?: string; city?: string; province?: string;
  whatsappNumber?: string; preferredLanguage?: string;
  emailNotifications: boolean; smsNotifications: boolean; whatsappNotifications: boolean;
}
export type KycStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected' | 'expired' | 're_verification_required';

export interface Policy {
  id: string; policyNumber: string; status: string;
  sumInsured: number; grossPremium: number; currency: string;
  startDate: string; endDate: string; outstandingPremium: number;
  product?: { name: string; type: string };
}

export interface Claim {
  id: string; claimNumber: string; status: string; claimType: string;
  eventDate: string; claimedAmount?: number; settlementAmount?: number;
  currency: string; fnolDate: string; rejectionReason?: string;
}

export interface Invoice {
  id: string; invoiceNumber: string; status: string;
  totalAmount: number; outstandingAmount: number; currency: string; dueDate: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
export function fmtCurrency(amount: number, currency = 'USD'): string {
  return `${currency} ${Number(amount || 0).toLocaleString('en-ZW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtDate(d?: string | Date): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' });
}
