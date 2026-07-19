'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Plus, ShieldCheck, FileText } from 'lucide-react';
import Header from '@/components/layout/Header';
import { StatCard, PageLoader, EmptyState, Modal, Alert } from '@/components/ui';
import { reinsuranceApi } from '@/lib/api';
import { fmtCurrency, fmtDate } from '@/types';

const TREATY_TYPES = [
  { value: 'quota_share', label: 'Quota Share' },
  { value: 'surplus', label: 'Surplus' },
  { value: 'excess_of_loss', label: 'Excess of Loss' },
  { value: 'facultative', label: 'Facultative' },
];

export default function ReinsurancePage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [createError, setCreateError] = useState('');
  const [bordereauPeriod, setBordereauPeriod] = useState(new Date().toISOString().slice(0, 7));

  const [form, setForm] = useState({
    name: '', reinsurerName: '', type: 'quota_share',
    effectiveDate: new Date().toISOString().split('T')[0],
    expiryDate: '', cessionPercentage: '20', retentionLimit: '', maxCessionLimit: '',
    cedingCommissionRate: '15',
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['reinsurance', 'summary'],
    queryFn: reinsuranceApi.summary,
  });

  const { data: treaties, isLoading: treatiesLoading } = useQuery({
    queryKey: ['reinsurance', 'treaties'],
    queryFn: () => reinsuranceApi.treaties({}),
  });

  const { data: bordereaux, isLoading: bordereauxLoading } = useQuery({
    queryKey: ['reinsurance', selected?.id, 'bordereaux'],
    queryFn: () => reinsuranceApi.getBordereaux(selected.id),
    enabled: !!selected,
  });

  const createMutation = useMutation({
    mutationFn: reinsuranceApi.createTreaty,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reinsurance'] }); setShowCreate(false); },
    onError: (e: any) => setCreateError(e?.response?.data?.detail || 'Failed to create treaty'),
  });

  const activateMutation = useMutation({
    mutationFn: reinsuranceApi.activateTreaty,
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['reinsurance'] }); setSelected(data); },
  });

  const bordereauMutation = useMutation({
    mutationFn: ({ treatyId, period }: any) => reinsuranceApi.generateBordereau(treatyId, period),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reinsurance', selected?.id, 'bordereaux'] }),
  });

  const handleCreate = () => {
    setCreateError('');
    createMutation.mutate({
      ...form,
      cessionPercentage: form.cessionPercentage ? parseFloat(form.cessionPercentage) : undefined,
      retentionLimit: form.retentionLimit ? parseFloat(form.retentionLimit) : undefined,
      maxCessionLimit: form.maxCessionLimit ? parseFloat(form.maxCessionLimit) : undefined,
      cedingCommissionRate: form.cedingCommissionRate ? parseFloat(form.cedingCommissionRate) : undefined,
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Reinsurance Accounting"
        subtitle="FIN-09 - Treaty management, cessions, recoveries, bordereaux"
        actions={
          <div className="flex gap-2">
            <Link href="/finance" className="btn-secondary text-xs"><ArrowLeft className="w-3.5 h-3.5"/>Back to Finance</Link>
            <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/>New Treaty</button>
          </div>
        }
      />

      <main className="flex-1 p-6 space-y-5">
        {summaryLoading ? <PageLoader /> : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Active Treaties" value={summary?.activeTreaties ?? 0} colour="default" icon={ShieldCheck} />
            <StatCard label="Total Ceded Premium" value={fmtCurrency(summary?.totalCededPremium ?? 0)} colour="red" icon={FileText} />
            <StatCard label="Recoverable (Pending)" value={fmtCurrency(summary?.totalRecoverable ?? 0)} colour="gold" icon={FileText} />
            <StatCard label="Total Recovered" value={fmtCurrency(summary?.totalRecovered ?? 0)} colour="green" icon={FileText} />
          </div>
        )}

        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-sm">Reinsurance Treaties</h3>
          </div>
          {treatiesLoading ? <PageLoader /> : (treaties?.data ?? []).length === 0 ? (
            <EmptyState title="No treaties configured"
              description="Register a reinsurance treaty to start automatically ceding risk."
              action={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/>New Treaty</button>} />
          ) : (
            <table className="table">
              <thead>
                <tr><th>Treaty Ref</th><th>Reinsurer</th><th>Type</th><th>Terms</th><th>Status</th><th>Expiry</th><th></th></tr>
              </thead>
              <tbody>
                {(treaties?.data ?? []).map((t: any) => (
                  <tr key={t.id}>
                    <td><span className="font-mono text-xs">{t.treatyRef}</span></td>
                    <td className="font-medium">{t.reinsurerName}</td>
                    <td><span className="capitalize text-xs">{t.type.replace(/_/g,' ')}</span></td>
                    <td className="text-xs text-gray-500">
                      {t.type === 'quota_share' || t.type === 'facultative' ? `${t.cessionPercentage}% cession` : `Retention: ${fmtCurrency(t.retentionLimit ?? 0)}`}
                    </td>
                    <td>
                      <span className={`badge-${t.status === 'active' ? 'green' : t.status === 'draft' ? 'gray' : 'red'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="text-gray-400 text-xs">{fmtDate(t.expiryDate)}</td>
                    <td>
                      <button onClick={() => setSelected(t)} className="btn-ghost text-xs">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); }} title="Create Reinsurance Treaty" size="lg">
        <div className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Treaty Name *</label>
              <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} className="input" placeholder="e.g. 2026 Quota Share - All Classes" />
            </div>
            <div>
              <label className="label">Reinsurer Name *</label>
              <input value={form.reinsurerName} onChange={e => setForm(f=>({...f,reinsurerName:e.target.value}))} className="input" placeholder="e.g. ZimRe Holdings" />
            </div>
            <div>
              <label className="label">Treaty Type *</label>
              <select value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))} className="input">
                {TREATY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Effective Date *</label>
              <input type="date" value={form.effectiveDate} onChange={e => setForm(f=>({...f,effectiveDate:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Expiry Date *</label>
              <input type="date" value={form.expiryDate} onChange={e => setForm(f=>({...f,expiryDate:e.target.value}))} className="input" />
            </div>

            {(form.type === 'quota_share' || form.type === 'facultative') && (
              <div>
                <label className="label">Cession Percentage (%) *</label>
                <input type="number" value={form.cessionPercentage} onChange={e => setForm(f=>({...f,cessionPercentage:e.target.value}))} className="input" />
              </div>
            )}
            {(form.type === 'surplus' || form.type === 'excess_of_loss') && (
              <>
                <div>
                  <label className="label">Retention Limit (USD) *</label>
                  <input type="number" value={form.retentionLimit} onChange={e => setForm(f=>({...f,retentionLimit:e.target.value}))} className="input"
                    placeholder={form.type === 'surplus' ? 'Sum insured retained' : 'Claim amount retained'} />
                </div>
                <div>
                  <label className="label">Max Cession Limit (USD)</label>
                  <input type="number" value={form.maxCessionLimit} onChange={e => setForm(f=>({...f,maxCessionLimit:e.target.value}))} className="input" />
                </div>
              </>
            )}
            <div>
              <label className="label">Ceding Commission Rate (%)</label>
              <input type="number" value={form.cedingCommissionRate} onChange={e => setForm(f=>({...f,cedingCommissionRate:e.target.value}))} className="input" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate}
              disabled={!form.name || !form.reinsurerName || !form.expiryDate || createMutation.isPending}
              className="btn-primary">
              {createMutation.isPending ? 'Creating…' : 'Create Treaty'}
            </button>
          </div>
        </div>
      </Modal>

      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`${selected.treatyRef} - ${selected.reinsurerName}`} size="lg">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-gray-400 text-xs">Type</p><p className="font-medium capitalize">{selected.type.replace(/_/g,' ')}</p></div>
              <div><p className="text-gray-400 text-xs">Status</p><p className="font-medium capitalize">{selected.status}</p></div>
              <div><p className="text-gray-400 text-xs">Effective</p><p className="font-medium">{fmtDate(selected.effectiveDate)}</p></div>
              <div><p className="text-gray-400 text-xs">Expiry</p><p className="font-medium">{fmtDate(selected.expiryDate)}</p></div>
            </div>

            {selected.status === 'draft' && (
              <button onClick={() => activateMutation.mutate(selected.id)} className="btn-primary text-xs">
                <ShieldCheck className="w-3.5 h-3.5"/>Activate Treaty
              </button>
            )}

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">Monthly Bordereaux</h4>
                <div className="flex items-center gap-2">
                  <input type="month" value={bordereauPeriod} onChange={e => setBordereauPeriod(e.target.value)} className="input w-36 text-xs" />
                  <button onClick={() => bordereauMutation.mutate({ treatyId: selected.id, period: bordereauPeriod })}
                    disabled={bordereauMutation.isPending} className="btn-primary text-xs">
                    {bordereauMutation.isPending ? 'Generating…' : 'Generate Bordereau'}
                  </button>
                </div>
              </div>
              {bordereauxLoading ? <PageLoader /> : (
                <table className="table">
                  <thead><tr><th>Bordereau No.</th><th>Period</th><th>Ceded Premium</th><th>Recoveries</th><th>Net Due</th><th>Status</th></tr></thead>
                  <tbody>
                    {(bordereaux ?? []).map((b: any) => (
                      <tr key={b.id}>
                        <td className="font-mono text-xs">{b.bordereauNumber}</td>
                        <td>{b.period}</td>
                        <td>{fmtCurrency(b.totalCededPremium)}</td>
                        <td className="text-green-700">{fmtCurrency(b.totalRecoveries)}</td>
                        <td className="font-semibold">{fmtCurrency(b.netDueToReinsurer)}</td>
                        <td><span className="capitalize text-xs">{b.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(bordereaux ?? []).length === 0 && !bordereauxLoading && (
                <p className="text-center text-sm text-gray-400 py-6">No bordereaux generated yet for this treaty</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
