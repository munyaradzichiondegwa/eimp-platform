'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Eye, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import Header from '@/components/layout/Header';
import { StatusBadge, PageLoader, EmptyState, Modal, Pagination, Alert, StatCard } from '@/components/ui';
import { policiesApi, productsApi, customersApi } from '@/lib/api';
import { fmtCurrency, fmtDate, type Policy, type PaginatedResponse } from '@/types';
import { FileText, DollarSign, AlertCircle, Clock } from 'lucide-react';

export default function PoliciesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showIssue, setShowIssue] = useState(false);
  const [selected, setSelected] = useState<Policy | null>(null);
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [issueError, setIssueError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const [quoteForm, setQuoteForm] = useState({
    productId: '', customerId: '', sumInsured: '', currency: 'USD',
    startDate: new Date().toISOString().split('T')[0],
    termMonths: '12', distributionChannel: 'direct_staff',
  });

  const { data, isLoading } = useQuery<PaginatedResponse<Policy>>({
    queryKey: ['policies', search, statusFilter, page],
    queryFn: () => policiesApi.list({ search, status: statusFilter, page, limit: 20 }),
  });

  const { data: stats } = useQuery({ queryKey: ['policies', 'stats'], queryFn: policiesApi.stats });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list(true) });

  const quoteMutation = useMutation({
    mutationFn: policiesApi.quote,
    onSuccess: setQuoteResult,
    onError: (e: any) => setIssueError(e?.response?.data?.detail || 'Quotation failed'),
  });

  const issueMutation = useMutation({
    mutationFn: policiesApi.issue,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['policies'] }); setShowIssue(false); setQuoteResult(null); },
    onError: (e: any) => setIssueError(e?.response?.data?.detail || 'Issue failed'),
  });

  const activateMutation = useMutation({
    mutationFn: policiesApi.activate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: any) => policiesApi.cancel(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['policies'] }); setShowCancel(false); setSelected(null); },
  });

  const renewMutation = useMutation({
    mutationFn: policiesApi.renew,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  });

  const handleQuote = () => {
    setIssueError('');
    quoteMutation.mutate({
      ...quoteForm,
      sumInsured: parseFloat(quoteForm.sumInsured),
      termMonths: parseInt(quoteForm.termMonths),
    });
  };

  const handleIssue = () => {
    if (!quoteResult) return;
    issueMutation.mutate({
      ...quoteForm,
      sumInsured: parseFloat(quoteForm.sumInsured),
      termMonths: parseInt(quoteForm.termMonths),
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Policies"
        subtitle={`${data?.total ?? 0} total`}
        actions={<button onClick={() => setShowIssue(true)} className="btn-primary"><Plus className="w-4 h-4" /> Issue Policy</button>}
      />
      <main className="flex-1 p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active" value={stats?.active ?? 0} colour="green" icon={FileText} />
          <StatCard label="Pending Payment" value={stats?.pendingPayment ?? 0} colour="gold" icon={Clock} />
          <StatCard label="Expiring (30 days)" value={stats?.expiringSoon ?? 0} colour="red" icon={AlertCircle} />
          <StatCard label="Total GWP" value={fmtCurrency(stats?.totalGwp ?? 0)} colour="default" icon={DollarSign} />
        </div>

        <div className="card p-0 overflow-hidden">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 p-4 border-b border-gray-100">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Policy number, email…" className="input pl-9" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input w-44">
              <option value="">All Statuses</option>
              {['active','pending_payment','quotation','lapsed','cancelled','expired','renewed'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          {isLoading ? <PageLoader /> : data?.data.length === 0 ? (
            <EmptyState title="No policies found"
              action={<button onClick={() => setShowIssue(true)} className="btn-primary"><Plus className="w-4 h-4"/>Issue Policy</button>} />
          ) : (
            <>
              <div className="table-container border-0 rounded-none">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Policy No.</th><th>Customer</th><th>Product</th>
                      <th>Sum Insured</th><th>Premium</th><th>Start</th><th>End</th><th>Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.data.map(p => (
                      <tr key={p.id}>
                        <td><span className="font-mono text-xs">{p.policyNumber}</span></td>
                        <td>{p.customer?.email || '—'}</td>
                        <td>{p.product?.name || '—'}</td>
                        <td>{fmtCurrency(p.sumInsured, p.currency)}</td>
                        <td className="font-semibold">{fmtCurrency(p.grossPremium, p.currency)}</td>
                        <td className="text-gray-400">{fmtDate(p.startDate)}</td>
                        <td className="text-gray-400">{fmtDate(p.endDate)}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td>
                          <div className="flex gap-1">
                            <button onClick={() => setSelected(p)} className="btn-ghost text-xs"><Eye className="w-3.5 h-3.5"/>View</button>
                            {p.status === 'pending_payment' && (
                              <button onClick={() => activateMutation.mutate(p.id)} className="btn-ghost text-xs text-green-600">
                                <CheckCircle className="w-3.5 h-3.5"/>Activate
                              </button>
                            )}
                            {p.status === 'active' && (
                              <button onClick={() => renewMutation.mutate(p.id)} className="btn-ghost text-xs text-blue-600">
                                <RefreshCw className="w-3.5 h-3.5"/>Renew
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={data?.total ?? 0} limit={20} onChange={setPage} />
            </>
          )}
        </div>
      </main>

      {/* Issue Policy Modal */}
      <Modal open={showIssue} onClose={() => { setShowIssue(false); setQuoteResult(null); setIssueError(''); }} title="Issue New Policy" size="lg">
        <div className="space-y-4">
          {issueError && <Alert type="error" message={issueError} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Product *</label>
              <select value={quoteForm.productId} onChange={e => setQuoteForm(f => ({...f, productId: e.target.value}))} className="input">
                <option value="">Select product…</option>
                {(products as any[])?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Customer ID (UUID) *</label>
              <input value={quoteForm.customerId} onChange={e => setQuoteForm(f => ({...f, customerId: e.target.value}))}
                className="input" placeholder="Paste customer UUID" />
            </div>
            <div>
              <label className="label">Sum Insured (USD) *</label>
              <input type="number" value={quoteForm.sumInsured} onChange={e => setQuoteForm(f => ({...f, sumInsured: e.target.value}))}
                className="input" placeholder="e.g. 5000" />
            </div>
            <div>
              <label className="label">Currency</label>
              <select value={quoteForm.currency} onChange={e => setQuoteForm(f => ({...f, currency: e.target.value}))} className="input">
                {['USD','ZIG','ZAR','GBP'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start Date *</label>
              <input type="date" value={quoteForm.startDate} onChange={e => setQuoteForm(f => ({...f, startDate: e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Term (months)</label>
              <select value={quoteForm.termMonths} onChange={e => setQuoteForm(f => ({...f, termMonths: e.target.value}))} className="input">
                {[1,3,6,12,24,36].map(m => <option key={m} value={m}>{m} month{m>1?'s':''}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Distribution Channel</label>
              <select value={quoteForm.distributionChannel} onChange={e => setQuoteForm(f => ({...f, distributionChannel: e.target.value}))} className="input">
                <option value="direct_staff">Direct (Staff)</option>
                <option value="broker">Broker</option>
                <option value="customer_portal">Customer Portal</option>
                <option value="mobile_app">Mobile App</option>
              </select>
            </div>
          </div>

          {quoteResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3 text-sm">
              <h4 className="font-semibold text-gray-900 mb-1">Quotation Result</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Net Premium', fmtCurrency(quoteResult.netPremium, quoteResult.currency)],
                  ['Tax', fmtCurrency(quoteResult.taxAmount, quoteResult.currency)],
                  ['Levy', fmtCurrency(quoteResult.levyAmount, quoteResult.currency)],
                  ['Gross Premium', fmtCurrency(quoteResult.grossPremium, quoteResult.currency)],
                  ['Decision', quoteResult.underwritingDecision.replace(/_/g,' ')],
                  ['Start Date', fmtDate(quoteResult.startDate)],
                  ['End Date', fmtDate(quoteResult.endDate)],
                ].map(([k,v]) => (
                  <div key={k}><span className="text-gray-500">{k}: </span><span className="font-semibold">{v}</span></div>
                ))}
              </div>

              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500">Risk Score</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{quoteResult.riskScore}/100</span>
                    {quoteResult.riskBand && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize
                        ${quoteResult.riskBand === 'low' ? 'bg-green-100 text-green-700'
                          : quoteResult.riskBand === 'medium' ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'}`}>
                        {quoteResult.riskBand}
                      </span>
                    )}
                  </div>
                </div>
                {quoteResult.riskFactors?.length > 0 ? (
                  <ul className="space-y-1">
                    {quoteResult.riskFactors.map((f: any, i: number) => (
                      <li key={i} className="flex items-start justify-between gap-2 text-xs text-gray-600">
                        <span>{f.description}</span>
                        <span className="font-mono text-gray-400 flex-shrink-0">+{f.impact}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400">No risk factors applied — base score only.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => { setShowIssue(false); setQuoteResult(null); }} className="btn-secondary">Cancel</button>
            {!quoteResult ? (
              <button onClick={handleQuote} disabled={!quoteForm.productId || !quoteForm.customerId || !quoteForm.sumInsured || quoteMutation.isPending} className="btn-primary">
                {quoteMutation.isPending ? 'Calculating…' : 'Generate Quote'}
              </button>
            ) : (
              <button onClick={handleIssue} disabled={issueMutation.isPending} className="btn-primary">
                {issueMutation.isPending ? 'Issuing…' : 'Issue Policy'}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Policy Detail Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`Policy — ${selected.policyNumber}`} size="lg">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Policy Number', selected.policyNumber],
                ['Status', null],
                ['Product', selected.product?.name || '—'],
                ['Customer', selected.customer?.email || '—'],
                ['Sum Insured', fmtCurrency(selected.sumInsured, selected.currency)],
                ['Gross Premium', fmtCurrency(selected.grossPremium, selected.currency)],
                ['Start Date', fmtDate(selected.startDate)],
                ['End Date', fmtDate(selected.endDate)],
                ['Channel', selected.distributionChannel.replace(/_/g,' ')],
                ['Outstanding', fmtCurrency(selected.outstandingPremium, selected.currency)],
              ].map(([k,v]) => (
                <div key={String(k)}>
                  <p className="text-gray-400 text-xs mb-0.5">{k}</p>
                  {k === 'Status' ? <StatusBadge status={selected.status} /> : <p className="font-medium">{v as string}</p>}
                </div>
              ))}
            </div>
            {selected.status === 'active' && (
              <div className="flex gap-3 pt-2 border-t">
                <button onClick={() => { setShowCancel(true); }} className="btn-secondary text-xs text-red-600">
                  <XCircle className="w-3.5 h-3.5"/>Cancel Policy
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
