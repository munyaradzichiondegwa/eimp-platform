'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Eye, ShieldCheck, Ban, FileText, Users, DollarSign, TrendingUp } from 'lucide-react';
import Header from '@/components/layout/Header';
import { StatusBadge, PageLoader, EmptyState, Modal, Pagination, Alert, StatCard } from '@/components/ui';
import { brokersApi } from '@/lib/api';
import { fmtCurrency, fmtPct } from '@/types';

const BROKER_TYPES = [
  { value: 'individual_agent', label: 'Individual Agent' },
  { value: 'corporate_broker', label: 'Corporate Broker' },
  { value: 'bancassurance', label: 'Bancassurance' },
];

export default function BrokersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<'Portfolio' | 'Statements' | 'Performance'>('Portfolio');
  const [createError, setCreateError] = useState('');
  const [statementPeriod, setStatementPeriod] = useState(new Date().toISOString().slice(0, 7));

  const [form, setForm] = useState({
    name: '', type: 'individual_agent', email: '', phone: '',
    ipecLicenseNumber: '', licenseExpiryDate: '', defaultCommissionRate: '10',
    mobileMoneyNumber: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['brokers', search, statusFilter, page],
    queryFn: () => brokersApi.list({ search, status: statusFilter, page, limit: 20 }),
  });

  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['brokers', selected?.id, 'portfolio'],
    queryFn: () => brokersApi.portfolio(selected.id),
    enabled: !!selected && detailTab === 'Portfolio',
  });

  const { data: statements, isLoading: statementsLoading } = useQuery({
    queryKey: ['brokers', selected?.id, 'statements'],
    queryFn: () => brokersApi.statements(selected.id),
    enabled: !!selected && detailTab === 'Statements',
  });

  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ['brokers', selected?.id, 'performance'],
    queryFn: () => brokersApi.performance(selected.id),
    enabled: !!selected && detailTab === 'Performance',
  });

  const createMutation = useMutation({
    mutationFn: brokersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brokers'] });
      setShowCreate(false);
    },
    onError: (e: any) => setCreateError(e?.response?.data?.detail || 'Failed to register broker'),
  });

  const accreditMutation = useMutation({
    mutationFn: brokersApi.accredit,
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['brokers'] }); setSelected(data); },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: any) => brokersApi.suspend(id, reason),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['brokers'] }); setSelected(data); },
  });

  const generateStatementMutation = useMutation({
    mutationFn: ({ id, period }: any) => brokersApi.generateStatement(id, period),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brokers', selected?.id, 'statements'] }),
  });

  const handleCreate = () => {
    setCreateError('');
    createMutation.mutate({ ...form, defaultCommissionRate: parseFloat(form.defaultCommissionRate) });
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Broker & Agent Portal"
        subtitle={`${data?.total ?? 0} registered brokers`}
        actions={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/>Register Broker</button>}
      />

      <main className="flex-1 p-6 space-y-5">
        <div className="card p-0 overflow-hidden">
          <div className="flex flex-wrap gap-3 p-4 border-b border-gray-100">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name, email, broker code…" className="input pl-9" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input w-52">
              <option value="">All Statuses</option>
              {['pending_accreditation','active','suspended','terminated'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          {isLoading ? <PageLoader /> : data?.data.length === 0 ? (
            <EmptyState title="No brokers registered"
              action={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/>Register Broker</button>} />
          ) : (
            <>
              <div className="table-container border-0 rounded-none">
                <table className="table">
                  <thead>
                    <tr><th>Broker Code</th><th>Name</th><th>Type</th><th>IPEC License</th>
                      <th>Commission Rate</th><th>Outstanding</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {data?.data.map((b: any) => (
                      <tr key={b.id}>
                        <td><span className="font-mono text-xs">{b.brokerCode}</span></td>
                        <td className="font-medium">{b.name}</td>
                        <td><span className="capitalize text-xs">{b.type?.replace(/_/g,' ')}</span></td>
                        <td className="text-gray-500 text-xs">{b.ipecLicenseNumber || '—'}</td>
                        <td>{b.defaultCommissionRate}%</td>
                        <td className={b.outstandingCommission > 0 ? 'text-orange-600 font-semibold' : 'text-gray-400'}>
                          {fmtCurrency(b.outstandingCommission)}
                        </td>
                        <td><StatusBadge status={b.status} type="user" /></td>
                        <td>
                          <button onClick={() => { setSelected(b); setDetailTab('Portfolio'); }} className="btn-ghost text-xs">
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

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); }} title="Register New Broker" size="lg">
        <div className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Name / Brokerage *</label>
              <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} className="input" placeholder="e.g. Tendai Moyo or Apex Brokers (Pvt) Ltd" />
            </div>
            <div>
              <label className="label">Broker Type *</label>
              <select value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))} className="input">
                {BROKER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Default Commission Rate (%)</label>
              <input type="number" value={form.defaultCommissionRate} onChange={e => setForm(f=>({...f,defaultCommissionRate:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} className="input" placeholder="+263712345678" />
            </div>
            <div>
              <label className="label">IPEC License Number</label>
              <input value={form.ipecLicenseNumber} onChange={e => setForm(f=>({...f,ipecLicenseNumber:e.target.value}))} className="input" />
            </div>
            <div>
              <label className="label">License Expiry Date</label>
              <input type="date" value={form.licenseExpiryDate} onChange={e => setForm(f=>({...f,licenseExpiryDate:e.target.value}))} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Mobile Money Number (for commission payout)</label>
              <input value={form.mobileMoneyNumber} onChange={e => setForm(f=>({...f,mobileMoneyNumber:e.target.value}))} className="input" placeholder="+263712345678" />
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-xs text-yellow-700">
              Broker will be registered as <strong>Pending Accreditation</strong>. An IPEC license number is required before accreditation can be granted.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={!form.name || !form.email || !form.phone || createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? 'Registering…' : 'Register Broker'}
            </button>
          </div>
        </div>
      </Modal>

      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`${selected.brokerCode} — ${selected.name}`} size="xl">
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              {[
                ['Status', null],
                ['Type', selected.type?.replace(/_/g,' ')],
                ['Commission Rate', `${selected.defaultCommissionRate}%`],
                ['IPEC License', selected.ipecLicenseNumber || '—'],
              ].map(([k,v]) => (
                <div key={String(k)}>
                  <p className="text-gray-400 text-xs mb-0.5">{k}</p>
                  {k === 'Status' ? <StatusBadge status={selected.status} type="user"/> : <p className="font-medium capitalize">{v as string}</p>}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              {selected.status === 'pending_accreditation' && (
                <button onClick={() => accreditMutation.mutate(selected.id)} className="btn-primary text-xs">
                  <ShieldCheck className="w-3.5 h-3.5"/>Accredit Broker
                </button>
              )}
              {selected.status === 'active' && (
                <button onClick={() => suspendMutation.mutate({id: selected.id, reason: 'Suspended by admin'})} className="btn-secondary text-xs text-red-600">
                  <Ban className="w-3.5 h-3.5"/>Suspend
                </button>
              )}
            </div>

            <div className="flex gap-1 border-b border-gray-200">
              {(['Portfolio','Statements','Performance'] as const).map(t => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${detailTab===t ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500'}`}>
                  {t}
                </button>
              ))}
            </div>

            {detailTab === 'Portfolio' && (
              portfolioLoading ? <PageLoader/> : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Total Policies" value={portfolio?.totalPolicies ?? 0} colour="default" icon={FileText} />
                    <StatCard label="Renewals Due (30d)" value={portfolio?.renewalsDue?.length ?? 0} colour="gold" icon={FileText} />
                  </div>
                  {(portfolio?.renewalsDue?.length ?? 0) > 0 && (
                    <div className="table-container">
                      <table className="table">
                        <thead><tr><th>Policy</th><th>Customer</th><th>Days to Renewal</th><th>Premium</th></tr></thead>
                        <tbody>
                          {portfolio.renewalsDue.map((r: any) => (
                            <tr key={r.policyNumber}>
                              <td className="font-mono text-xs">{r.policyNumber}</td>
                              <td className="text-xs">{r.customerEmail}</td>
                              <td className={r.daysToRenewal <= 7 ? 'text-red-600 font-semibold' : ''}>{r.daysToRenewal} days</td>
                              <td>{fmtCurrency(r.premium)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            )}

            {detailTab === 'Statements' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input type="month" value={statementPeriod} onChange={e => setStatementPeriod(e.target.value)} className="input w-40 text-xs" />
                  <button onClick={() => generateStatementMutation.mutate({id: selected.id, period: statementPeriod})}
                    disabled={generateStatementMutation.isPending} className="btn-primary text-xs">
                    {generateStatementMutation.isPending ? 'Generating…' : 'Generate Statement'}
                  </button>
                </div>
                {statementsLoading ? <PageLoader/> : (
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>Statement No.</th><th>Period</th><th>Policies</th><th>Commission</th><th>Status</th></tr></thead>
                      <tbody>
                        {(statements ?? []).map((s: any) => (
                          <tr key={s.id}>
                            <td className="font-mono text-xs">{s.statementNumber}</td>
                            <td>{s.period}</td>
                            <td>{s.lineItems?.length ?? 0}</td>
                            <td className="font-semibold">{fmtCurrency(s.totalCommission)}</td>
                            <td><StatusBadge status={s.status} type="invoice" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(statements ?? []).length === 0 && <p className="text-center text-sm text-gray-400 py-6">No statements generated yet</p>}
                  </div>
                )}
              </div>
            )}

            {detailTab === 'Performance' && (
              perfLoading ? <PageLoader/> : (
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="GWP Contribution (YTD)" value={fmtCurrency(performance?.gwpContribution ?? 0)} colour="red" icon={TrendingUp} />
                  <StatCard label="Policy Count" value={performance?.policyCount ?? 0} colour="default" icon={FileText} />
                  <StatCard label="Renewal Retention" value={fmtPct(performance?.renewalRetentionRate)} colour="green" icon={Users} />
                  <StatCard label="Commission Earned" value={fmtCurrency(performance?.commissionEarned ?? 0)} colour="gold" icon={DollarSign} />
                </div>
              )
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
