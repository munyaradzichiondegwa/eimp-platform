'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Eye, AlertTriangle } from 'lucide-react';
import Header from '@/components/layout/Header';
import { StatusBadge, PageLoader, EmptyState, Modal, Pagination, Alert, StatCard } from '@/components/ui';
import { claimsApi } from '@/lib/api';
import { fmtCurrency, fmtDate, type Claim, type PaginatedResponse } from '@/types';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

const CLAIM_TYPES = [
  'death','permanent_disability','temporary_disability','medical_inpatient',
  'medical_outpatient','property_loss','property_damage','weather_trigger',
  'travel_cancellation','medical_evacuation','baggage_loss',
];

export default function ClaimsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fraudFilter, setFraudFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showFnol, setShowFnol] = useState(false);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [fnolError, setFnolError] = useState('');
  const [fnolForm, setFnolForm] = useState({
    policyId: '', customerId: '', claimType: 'death', channel: 'web_portal',
    eventDate: new Date().toISOString().split('T')[0],
    eventDescription: '', claimedAmount: '', currency: 'USD',
  });
  const [settleForm, setSettleForm] = useState({ settlementAmount: '', paymentChannel: 'ecocash', accountNumber: '' });

  const { data, isLoading } = useQuery<PaginatedResponse<Claim>>({
    queryKey: ['claims', search, statusFilter, fraudFilter, page],
    queryFn: () => claimsApi.list({
      search, status: statusFilter,
      fraudFlagged: fraudFilter === 'true' ? true : fraudFilter === 'false' ? false : undefined,
      page, limit: 20,
    }),
  });

  const { data: stats } = useQuery({ queryKey: ['claims', 'stats'], queryFn: claimsApi.stats });

  const fnolMutation = useMutation({
    mutationFn: claimsApi.submit,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['claims'] }); setShowFnol(false); },
    onError: (e: any) => setFnolError(e?.response?.data?.detail || 'FNOL submission failed'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, data }: any) => claimsApi.updateStatus(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['claims'] }); setSelected(null); },
  });

  const settleMutation = useMutation({
    mutationFn: ({ id, data }: any) => claimsApi.settle(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['claims'] }); setSelected(null); },
  });

  const handleFnol = () => {
    setFnolError('');
    fnolMutation.mutate({
      ...fnolForm,
      claimedAmount: fnolForm.claimedAmount ? parseFloat(fnolForm.claimedAmount) : undefined,
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Claims Management"
        subtitle={`${data?.total ?? 0} total`}
        actions={<button onClick={() => setShowFnol(true)} className="btn-primary"><Plus className="w-4 h-4"/>Submit FNOL</button>}
      />
      <main className="flex-1 p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Open Claims" value={stats?.open ?? 0} colour="red" icon={AlertCircle} />
          <StatCard label="Settled" value={stats?.settled ?? 0} colour="green" icon={CheckCircle} />
          <StatCard label="Total Reserved" value={fmtCurrency(stats?.totalReserved ?? 0)} colour="gold" icon={Clock} />
          <StatCard label="Fraud Flagged" value={stats?.fraudFlagged ?? 0}
            colour={stats?.fraudFlagged > 0 ? 'red' : 'green'} icon={AlertTriangle} />
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="flex flex-wrap gap-3 p-4 border-b border-gray-100">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Claim number, email, policy number…" className="input pl-9" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input w-48">
              <option value="">All Statuses</option>
              {['fnol_submitted','registered','under_assessment','approved','rejected','settlement_processing','settled','fraud_investigation'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
              ))}
            </select>
            <select value={fraudFilter} onChange={e => { setFraudFilter(e.target.value); setPage(1); }} className="input w-40">
              <option value="">All Claims</option>
              <option value="true">Fraud Flagged</option>
              <option value="false">Clean Only</option>
            </select>
          </div>

          {isLoading ? <PageLoader /> : data?.data.length === 0 ? (
            <EmptyState title="No claims found"
              action={<button onClick={() => setShowFnol(true)} className="btn-primary"><Plus className="w-4 h-4"/>Submit FNOL</button>} />
          ) : (
            <>
              <div className="table-container border-0 rounded-none">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Claim No.</th><th>Policy</th><th>Type</th>
                      <th>Claimed</th><th>Reserve</th><th>Fraud</th><th>FNOL Date</th><th>Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.data.map(c => (
                      <tr key={c.id}>
                        <td><span className="font-mono text-xs">{c.claimNumber}</span></td>
                        <td><span className="text-xs text-gray-500">{c.policy?.policyNumber || '—'}</span></td>
                        <td><span className="text-xs capitalize">{c.claimType.replace(/_/g,' ')}</span></td>
                        <td>{c.claimedAmount ? fmtCurrency(c.claimedAmount, c.currency) : '—'}</td>
                        <td>{fmtCurrency(c.reserveAmount, c.currency)}</td>
                        <td>
                          {c.fraudFlagged
                            ? <span className="badge-red flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3"/>Flagged</span>
                            : <span className="badge-green">Clean</span>}
                        </td>
                        <td className="text-gray-400">{fmtDate(c.fnolDate)}</td>
                        <td><StatusBadge status={c.status} type="claim" /></td>
                        <td>
                          <button onClick={() => setSelected(c)} className="btn-ghost text-xs">
                            <Eye className="w-3.5 h-3.5"/>View
                          </button>
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

      {/* FNOL Modal */}
      <Modal open={showFnol} onClose={() => { setShowFnol(false); setFnolError(''); }} title="Submit First Notice of Loss (FNOL)" size="lg">
        <div className="space-y-4">
          {fnolError && <Alert type="error" message={fnolError} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Policy ID (UUID) *</label>
              <input value={fnolForm.policyId} onChange={e => setFnolForm(f=>({...f,policyId:e.target.value}))} className="input" placeholder="Paste policy UUID" />
            </div>
            <div className="col-span-2">
              <label className="label">Customer ID (UUID) *</label>
              <input value={fnolForm.customerId} onChange={e => setFnolForm(f=>({...f,customerId:e.target.value}))} className="input" placeholder="Paste customer UUID" />
            </div>
            <div>
              <label className="label">Claim Type *</label>
              <select value={fnolForm.claimType} onChange={e => setFnolForm(f=>({...f,claimType:e.target.value}))} className="input">
                {CLAIM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Submission Channel</label>
              <select value={fnolForm.channel} onChange={e => setFnolForm(f=>({...f,channel:e.target.value}))} className="input">
                {['web_portal','mobile_app','call_centre','broker_portal','walk_in','email'].map(c=>(
                  <option key={c} value={c}>{c.replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Event Date *</label>
              <input type="date" value={fnolForm.eventDate} onChange={e => setFnolForm(f=>({...f,eventDate:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Claimed Amount</label>
              <input type="number" value={fnolForm.claimedAmount} onChange={e => setFnolForm(f=>({...f,claimedAmount:e.target.value}))} className="input" placeholder="0.00" />
            </div>
            <div className="col-span-2">
              <label className="label">Event Description</label>
              <textarea value={fnolForm.eventDescription} onChange={e => setFnolForm(f=>({...f,eventDescription:e.target.value}))}
                rows={3} className="input resize-none" placeholder="Describe the insured event…" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowFnol(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleFnol} disabled={!fnolForm.policyId || !fnolForm.customerId || fnolMutation.isPending} className="btn-primary">
              {fnolMutation.isPending ? 'Submitting…' : 'Submit FNOL'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Claim Detail & Action Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`Claim — ${selected.claimNumber}`} size="xl">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Claim Number', selected.claimNumber],
                ['Status', null],
                ['Policy', selected.policy?.policyNumber||'—'],
                ['Claim Type', selected.claimType.replace(/_/g,' ')],
                ['Event Date', fmtDate(selected.eventDate)],
                ['Claimed', selected.claimedAmount ? fmtCurrency(selected.claimedAmount,selected.currency) : '—'],
                ['Reserve', fmtCurrency(selected.reserveAmount,selected.currency)],
                ['Approved', selected.approvedAmount ? fmtCurrency(selected.approvedAmount,selected.currency) : '—'],
                ['Settled', selected.settlementAmount ? fmtCurrency(selected.settlementAmount,selected.currency) : '—'],
                ['Fraud Score', `${selected.fraudScore}/100`],
              ].map(([k,v]) => (
                <div key={String(k)}>
                  <p className="text-gray-400 text-xs mb-0.5">{k}</p>
                  {k==='Status' ? <StatusBadge status={selected.status} type="claim"/> : <p className="font-medium capitalize">{v as string}</p>}
                </div>
              ))}
            </div>
            {selected.eventDescription && (
              <div><p className="text-gray-400 text-xs mb-1">Event Description</p><p className="text-sm bg-gray-50 p-3 rounded">{selected.eventDescription}</p></div>
            )}
            {/* Workflow Actions */}
            {selected.fraudFlagged && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded">
                <AlertTriangle className="w-4 h-4 text-red-600"/>
                <p className="text-sm text-red-700 font-medium">Fraud flags: {selected.fraudScore}/100 risk score. Review before proceeding.</p>
              </div>
            )}
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">Workflow Actions</h4>
              <div className="flex flex-wrap gap-2">
                {selected.status === 'fnol_submitted' && (
                  <button onClick={() => statusMutation.mutate({id: selected.id, data:{status:'registered'}})}
                    className="btn-primary text-xs">Register Claim</button>
                )}
                {selected.status === 'registered' && (
                  <button onClick={() => statusMutation.mutate({id: selected.id, data:{status:'under_assessment'}})}
                    className="btn-primary text-xs">Start Assessment</button>
                )}
                {selected.status === 'under_assessment' && (
                  <>
                    <button onClick={() => statusMutation.mutate({id: selected.id, data:{status:'approved', approvedAmount: selected.claimedAmount, reserveAmount: selected.claimedAmount}})}
                      className="btn-primary text-xs">Approve</button>
                    <button onClick={() => statusMutation.mutate({id: selected.id, data:{status:'rejected', rejectionReason:'Claim does not meet policy terms'}})}
                      className="btn-secondary text-xs text-red-600">Reject</button>
                  </>
                )}
                {(selected.status === 'approved' || selected.status === 'partially_approved') && (
                  <div className="w-full space-y-3">
                    <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Initiate Settlement</h5>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="label">Amount</label>
                        <input type="number" value={settleForm.settlementAmount}
                          onChange={e=>setSettleForm(f=>({...f,settlementAmount:e.target.value}))} className="input"/></div>
                      <div><label className="label">Channel</label>
                        <select value={settleForm.paymentChannel} onChange={e=>setSettleForm(f=>({...f,paymentChannel:e.target.value}))} className="input">
                          {['ecocash','onemoney','innbucks','bank_transfer','rtgs'].map(c=><option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
                        </select></div>
                      <div><label className="label">Account / Phone</label>
                        <input value={settleForm.accountNumber} onChange={e=>setSettleForm(f=>({...f,accountNumber:e.target.value}))} className="input" placeholder="+263…"/></div>
                    </div>
                    <button onClick={() => settleMutation.mutate({id: selected.id, data:{...settleForm, settlementAmount: parseFloat(settleForm.settlementAmount)}})}
                      disabled={!settleForm.settlementAmount || settleMutation.isPending} className="btn-primary text-xs">
                      {settleMutation.isPending ? 'Processing…' : 'Process Settlement'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
