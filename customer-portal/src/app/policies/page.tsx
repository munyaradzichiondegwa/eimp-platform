'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronRight, Plus, FileText } from 'lucide-react';
import { portalApi } from '@/lib/api';
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui';
import { fmtCurrency, fmtDate, type Policy } from '@/types';

export default function PoliciesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-policies'], queryFn: portalApi.getPolicies });
  const policies: Policy[] = data?.data || [];

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-5 pt-2">
        <h1>My Policies</h1>
        <Link href="/policies/buy" className="w-9 h-9 bg-brand-red text-white rounded-full flex items-center justify-center">
          <Plus className="w-5 h-5" />
        </Link>
      </div>

      {isLoading ? <PageLoader /> : policies.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No policies yet"
          description="Get a quote and protect what matters most."
          action={<Link href="/policies/buy" className="btn-primary">Get a Quote</Link>}
        />
      ) : (
        <div className="space-y-3">
          {policies.map(p => (
            <Link key={p.id} href={`/policies/${p.id}`} className="card block">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-sm">{p.product?.name || 'Policy'}</p>
                <StatusBadge status={p.status} />
              </div>
              <p className="text-xs text-gray-400 font-mono mb-3">{p.policyNumber}</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Premium</p>
                  <p className="font-semibold text-sm">{fmtCurrency(p.grossPremium, p.currency)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Expires</p>
                  <p className="font-semibold text-sm">{fmtDate(p.endDate)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
              {Number(p.outstandingPremium) > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs text-red-600 font-semibold">
                    {fmtCurrency(p.outstandingPremium, p.currency)} outstanding
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
