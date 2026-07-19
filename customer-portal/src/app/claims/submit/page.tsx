'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { portalApi } from '@/lib/api';
import { PageLoader, Alert } from '@/components/ui';
import type { Policy } from '@/types';

const CLAIM_TYPES = [
  { value: 'death', label: 'Death' },
  { value: 'permanent_disability', label: 'Permanent Disability' },
  { value: 'temporary_disability', label: 'Temporary Disability' },
  { value: 'medical_inpatient', label: 'Medical (Inpatient)' },
  { value: 'medical_outpatient', label: 'Medical (Outpatient)' },
  { value: 'property_loss', label: 'Property Loss' },
  { value: 'property_damage', label: 'Property Damage' },
  { value: 'travel_cancellation', label: 'Travel Cancellation' },
  { value: 'baggage_loss', label: 'Baggage Loss' },
];

export default function SubmitClaimPage() {
  const router = useRouter();
  const [policyId, setPolicyId] = useState('');
  const [claimType, setClaimType] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [error, setError] = useState('');

  const { data: policiesData, isLoading } = useQuery({
    queryKey: ['my-policies'], queryFn: portalApi.getPolicies,
  });

  const activePolicies: Policy[] = (policiesData?.data || []).filter((p: Policy) => p.status === 'active');

  const submitMutation = useMutation({
    mutationFn: () => portalApi.submitClaim({
      policyId, claimType, eventDate,
      eventDescription: description,
      claimedAmount: claimedAmount ? Number(claimedAmount) : undefined,
      currency: 'USD',
    }),
    onSuccess: (claim) => router.push(`/claims/${claim.id}`),
    onError: (e: any) => setError(e?.response?.data?.detail || 'Submission failed. Please try again.'),
  });

  if (isLoading) return <div className="page-container"><PageLoader /></div>;

  return (
    <div className="page-container">
      <button onClick={() => router.back()} className="inline-flex items-center text-gray-400 mb-4">
        <ChevronLeft className="w-5 h-5" />
      </button>

      <h1 className="mb-1">File a Claim</h1>
      <p className="text-sm text-gray-400 mb-5">We&apos;ll guide you through every step</p>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      {activePolicies.length === 0 ? (
        <Alert type="warning" message="You need an active policy to file a claim. Get a quote to purchase one." />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Which policy is this for?</label>
            <div className="space-y-2">
              {activePolicies.map(p => (
                <button key={p.id} onClick={() => setPolicyId(p.id)}
                  className={`card w-full text-left ${policyId === p.id ? 'border-2 border-brand-red' : ''}`}>
                  <p className="font-semibold text-sm">{p.product?.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{p.policyNumber}</p>
                </button>
              ))}
            </div>
          </div>

          {policyId && (
            <>
              <div>
                <label className="label">What happened?</label>
                <select value={claimType} onChange={e => setClaimType(e.target.value)} className="input">
                  <option value="">Select a claim type</option>
                  {CLAIM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="label">When did it happen?</label>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="input" />
              </div>

              <div>
                <label className="label">Tell us what happened</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                  className="input resize-none" placeholder="Describe the event in your own words…" />
              </div>

              <div>
                <label className="label">Estimated amount (optional)</label>
                <input type="number" value={claimedAmount} onChange={e => setClaimedAmount(e.target.value)}
                  className="input" placeholder="USD 0.00" />
              </div>

              <button
                onClick={() => { setError(''); submitMutation.mutate(); }}
                disabled={!claimType || !description || submitMutation.isPending}
                className="btn-primary mt-2"
              >
                {submitMutation.isPending ? 'Submitting…' : 'Submit Claim'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                You can add supporting documents like photos or receipts after submitting.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
