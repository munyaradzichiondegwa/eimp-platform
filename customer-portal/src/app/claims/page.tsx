'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, AlertCircle } from 'lucide-react';
import { portalApi } from '@/lib/api';
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui';
import { fmtCurrency, fmtDate, type Claim } from '@/types';

export default function ClaimsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-claims'], queryFn: portalApi.getClaims });
  const claims: Claim[] = data?.data || [];

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-5 pt-2">
        <h1>My Claims</h1>
        <Link href="/claims/submit" className="w-9 h-9 bg-brand-red text-white rounded-full flex items-center justify-center">
          <Plus className="w-5 h-5" />
        </Link>
      </div>

      {isLoading ? <PageLoader /> : claims.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No claims filed"
          description="If something happens, we're here to help."
          action={<Link href="/claims/submit" className="btn-primary">File a Claim</Link>}
        />
      ) : (
        <div className="space-y-3">
          {claims.map(c => (
            <Link key={c.id} href={`/claims/${c.id}`} className="card block">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-sm capitalize">{c.claimType.replace(/_/g, ' ')}</p>
                <StatusBadge status={c.status} type="claim" />
              </div>
              <p className="text-xs text-gray-400 font-mono mb-3">{c.claimNumber}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{fmtDate(c.fnolDate)}</span>
                {c.claimedAmount && <span className="font-semibold">{fmtCurrency(c.claimedAmount, c.currency)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
