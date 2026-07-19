'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Check } from 'lucide-react';
import { portalApi } from '@/lib/api';
import { PageLoader, Alert } from '@/components/ui';
import { fmtCurrency, fmtDate } from '@/types';

const REJECTED_STATUSES = ['rejected', 'withdrawn'];

function getStageIndex(status: string): number {
  if (['fnol_submitted'].includes(status)) return 0;
  if (['registered', 'under_assessment', 'pending_documents', 'referred_to_senior', 'fraud_investigation'].includes(status)) return 1;
  if (['approved', 'partially_approved'].includes(status)) return 2;
  if (['settlement_processing', 'settled', 'closed'].includes(status)) return 3;
  return 0;
}

const STAGES = ['Submitted', 'Under Review', 'Approved', 'Settled'];

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: claim, isLoading } = useQuery({
    queryKey: ['claim', id], queryFn: () => portalApi.getClaim(id as string),
  });

  if (isLoading) return <div className="page-container"><PageLoader /></div>;
  if (!claim) return null;

  const rejected = REJECTED_STATUSES.includes(claim.status);
  const stage = getStageIndex(claim.status);

  return (
    <div className="page-container">
      <button onClick={() => router.back()} className="inline-flex items-center text-gray-400 mb-4">
        <ChevronLeft className="w-5 h-5" />
      </button>

      <h1 className="capitalize mb-1">{claim.claimType.replace(/_/g, ' ')} Claim</h1>
      <p className="text-sm text-gray-400 font-mono mb-6">{claim.claimNumber}</p>

      {rejected ? (
        <div className="mb-6">
          <Alert type="error" message={claim.rejectionReason || 'This claim was not approved.'} />
        </div>
      ) : (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STAGES.map((label, i) => (
              <div key={label} className="flex-1 flex flex-col items-center relative">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10
                  ${i <= stage ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {i < stage ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-[10px] mt-1.5 text-center ${i <= stage ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>{label}</span>
                {i < STAGES.length - 1 && (
                  <div className={`absolute top-3.5 left-1/2 w-full h-0.5 -z-0 ${i < stage ? 'bg-brand-red' : 'bg-gray-100'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card space-y-3">
        {[
          ['Event Date', fmtDate(claim.eventDate)],
          ['Claimed Amount', claim.claimedAmount ? fmtCurrency(claim.claimedAmount, claim.currency) : '—'],
          ['Settlement Amount', claim.settlementAmount ? fmtCurrency(claim.settlementAmount, claim.currency) : 'Pending'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm">
            <span className="text-gray-400">{k}</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center mt-6">
        Questions about this claim? Tap the chat icon for instant help, or visit Support.
      </p>
    </div>
  );
}
