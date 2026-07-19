'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { api, portalApi } from '@/lib/api';
import { PageLoader, Alert } from '@/components/ui';
import { fmtCurrency, fmtDate } from '@/types';

export default function BuyPolicyPage() {
  const router = useRouter();
  const [step, setStep] = useState<'product' | 'details' | 'quote'>('product');
  const [productId, setProductId] = useState('');
  const [sumInsured, setSumInsured] = useState('');
  const [termMonths, setTermMonths] = useState('12');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/underwriting/products', { params: { activeOnly: true } }).then(r => r.data),
  });

  const portalProducts = (products || []).filter((p: any) => p.isPortalSellable);
  const selectedProduct = portalProducts.find((p: any) => p.id === productId);

  const quoteMutation = useMutation({
    mutationFn: () => portalApi.getQuote({
      productId, sumInsured: Number(sumInsured), currency: 'USD',
      startDate, termMonths: Number(termMonths),
    }),
    onSuccess: (data) => { setQuote(data); setStep('quote'); },
    onError: (e: any) => setError(e?.response?.data?.detail || 'Could not generate a quote. Please check your details.'),
  });

  const purchaseMutation = useMutation({
    mutationFn: () => portalApi.purchasePolicy({
      productId, sumInsured: Number(sumInsured), currency: 'USD',
      startDate, termMonths: Number(termMonths),
    }),
    onSuccess: (policy) => router.push(`/policies/${policy.id}`),
    onError: (e: any) => setError(e?.response?.data?.detail || 'Purchase failed. Please try again.'),
  });

  return (
    <div className="page-container">
      <button onClick={() => step === 'product' ? router.back() : setStep(step === 'quote' ? 'details' : 'product')}
        className="inline-flex items-center text-gray-400 mb-4">
        <ChevronLeft className="w-5 h-5" />
      </button>

      <h1 className="mb-1">Get a Quote</h1>
      <p className="text-sm text-gray-400 mb-5">
        {step === 'product' && 'Choose a product to insure'}
        {step === 'details' && 'Tell us about your coverage needs'}
        {step === 'quote' && 'Review your quote'}
      </p>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      {step === 'product' && (
        productsLoading ? <PageLoader /> : (
          <div className="space-y-3">
            {portalProducts.map((p: any) => (
              <button key={p.id} onClick={() => { setProductId(p.id); setStep('details'); }}
                className="card w-full text-left active:scale-[0.98] transition-transform">
                <p className="font-bold text-sm">{p.name}</p>
                <p className="text-xs text-gray-400 mt-1">{p.description}</p>
              </button>
            ))}
            {portalProducts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No products available for online purchase right now.</p>
            )}
          </div>
        )
      )}

      {step === 'details' && selectedProduct && (
        <div className="space-y-4">
          <div className="card bg-gray-50">
            <p className="font-semibold text-sm">{selectedProduct.name}</p>
          </div>

          <div>
            <label className="label">Sum Insured (USD)</label>
            <input type="number" value={sumInsured} onChange={e => setSumInsured(e.target.value)}
              className="input" placeholder={`Min ${selectedProduct.coverageConfig?.minSumInsured ?? ''} - Max ${selectedProduct.coverageConfig?.maxSumInsured ?? ''}`} />
          </div>

          <div>
            <label className="label">Cover Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
          </div>

          <div>
            <label className="label">Term Length</label>
            <div className="grid grid-cols-4 gap-2">
              {['1', '3', '6', '12'].map(m => (
                <button key={m} onClick={() => setTermMonths(m)}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 ${termMonths === m ? 'border-brand-red bg-brand-red-light text-brand-red' : 'border-gray-200 text-gray-500'}`}>
                  {m}mo
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => { setError(''); quoteMutation.mutate(); }}
            disabled={!sumInsured || quoteMutation.isPending} className="btn-primary mt-2">
            {quoteMutation.isPending ? 'Calculating…' : 'Get My Quote'}
          </button>
        </div>
      )}

      {step === 'quote' && quote && (
        <div className="space-y-4">
          <div className="card bg-brand-red text-white">
            <p className="text-xs text-white/70">Your premium</p>
            <p className="text-3xl font-bold mt-1">{fmtCurrency(quote.grossPremium, quote.currency)}</p>
            <p className="text-xs text-white/70 mt-1">for {quote.termMonths} months</p>
          </div>

          <div className="card space-y-2">
            {[
              ['Sum Insured', fmtCurrency(quote.sumInsured, quote.currency)],
              ['Net Premium', fmtCurrency(quote.netPremium, quote.currency)],
              ['Tax', fmtCurrency(quote.taxAmount, quote.currency)],
              ['Cover Starts', fmtDate(quote.startDate)],
              ['Cover Ends', fmtDate(quote.endDate)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-gray-400">{k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
          </div>

          {quote.underwritingDecision === 'referred' && (
            <Alert type="warning" message="Your application needs a quick review by our underwriting team before it's confirmed. We'll notify you within 24 hours." />
          )}

          <button onClick={() => purchaseMutation.mutate()} disabled={purchaseMutation.isPending} className="btn-primary">
            {purchaseMutation.isPending ? 'Processing…' : 'Confirm & Purchase'}
          </button>
        </div>
      )}
    </div>
  );
}
