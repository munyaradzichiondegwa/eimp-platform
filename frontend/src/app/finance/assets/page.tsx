'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Plus, Building2, TrendingDown } from 'lucide-react';
import Header from '@/components/layout/Header';
import { StatCard, PageLoader, EmptyState, Modal, Alert } from '@/components/ui';
import { fixedAssetsApi } from '@/lib/api';
import { fmtCurrency } from '@/types';

const CATEGORIES = [
  { value: 'it_equipment', label: 'IT Equipment' },
  { value: 'office_furniture', label: 'Office Furniture' },
  { value: 'motor_vehicle', label: 'Motor Vehicle' },
  { value: 'building', label: 'Building' },
  { value: 'leasehold_improvement', label: 'Leasehold Improvement' },
  { value: 'other', label: 'Other' },
];

export default function FixedAssetsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showDispose, setShowDispose] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [createError, setCreateError] = useState('');
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [disposeForm, setDisposeForm] = useState({ proceeds: '', notes: '' });

  const [form, setForm] = useState({
    description: '', category: 'it_equipment',
    acquisitionDate: new Date().toISOString().split('T')[0],
    cost: '', residualValue: '0', usefulLifeMonths: '36',
    depreciationMethod: 'straight_line', location: '', custodian: '',
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['assets', 'summary'],
    queryFn: fixedAssetsApi.summary,
  });

  const { data: assets, isLoading: assetsLoading } = useQuery({
    queryKey: ['assets', 'list'],
    queryFn: () => fixedAssetsApi.list({ limit: 50 }),
  });

  const createMutation = useMutation({
    mutationFn: fixedAssetsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); setShowCreate(false); },
    onError: (e: any) => setCreateError(e?.response?.data?.detail || 'Failed to register asset'),
  });

  const depreciationMutation = useMutation({
    mutationFn: fixedAssetsApi.runDepreciation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });

  const disposeMutation = useMutation({
    mutationFn: ({ id, proceeds, notes }: any) => fixedAssetsApi.dispose(id, proceeds, notes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); setShowDispose(false); setSelected(null); },
  });

  const handleCreate = () => {
    setCreateError('');
    createMutation.mutate({
      ...form,
      cost: parseFloat(form.cost),
      residualValue: parseFloat(form.residualValue),
      usefulLifeMonths: parseInt(form.usefulLifeMonths),
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Fixed Asset Register"
        subtitle="FIN-06 - Asset tracking with automated depreciation"
        actions={
          <div className="flex gap-2">
            <Link href="/finance" className="btn-secondary text-xs"><ArrowLeft className="w-3.5 h-3.5"/>Back to Finance</Link>
            <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/>Register Asset</button>
          </div>
        }
      />

      <main className="flex-1 p-6 space-y-5">
        {summaryLoading ? <PageLoader /> : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Assets" value={summary?.totalAssets ?? 0} colour="default" icon={Building2} />
            <StatCard label="Total Cost" value={fmtCurrency(summary?.totalCost ?? 0)} colour="gold" icon={Building2} />
            <StatCard label="Accumulated Depreciation" value={fmtCurrency(summary?.totalAccumulatedDepreciation ?? 0)} colour="red" icon={TrendingDown} />
            <StatCard label="Net Book Value" value={fmtCurrency(summary?.totalNetBookValue ?? 0)} colour="green" icon={Building2} />
          </div>
        )}

        <div className="card flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Run Monthly Depreciation</p>
            <p className="text-xs text-gray-500">Posts depreciation expense to GL for all active assets. Runs automatically on the 1st of each month.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} className="input w-36 text-xs" />
            <button onClick={() => depreciationMutation.mutate(depPeriod)} disabled={depreciationMutation.isPending} className="btn-primary text-xs">
              {depreciationMutation.isPending ? 'Running…' : 'Run Depreciation'}
            </button>
          </div>
        </div>
        {depreciationMutation.data && (
          <Alert type="info" message={`Processed ${depreciationMutation.data.processed} assets — total depreciation USD ${depreciationMutation.data.totalDepreciation.toFixed(2)}`} />
        )}

        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-sm">Asset Register ({assets?.total ?? 0})</h3>
          </div>
          {assetsLoading ? <PageLoader /> : (assets?.data ?? []).length === 0 ? (
            <EmptyState title="No assets registered"
              action={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/>Register Asset</button>} />
          ) : (
            <table className="table">
              <thead>
                <tr><th>Asset Code</th><th>Description</th><th>Category</th><th>Cost</th><th>Acc. Depn.</th><th>NBV</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {(assets?.data ?? []).map((a: any) => (
                  <tr key={a.id}>
                    <td><span className="font-mono text-xs">{a.assetCode}</span></td>
                    <td className="font-medium">{a.description}</td>
                    <td><span className="capitalize text-xs">{a.category.replace(/_/g,' ')}</span></td>
                    <td>{fmtCurrency(a.cost)}</td>
                    <td className="text-red-600">{fmtCurrency(a.accumulatedDepreciation)}</td>
                    <td className="font-semibold">{fmtCurrency(a.netBookValue)}</td>
                    <td><span className="capitalize text-xs">{a.status.replace(/_/g,' ')}</span></td>
                    <td>
                      {a.status === 'active' && (
                        <button onClick={() => { setSelected(a); setShowDispose(true); }} className="btn-ghost text-xs text-red-600">
                          Dispose
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); }} title="Register Fixed Asset" size="lg">
        <div className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Description *</label>
              <input value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} className="input" placeholder="e.g. Dell Latitude 7420 - Underwriting Dept" />
            </div>
            <div>
              <label className="label">Category *</label>
              <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))} className="input">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Acquisition Date *</label>
              <input type="date" value={form.acquisitionDate} onChange={e => setForm(f=>({...f,acquisitionDate:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Cost (USD) *</label>
              <input type="number" value={form.cost} onChange={e => setForm(f=>({...f,cost:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Residual Value (USD)</label>
              <input type="number" value={form.residualValue} onChange={e => setForm(f=>({...f,residualValue:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Useful Life (months) *</label>
              <input type="number" value={form.usefulLifeMonths} onChange={e => setForm(f=>({...f,usefulLifeMonths:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Depreciation Method</label>
              <select value={form.depreciationMethod} onChange={e => setForm(f=>({...f,depreciationMethod:e.target.value}))} className="input">
                <option value="straight_line">Straight Line</option>
                <option value="reducing_balance">Reducing Balance</option>
              </select>
            </div>
            <div>
              <label className="label">Location</label>
              <input value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))} className="input" placeholder="e.g. Head Office, Harare" />
            </div>
            <div className="col-span-2">
              <label className="label">Custodian</label>
              <input value={form.custodian} onChange={e => setForm(f=>({...f,custodian:e.target.value}))} className="input" placeholder="Staff member responsible" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={!form.description || !form.cost || createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? 'Registering…' : 'Register Asset'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showDispose} onClose={() => setShowDispose(false)} title={`Dispose Asset — ${selected?.assetCode}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Current Net Book Value: <strong>{fmtCurrency(selected?.netBookValue ?? 0)}</strong></p>
          <div>
            <label className="label">Disposal Proceeds (USD)</label>
            <input type="number" value={disposeForm.proceeds} onChange={e => setDisposeForm(f=>({...f,proceeds:e.target.value}))} className="input" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={disposeForm.notes} onChange={e => setDisposeForm(f=>({...f,notes:e.target.value}))} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDispose(false)} className="btn-secondary">Cancel</button>
            <button onClick={() => disposeMutation.mutate({ id: selected.id, proceeds: parseFloat(disposeForm.proceeds), notes: disposeForm.notes })}
              disabled={!disposeForm.proceeds || disposeMutation.isPending} className="btn-primary">
              {disposeMutation.isPending ? 'Processing…' : 'Confirm Disposal'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
