'use client';
import { X, AlertCircle, Inbox } from 'lucide-react';
import { ReactNode } from 'react';

// ── StatusBadge ───────────────────────────────────────────────────────────────
const POLICY_COLOURS: Record<string, string> = {
  active: 'badge-green', pending_payment: 'badge-yellow', quotation: 'badge-gray',
  lapsed: 'badge-red', cancelled: 'badge-red', expired: 'badge-gray', renewed: 'badge-blue',
  suspended: 'badge-orange',
};
const CLAIM_COLOURS: Record<string, string> = {
  fnol_submitted: 'badge-blue', registered: 'badge-blue', under_assessment: 'badge-yellow',
  pending_documents: 'badge-yellow', approved: 'badge-green', partially_approved: 'badge-green',
  rejected: 'badge-red', settlement_processing: 'badge-orange', settled: 'badge-green',
  closed: 'badge-gray', withdrawn: 'badge-gray', fraud_investigation: 'badge-red',
  referred_to_senior: 'badge-orange',
};
const KYC_COLOURS: Record<string, string> = {
  approved: 'badge-green', pending_review: 'badge-yellow', not_submitted: 'badge-gray',
  rejected: 'badge-red', expired: 'badge-red', re_verification_required: 'badge-orange',
};
const USER_COLOURS: Record<string, string> = {
  active: 'badge-green', inactive: 'badge-gray', suspended: 'badge-red',
  pending_verification: 'badge-yellow',
};

export function StatusBadge({ status, type = 'policy' }: {
  status: string;
  type?: 'policy' | 'claim' | 'kyc' | 'user' | 'invoice';
}) {
  const maps: Record<string, Record<string, string>> = {
    policy: POLICY_COLOURS, claim: CLAIM_COLOURS, kyc: KYC_COLOURS, user: USER_COLOURS,
    invoice: { paid: 'badge-green', issued: 'badge-blue', partially_paid: 'badge-yellow', overdue: 'badge-red', cancelled: 'badge-gray' },
  };
  const colour = maps[type]?.[status] || 'badge-gray';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return <span className={colour}>{label}</span>;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }[size];
  return <div className={`${sz} border-2 border-brand-red/30 border-t-brand-red rounded-full animate-spin`} />;
}

export function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center"><Spinner size="lg" /><p className="text-sm text-gray-400 mt-3">Loading…</p></div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ title, description, action }: {
  title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox className="w-12 h-12 text-gray-300 mb-3" />
      <p className="font-semibold text-gray-600">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-2xl w-full ${widths[size]} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, total, limit, onChange }: {
  page: number; total: number; limit: number; onChange: (p: number) => void;
}) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
      <p className="text-xs text-gray-500">
        Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
      </p>
      <div className="flex gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">
          Previous
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          const p = i + 1;
          return (
            <button key={p} onClick={() => onChange(p)}
              className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-brand-red text-white' : 'border border-gray-200 hover:bg-gray-50'}`}>
              {p}
            </button>
          );
        })}
        <button onClick={() => onChange(page + 1)} disabled={page >= pages}
          className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}

// ── Alert ────────────────────────────────────────────────────────────────────
export function Alert({ type = 'error', message }: { type?: 'error' | 'warning' | 'info'; message: string }) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
  };
  return (
    <div className={`flex items-start gap-2 p-3 rounded-md border text-sm ${styles[type]}`}>
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, trend, colour = 'default', icon: Icon }: {
  label: string; value: string | number; sub?: string;
  trend?: { value: number; label: string };
  colour?: 'default' | 'red' | 'green' | 'gold';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const iconBg = { default: 'bg-gray-100 text-gray-500', red: 'bg-red-100 text-brand-red', green: 'bg-green-100 text-green-600', gold: 'bg-amber-100 text-amber-600' }[colour];
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value mt-0.5">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          {trend && (
            <p className={`text-xs font-medium mt-1 ${trend.value >= 0 ? 'stat-change-pos' : 'stat-change-neg'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}% {trend.label}
            </p>
          )}
        </div>
        {Icon && <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}><Icon className="w-5 h-5" /></div>}
      </div>
    </div>
  );
}
