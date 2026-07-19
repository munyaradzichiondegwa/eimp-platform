'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft, Download, CreditCard } from 'lucide-react';
import { portalApi, fetchAuthedBlob } from '@/lib/api';
import { PageLoader, StatusBadge, Sheet, Alert } from '@/components/ui';
import { fmtCurrency, fmtDate } from '@/types';

const PAYMENT_CHANNELS = [
  { value: 'ecocash', label: 'EcoCash' },
  { value: 'onemoney', label: 'OneMoney' },
  { value: 'innbucks', label: 'InnBucks' },
];

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [showPay, setShowPay] = useState(false);
  const [channel, setChannel] = useState('ecocash');
  const [phone, setPhone] = useState('');
  const [payError, setPayError] = useState('');
  const [downloading, setDownloading] = useState('');

  const { data: policy, isLoading } = useQuery({
    queryKey: ['policy', id], queryFn: () => portalApi.getPolicy(id as string),
  });

  const payMutation = useMutation({
    mutationFn: () => portalApi.initiatePayment({
      channel, amount: Number(policy.outstandingPremium), currency: policy.currency,
      phoneNumber: phone, reference: policy.policyNumber,
      description: `Premium payment - ${policy.policyNumber}`, policyId: policy.id,
    }),
    onSuccess: () => { setShowPay(false); router.refresh(); },
    onError: (e: any) => setPayError(e?.response?.data?.detail || 'Payment failed. Please try again.'),
  });

  const downloadDoc = async (type: 'schedule' | 'certificate') => {
    setDownloading(type);
    try {
      const url = type === 'schedule'
        ? portalApi.downloadScheduleUrl(id as string)
        : portalApi.downloadCertificateUrl(id as string);
      const blob = await fetchAuthedBlob(url);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${policy.policyNumber}-${type}.pdf`;
      link.click();
    } catch {
      alert('Download failed. Please try again.');
    } finally {
      setDownloading('');
    }
  };

  if (isLoading) return <div className="page-container"><PageLoader /></div>;
  if (!policy) return null;

  return (
    <div className="page-container">
      <button onClick={() => router.back()} className="inline-flex items-center text-gray-400 mb-4">
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg">{policy.product?.name}</h1>
        <StatusBadge status={policy.status} />
      </div>
      <p className="text-sm text-gray-400 font-mono mb-5">{policy.policyNumber}</p>

      <div className="card mb-4 space-y-3">
        {[
          ['Sum Insured', fmtCurrency(policy.sumInsured, policy.currency)],
          ['Premium', fmtCurrency(policy.grossPremium, policy.currency)],
          ['Start Date', fmtDate(policy.startDate)],
          ['End Date', fmtDate(policy.endDate)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm">
            <span className="text-gray-400">{k}</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
      </div>

      {Number(policy.outstandingPremium) > 0 && (
        <div className="card mb-4 bg-red-50 border-red-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-red-500">Outstanding</p>
              <p className="text-lg font-bold text-red-700">{fmtCurrency(policy.outstandingPremium, policy.currency)}</p>
            </div>
          </div>
          <button onClick={() => setShowPay(true)} className="btn-primary">
            <CreditCard className="w-4 h-4" /> Pay Now
          </button>
        </div>
      )}

      <div className="section-title">Documents</div>
      <div className="space-y-2">
        <button onClick={() => downloadDoc('schedule')} disabled={!!downloading} className="card w-full flex items-center justify-between">
          <span className="font-medium text-sm">Policy Schedule</span>
          <Download className={`w-4 h-4 text-brand-red ${downloading === 'schedule' ? 'animate-bounce' : ''}`} />
        </button>
        <button onClick={() => downloadDoc('certificate')} disabled={!!downloading} className="card w-full flex items-center justify-between">
          <span className="font-medium text-sm">Certificate of Insurance</span>
          <Download className={`w-4 h-4 text-brand-red ${downloading === 'certificate' ? 'animate-bounce' : ''}`} />
        </button>
      </div>

      <Sheet open={showPay} onClose={() => setShowPay(false)} title="Pay Premium">
        <div className="space-y-4">
          {payError && <Alert type="error" message={payError} />}
          <p className="text-sm text-gray-500">Amount due: <strong>{fmtCurrency(policy.outstandingPremium, policy.currency)}</strong></p>
          <div>
            <label className="label">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_CHANNELS.map(c => (
                <button key={c.value} onClick={() => setChannel(c.value)}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 ${channel === c.value ? 'border-brand-red bg-brand-red-light text-brand-red' : 'border-gray-200 text-gray-500'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Mobile Number</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="input" placeholder="+263712345678" />
          </div>
          <button onClick={() => payMutation.mutate()} disabled={!phone || payMutation.isPending} className="btn-primary">
            {payMutation.isPending ? 'Processing…' : `Pay ${fmtCurrency(policy.outstandingPremium, policy.currency)}`}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
