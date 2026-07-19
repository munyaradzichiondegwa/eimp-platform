'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { FileText, AlertCircle, ChevronRight, ShieldAlert } from 'lucide-react';
import { portalApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PageLoader, StatusBadge } from '@/components/ui';
import { fmtCurrency, fmtDate, type Policy, type Claim } from '@/types';

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: policiesData, isLoading: policiesLoading } = useQuery({
    queryKey: ['my-policies'], queryFn: portalApi.getPolicies,
  });
  const { data: claimsData } = useQuery({
    queryKey: ['my-claims'], queryFn: portalApi.getClaims,
  });
  const { data: profile } = useQuery({
    queryKey: ['my-profile'], queryFn: portalApi.getProfile,
  });

  const policies: Policy[] = policiesData?.data || [];
  const claims: Claim[] = claimsData?.data || [];
  const activePolicies = policies.filter(p => p.status === 'active');
  const outstanding = policies.reduce((s, p) => s + Number(p.outstandingPremium || 0), 0);
  const openClaims = claims.filter(c => !['settled', 'closed', 'rejected', 'withdrawn'].includes(c.status));

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-5 pt-2">
        <div>
          <p className="text-sm text-gray-400">Welcome back,</p>
          <h1 className="text-xl">{user?.firstName}</h1>
        </div>
        <div className="w-11 h-11 bg-brand-red text-white rounded-full flex items-center justify-center font-bold text-sm">
          {user?.firstName?.[0]}{user?.lastName?.[0]}
        </div>
      </div>

      {profile?.kycStatus !== 'approved' && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">Verify your identity</p>
            <p className="text-xs text-amber-600 mt-0.5">Complete KYC to purchase policies and submit claims.</p>
            <Link href="/profile" className="text-xs font-semibold text-amber-700 mt-1.5 inline-block">Verify now →</Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="card">
          <FileText className="w-5 h-5 text-brand-red mb-2" />
          <p className="text-2xl font-bold text-gray-900">{activePolicies.length}</p>
          <p className="text-xs text-gray-400">Active policies</p>
        </div>
        <div className="card">
          <AlertCircle className="w-5 h-5 text-brand-gold mb-2" />
          <p className="text-2xl font-bold text-gray-900">{openClaims.length}</p>
          <p className="text-xs text-gray-400">Open claims</p>
        </div>
      </div>

      {outstanding > 0 && (
        <div className="card mb-5 flex items-center justify-between bg-red-50 border-red-100">
          <div>
            <p className="text-xs text-red-500 font-medium">Outstanding premium</p>
            <p className="text-lg font-bold text-red-700">{fmtCurrency(outstanding)}</p>
          </div>
          <Link href="/policies" className="btn-ghost text-xs">Pay now</Link>
        </div>
      )}

      <div className="section-title">Quick actions</div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/policies/buy" className="card flex flex-col items-center justify-center py-5 text-center active:scale-95 transition-transform">
          <FileText className="w-6 h-6 text-brand-red mb-2" />
          <span className="text-sm font-semibold">Get a Quote</span>
        </Link>
        <Link href="/claims/submit" className="card flex flex-col items-center justify-center py-5 text-center active:scale-95 transition-transform">
          <AlertCircle className="w-6 h-6 text-brand-gold mb-2" />
          <span className="text-sm font-semibold">File a Claim</span>
        </Link>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="section-title mb-0">Your policies</p>
        <Link href="/policies" className="text-xs text-brand-red font-semibold">See all</Link>
      </div>
      {policiesLoading ? <PageLoader /> : policies.length === 0 ? (
        <div className="card text-center py-6">
          <p className="text-sm text-gray-400">No policies yet</p>
          <Link href="/policies/buy" className="text-sm text-brand-red font-semibold mt-1 inline-block">Get your first quote →</Link>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {policies.slice(0, 3).map(p => (
            <Link key={p.id} href={`/policies/${p.id}`} className="card flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{p.product?.name || 'Policy'}</p>
                <p className="text-xs text-gray-400 font-mono">{p.policyNumber}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={p.status} />
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {claims.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="section-title mb-0">Recent claims</p>
            <Link href="/claims" className="text-xs text-brand-red font-semibold">See all</Link>
          </div>
          <div className="space-y-2">
            {claims.slice(0, 2).map(c => (
              <Link key={c.id} href={`/claims/${c.id}`} className="card flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm capitalize truncate">{c.claimType.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-400">{fmtDate(c.fnolDate)}</p>
                </div>
                <StatusBadge status={c.status} type="claim" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
