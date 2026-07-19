'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { DollarSign, TrendingUp, AlertCircle, CreditCard, Shield, Building2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { StatCard, PageLoader, Alert, Modal, Pagination, StatusBadge } from '@/components/ui';
import { financeApi } from '@/lib/api';
import { fmtCurrency, fmtDate, fmtPct } from '@/types';

const TABS = ['Dashboard', 'Trial Balance', 'P&L Statement', 'Balance Sheet', 'Invoices', 'Accounts'] as const;
type Tab = typeof TABS[number];

export default function FinancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [invoicePage, setInvoicePage] = useState(1);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ['finance', 'dashboard'],
    queryFn: financeApi.dashboard,
    enabled: tab === 'Dashboard',
  });

  const { data: tb, isLoading: tbLoading } = useQuery({
    queryKey: ['finance', 'trial-balance', period],
    queryFn: () => financeApi.trialBalance(period),
    enabled: tab === 'Trial Balance',
  });

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ['finance', 'pnl', period],
    queryFn: () => financeApi.pnl(period),
    enabled: tab === 'P&L Statement',
  });

  const { data: bs, isLoading: bsLoading } = useQuery({
    queryKey: ['finance', 'balance-sheet'],
    queryFn: financeApi.balanceSheet,
    enabled: tab === 'Balance Sheet',
  });

  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ['finance', 'invoices', invoicePage],
    queryFn: () => financeApi.invoices({ page: invoicePage, limit: 20 }),
    enabled: tab === 'Invoices',
  });

  const { data: accounts, isLoading: acctLoading } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: () => financeApi.accounts(),
    enabled: tab === 'Accounts',
  });

  const seedMutation = useMutation({
    mutationFn: financeApi.seedAccounts,
    onSuccess: () => {
      setSeedMsg('Chart of accounts seeded successfully.');
      qc.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      setShowSeedConfirm(false);
    },
    onError: (e: any) => setSeedMsg(e?.response?.data?.detail || 'Seed failed'),
  });

  // Channel collection chart data
  const channelData = Object.entries(dash?.byChannel || {}).map(([name, total]) => ({
    name: name.replace(/_/g, ' ').toUpperCase(),
    total: total as number,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Finance & Accounting"
        subtitle="General ledger, invoices, payments, financial statements"
      />

      <main className="flex-1 p-6 space-y-5">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t
                  ? 'border-brand-red text-brand-red'
                  : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Quick links to dedicated finance sub-modules */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/finance/reinsurance" className="card flex items-center justify-between hover:shadow-card-hover transition-shadow group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Reinsurance Accounting</p>
                <p className="text-xs text-gray-500">Treaties, cessions, recoveries, bordereaux</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red transition-colors" />
          </Link>
          <Link href="/finance/assets" className="card flex items-center justify-between hover:shadow-card-hover transition-shadow group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Fixed Asset Register</p>
                <p className="text-xs text-gray-500">Asset tracking, depreciation, disposal</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red transition-colors" />
          </Link>
        </div>

        {/* ── DASHBOARD TAB ── */}
        {tab === 'Dashboard' && (
          dashLoading ? <PageLoader /> : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total GWP" value={fmtCurrency(dash?.totalGwp ?? 0)}
                  colour="red" icon={TrendingUp} />
                <StatCard label="Claims Paid" value={fmtCurrency(dash?.totalClaimsPaid ?? 0)}
                  colour="gold" icon={AlertCircle} />
                <StatCard label="Outstanding Premiums" value={fmtCurrency(dash?.outstandingPremiums ?? 0)}
                  colour={dash?.outstandingPremiums > 50000 ? 'red' : 'default'} icon={DollarSign} />
                <StatCard label="Cash Position" value={fmtCurrency(dash?.cashPosition ?? 0)}
                  colour="green" icon={CreditCard}
                  sub={`Claims ratio: ${fmtPct(dash?.claimsRatio)}`} />
              </div>

              {/* Collections by channel chart */}
              <div className="card">
                <h3 className="section-title">Premium Collections by Channel</h3>
                {channelData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={channelData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: number) => [fmtCurrency(v), 'Total Collected']}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                        {channelData.map((_, i) => (
                          <Cell key={i} fill={['#C8102E','#C9A84C','#1a1a1a','#6b7280','#10b981'][i % 5]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 py-8 text-center">No payment data yet. Payments will appear here once confirmed.</p>
                )}
              </div>

              {/* Claims ratio indicator */}
              <div className="card">
                <h3 className="section-title">Claims Ratio</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600">Claims Incurred vs GWP</span>
                      <span className="font-bold text-gray-900">{fmtPct(dash?.claimsRatio)}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(dash?.claimsRatio ?? 0, 100)}%`,
                          background: (dash?.claimsRatio ?? 0) > 80 ? '#C8102E' : (dash?.claimsRatio ?? 0) > 60 ? '#C9A84C' : '#10b981',
                        }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0%</span><span>Good (&lt;60%)</span><span>Watch (60–80%)</span><span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ── TRIAL BALANCE TAB ── */}
        {tab === 'Trial Balance' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="label mb-0">Period:</label>
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="input w-40" />
              <span className="text-xs text-gray-400">(leave blank for all periods)</span>
            </div>
            {tbLoading ? <PageLoader /> : (
              <div className="card p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h4 className="font-semibold text-sm">Trial Balance — {period || 'All Periods'}</h4>
                  <div className="text-xs text-gray-500">
                    Total Debits: <span className="font-bold text-gray-900">{fmtCurrency(tb?.totals?.debit ?? 0)}</span>
                    &nbsp;| Total Credits: <span className="font-bold text-gray-900">{fmtCurrency(tb?.totals?.credit ?? 0)}</span>
                  </div>
                </div>
                <div className="table-container border-0 rounded-none">
                  <table className="table">
                    <thead>
                      <tr><th>Code</th><th>Account Name</th><th>Type</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr>
                    </thead>
                    <tbody>
                      {(tb?.accounts ?? []).map((a: any) => (
                        <tr key={a.code}>
                          <td><span className="font-mono text-xs">{a.code}</span></td>
                          <td className="font-medium">{a.name}</td>
                          <td><span className="capitalize text-xs text-gray-500">{a.type}</span></td>
                          <td className="text-right font-mono text-sm">{a.debit > 0 ? fmtCurrency(a.debit) : '—'}</td>
                          <td className="text-right font-mono text-sm">{a.credit > 0 ? fmtCurrency(a.credit) : '—'}</td>
                          <td className={`text-right font-mono text-sm font-semibold ${a.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {fmtCurrency(Math.abs(a.balance))}{a.balance < 0 ? ' Cr' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(tb?.accounts ?? []).length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">No journal entries posted yet.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── P&L STATEMENT TAB ── */}
        {tab === 'P&L Statement' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="label mb-0">Period (year or YYYY-MM):</label>
              <input value={period} onChange={e => setPeriod(e.target.value)} className="input w-40" placeholder="e.g. 2026" />
            </div>
            {pnlLoading ? <PageLoader /> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card">
                  <h4 className="font-semibold text-sm text-green-700 mb-3">Revenue</h4>
                  <div className="space-y-2">
                    {(pnl?.revenue?.accounts ?? []).map((a: any) => (
                      <div key={a.code} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-600">{a.name}</span>
                        <span className="font-semibold">{fmtCurrency(a.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                      <span>Total Revenue</span>
                      <span className="text-green-700">{fmtCurrency(pnl?.revenue?.total ?? 0)}</span>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <h4 className="font-semibold text-sm text-red-700 mb-3">Expenses</h4>
                  <div className="space-y-2">
                    {(pnl?.expenses?.accounts ?? []).map((a: any) => (
                      <div key={a.code} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-600">{a.name}</span>
                        <span className="font-semibold">{fmtCurrency(a.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                      <span>Total Expenses</span>
                      <span className="text-red-700">{fmtCurrency(pnl?.expenses?.total ?? 0)}</span>
                    </div>
                  </div>
                </div>
                <div className="card lg:col-span-2">
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold">Net Income / (Loss)</span>
                    <span className={`text-xl font-bold ${(pnl?.netIncome ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {fmtCurrency(pnl?.netIncome ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BALANCE SHEET TAB ── */}
        {tab === 'Balance Sheet' && (
          bsLoading ? <PageLoader /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card">
                <h4 className="font-semibold text-sm text-blue-700 mb-3">Assets</h4>
                <div className="space-y-2">
                  {(bs?.assets?.accounts ?? []).map((a: any) => (
                    <div key={a.code} className="flex justify-between text-sm py-1 border-b border-gray-50">
                      <span className="text-gray-600">{a.name}</span>
                      <span className="font-semibold">{fmtCurrency(a.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-sm pt-2 border-t border-gray-200">
                    <span>Total Assets</span>
                    <span className="text-blue-700">{fmtCurrency(bs?.assets?.total ?? 0)}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <h4 className="font-semibold text-sm text-orange-700 mb-3">Liabilities</h4>
                <div className="space-y-2">
                  {(bs?.liabilities?.accounts ?? []).map((a: any) => (
                    <div key={a.code} className="flex justify-between text-sm py-1 border-b border-gray-50">
                      <span className="text-gray-600">{a.name}</span>
                      <span className="font-semibold">{fmtCurrency(a.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-sm pt-2 border-t border-gray-200">
                    <span>Total Liabilities</span>
                    <span className="text-orange-700">{fmtCurrency(bs?.liabilities?.total ?? 0)}</span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex justify-between font-bold text-sm">
                    <span>Net Equity (Assets − Liabilities)</span>
                    <span className={`${(bs?.equity ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmtCurrency(bs?.equity ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ── INVOICES TAB ── */}
        {tab === 'Invoices' && (
          invLoading ? <PageLoader /> : (
            <div className="card p-0 overflow-hidden">
              <div className="table-container border-0 rounded-none">
                <table className="table">
                  <thead>
                    <tr><th>Invoice No.</th><th>Type</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Due Date</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {(invoices?.data ?? []).map((inv: any) => (
                      <tr key={inv.id}>
                        <td><span className="font-mono text-xs">{inv.invoiceNumber}</span></td>
                        <td><span className="capitalize text-xs">{inv.invoiceType?.replace(/_/g,' ')}</span></td>
                        <td className="font-semibold">{fmtCurrency(inv.totalAmount, inv.currency)}</td>
                        <td className="text-green-700">{fmtCurrency(inv.paidAmount, inv.currency)}</td>
                        <td className={inv.outstandingAmount > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                          {fmtCurrency(inv.outstandingAmount, inv.currency)}
                        </td>
                        <td className={`text-sm ${new Date(inv.dueDate) < new Date() && inv.status !== 'paid' ? 'text-red-600' : 'text-gray-500'}`}>
                          {fmtDate(inv.dueDate)}
                        </td>
                        <td><StatusBadge status={inv.status} type="invoice" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(invoices?.data ?? []).length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">No invoices found. Invoices are auto-generated on policy issuance.</p>
              )}
              <Pagination page={invoicePage} total={invoices?.total ?? 0} limit={20} onChange={setInvoicePage} />
            </div>
          )
        )}

        {/* ── ACCOUNTS TAB ── */}
        {tab === 'Accounts' && (
          <div className="space-y-3">
            {seedMsg && <Alert type="info" message={seedMsg} />}
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">{(accounts as any[])?.length ?? 0} accounts in chart of accounts</p>
              {((accounts as any[])?.length ?? 0) === 0 && (
                <button onClick={() => setShowSeedConfirm(true)} className="btn-primary text-xs">
                  Seed Default Chart of Accounts
                </button>
              )}
            </div>
            {acctLoading ? <PageLoader /> : (
              <div className="card p-0 overflow-hidden">
                <div className="table-container border-0 rounded-none">
                  <table className="table">
                    <thead>
                      <tr><th>Code</th><th>Account Name</th><th>Type</th><th>Category</th><th className="text-right">Balance</th></tr>
                    </thead>
                    <tbody>
                      {(accounts as any[] ?? []).map((a: any) => (
                        <tr key={a.id}>
                          <td><span className="font-mono text-xs font-semibold">{a.code}</span></td>
                          <td>{a.name}</td>
                          <td><span className="capitalize text-xs text-gray-500">{a.type}</span></td>
                          <td><span className="capitalize text-xs text-gray-400">{a.category?.replace(/_/g,' ')}</span></td>
                          <td className={`text-right font-mono text-sm ${a.currentBalance < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                            {fmtCurrency(Math.abs(a.currentBalance))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(accounts as any[] ?? []).length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">No accounts. Seed the default insurance chart of accounts to get started.</p>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Seed Confirm Modal */}
      <Modal open={showSeedConfirm} onClose={() => setShowSeedConfirm(false)} title="Seed Chart of Accounts" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This will create the standard insurance chart of accounts (30 accounts) configured for EBA Micro Insurance.
            This action can only be performed once on a fresh database.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowSeedConfirm(false)} className="btn-secondary">Cancel</button>
            <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="btn-primary">
              {seedMutation.isPending ? 'Seeding…' : 'Confirm Seed'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
