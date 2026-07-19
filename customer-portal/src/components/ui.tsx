'use client';
import { AlertCircle, Inbox } from 'lucide-react';
import { ReactNode } from 'react';

const POLICY_COLOURS: Record<string, string> = {
  active: 'badge-green', pending_payment: 'badge-yellow', quotation: 'badge-gray',
  lapsed: 'badge-red', cancelled: 'badge-red', expired: 'badge-gray', renewed: 'badge-blue',
};
const CLAIM_COLOURS: Record<string, string> = {
  fnol_submitted: 'badge-blue', registered: 'badge-blue', under_assessment: 'badge-yellow',
  pending_documents: 'badge-yellow', approved: 'badge-green', partially_approved: 'badge-green',
  rejected: 'badge-red', settlement_processing: 'badge-yellow', settled: 'badge-green',
  closed: 'badge-gray', withdrawn: 'badge-gray',
};
const KYC_COLOURS: Record<string, string> = {
  approved: 'badge-green', pending_review: 'badge-yellow', not_submitted: 'badge-gray',
  rejected: 'badge-red', expired: 'badge-red', re_verification_required: 'badge-yellow',
};

export function StatusBadge({ status, type = 'policy' }: { status: string; type?: 'policy' | 'claim' | 'kyc' | 'invoice' }) {
  const maps: Record<string, Record<string, string>> = {
    policy: POLICY_COLOURS, claim: CLAIM_COLOURS, kyc: KYC_COLOURS,
    invoice: { paid: 'badge-green', issued: 'badge-blue', partially_paid: 'badge-yellow', overdue: 'badge-red' },
  };
  const colour = maps[type]?.[status] || 'badge-gray';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return <span className={colour}>{label}</span>;
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-9 h-9' }[size];
  return <div className={`${sz} border-2 border-brand-red/25 border-t-brand-red rounded-full animate-spin`} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <Icon className="w-10 h-10 text-gray-300 mb-3" />
      <p className="font-semibold text-gray-700">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4 w-full">{action}</div>}
    </div>
  );
}

export function Alert({ type = 'error', message }: { type?: 'error' | 'warning' | 'info' | 'success'; message: string }) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    success: 'bg-green-50 border-green-200 text-green-700',
  };
  return (
    <div className={`flex items-start gap-2 p-3.5 rounded-xl border text-sm ${styles[type]}`}>
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end max-w-md mx-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none px-2">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
