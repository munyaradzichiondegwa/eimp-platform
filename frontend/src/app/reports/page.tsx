'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import { FileText, Download, ShieldCheck, AlertTriangle, DollarSign } from 'lucide-react';
import Header from '@/components/layout/Header';
import { PageLoader, Alert, StatCard } from '@/components/ui';
import { reportsApi } from '@/lib/api';
import { fmtCurrency, fmtDate, fmtPct } from '@/types';

const TABS = ['GWP Report', 'Claims Report', 'Outstanding Premiums', 'Broker Performance', 'IPEC Return', 'FIU/AML Report'] as const;
type Tab = typeof TABS[number];

function getDefaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), 0, 1); // Start of year
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('GWP Report');
  const [range, setRange] = useState(getDefaultRange);
  const [quarter, setQuarter] = useState(`${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`);

  const { data: gwp, isLoading: gwpLoading, error: gwpError } = useQuery({
    queryKey: ['reports', 'gwp', range.from, range.to],
    queryFn: () => reportsApi.gwp(range.from, range.to),
    enabled: tab === 'GWP Report',
  });

  const { data: claims, isLoading: claimsLoading } = useQuery({
    queryKey: ['reports', 'claims', range.from, range.to],
    queryFn: () => reportsApi.claims(range.from, range.to),
    enabled: tab === 'Claims Report',
  });

  const { data: outstanding, isLoading: outLoading } = useQuery({
    queryKey: ['reports', 'outstanding'],
    queryFn: reportsApi.outstandingPremiums,
    enabled: tab === 'Outstanding Premiums',
  });

  const { data: broker, isLoading: brokerLoading } = useQuery({
    queryKey: ['reports', 'broker', range.from, range.to],
    queryFn: () => reportsApi.brokerPerformance(range.from, range.to),
    enabled: tab === 'Broker Performance',
  });

  const { data: ipec, isLoading: ipecLoading, error: ipecError } = useQuery({
    queryKey: ['reports', 'ipec', quarter],
    queryFn: () => reportsApi.ipec(quarter),
    enabled: tab === 'IPEC Return',
  });

  const { data: fiu, isLoading: fiuLoading } = useQuery({
    queryKey: ['reports', 'fiu', range.from, range.to],
    queryFn: () => reportsApi.fiuAml(range.from, range.to),
    enabled: tab === 'FIU/AML Report',
  });

  const DateRangeBar = () => (
    <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600">From</label>
        <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="input w-36 text-xs" />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600">To</label>
        <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="input w-36 text-xs" />
      </div>
      <span className="text-xs text-gray-400">Data refreshes automatically on date change</span>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Reports & Compliance" subtitle="Management reporting and regulatory returns" />

      <main className="flex-1 p-6 space-y-5">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap
                ${tab === t ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── GWP REPORT ── */}
        {tab === 'GWP Report' && (
          <div className="space-y-5">
            <DateRangeBar />
            {gwpLoading ? <PageLoader /> : gwpError ? (
              <Alert type="error" message="Failed to load GWP report" />
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <StatCard label="Total GWP" value={fmtCurrency(gwp?.total ?? 0)} colour="red" icon={FileText} />
                  <StatCard label="Policy Count" value={gwp?.byProduct?.reduce((s: number, p: any) => s + p.policies, 0) ?? 0} colour="default" icon={FileText} />
                  <StatCard label="Avg Premium" value={fmtCurrency((gwp?.byProduct?.reduce((s: number, p: any) => s + p.gwp, 0) ?? 0) / Math.max(gwp?.byProduct?.reduce((s: number, p: any) => s + p.policies, 0) ?? 1, 1))} colour="gold" icon={FileText} />
                </div>

                <div className="card">
                  <h3 className="section-title">GWP by Month</h3>
                  {(gwp?.byMonth?.length ?? 0) > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={gwp?.byMonth ?? []} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => [fmtCurrency(v), 'GWP']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Line type="monotone" dataKey="gwp" stroke="#C8102E" strokeWidth={2} dot={{ fill: '#C8102E', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-gray-400 py-8 text-center">No data for selected period</p>}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card">
                    <h3 className="section-title">By Product</h3>
                    <div className="space-y-3">
                      {(gwp?.byProduct ?? []).map((p: any) => (
                        <div key={p.product} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 flex-1 truncate">{p.product}</span>
                          <span className="text-gray-500 mx-3 text-xs">{p.policies} policies</span>
                          <span className="font-semibold">{fmtCurrency(p.gwp)}</span>
                        </div>
                      ))}
                      {(gwp?.byProduct ?? []).length === 0 && <p className="text-sm text-gray-400">No data</p>}
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="section-title">By Distribution Channel</h3>
                    <div className="space-y-3">
                      {(gwp?.byChannel ?? []).map((c: any) => (
                        <div key={c.channel} className="flex items-center justify-between text-sm">
                          <span className="capitalize text-gray-700">{c.channel.replace(/_/g, ' ')}</span>
                          <span className="text-gray-500 mx-3 text-xs">{c.policies} policies</span>
                          <span className="font-semibold">{fmtCurrency(c.gwp)}</span>
                        </div>
                      ))}
                      {(gwp?.byChannel ?? []).length === 0 && <p className="text-sm text-gray-400">No data</p>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── CLAIMS REPORT ── */}
        {tab === 'Claims Report' && (
          <div className="space-y-5">
            <DateRangeBar />
            {claimsLoading ? <PageLoader /> : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Total Claims" value={claims?.total ?? 0} colour="default" icon={AlertTriangle} />
                  <StatCard label="Claims Ratio" value={fmtPct(claims?.claimsRatio)} colour={claims?.claimsRatio > 70 ? 'red' : 'green'} icon={FileText} />
                  <StatCard label="Total Reserved" value={fmtCurrency(claims?.totalReserved ?? 0)} colour="gold" icon={FileText} />
                  <StatCard label="Avg Settlement (days)" value={`${(claims?.avgSettlementDays ?? 0).toFixed(1)}`}
                    colour={claims?.avgSettlementDays > 5 ? 'red' : 'green'} icon={FileText} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card">
                    <h3 className="section-title">By Status</h3>
                    <div className="space-y-2">
                      {Object.entries(claims?.byStatus ?? {}).filter(([, v]) => (v as number) > 0).map(([status, count]) => (
                        <div key={status} className="flex justify-between text-sm">
                          <span className="capitalize text-gray-600">{status.replace(/_/g, ' ')}</span>
                          <span className="font-semibold">{count as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="section-title">By Type</h3>
                    <div className="space-y-2">
                      {Object.entries(claims?.byType ?? {}).filter(([, v]) => (v as number) > 0).map(([type, count]) => (
                        <div key={type} className="flex justify-between text-sm">
                          <span className="capitalize text-gray-600">{type.replace(/_/g, ' ')}</span>
                          <span className="font-semibold">{count as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <h3 className="section-title">Fraud Analysis</h3>
                  <div className="flex items-center gap-6 text-sm">
                    <div><p className="text-gray-400 text-xs">Flagged Claims</p><p className="text-xl font-bold text-red-600">{claims?.fraud?.flagged ?? 0}</p></div>
                    <div><p className="text-gray-400 text-xs">% of All Claims</p><p className="text-xl font-bold">{fmtPct(claims?.fraud?.percentage)}</p></div>
                    <div className="flex-1">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(claims?.fraud?.percentage ?? 0, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── OUTSTANDING PREMIUMS ── */}
        {tab === 'Outstanding Premiums' && (
          <div className="space-y-5">
            {outLoading ? <PageLoader /> : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Outstanding', value: fmtCurrency(outstanding?.total ?? 0), colour: 'red' },
                    { label: 'Current (not yet due)', value: fmtCurrency(outstanding?.aged?.current ?? 0), colour: 'green' },
                    { label: '1–30 Days Overdue', value: fmtCurrency(outstanding?.aged?.days30 ?? 0), colour: 'gold' },
                    { label: '60+ Days Overdue', value: fmtCurrency((outstanding?.aged?.days60 ?? 0) + (outstanding?.aged?.days90plus ?? 0)), colour: 'red' },
                  ].map(s => (
                    <StatCard key={s.label} label={s.label} value={s.value} colour={s.colour as any} icon={DollarSign} />
                  ))}
                </div>

                <div className="card">
                  <h3 className="section-title">Top Outstanding Debtors</h3>
                  <div className="table-container border border-gray-200">
                    <table className="table">
                      <thead><tr><th>Customer No.</th><th>Name</th><th>Outstanding</th><th>Oldest (days)</th></tr></thead>
                      <tbody>
                        {(outstanding?.byCustomer ?? []).slice(0, 20).map((c: any) => (
                          <tr key={c.customerNumber}>
                            <td><span className="font-mono text-xs">{c.customerNumber || '—'}</span></td>
                            <td>{c.name || '—'}</td>
                            <td className="font-semibold text-red-600">{fmtCurrency(c.outstanding)}</td>
                            <td className={c.oldestDays > 60 ? 'text-red-600 font-semibold' : 'text-gray-600'}>{c.oldestDays} days</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(outstanding?.byCustomer ?? []).length === 0 && <p className="text-sm text-gray-400 text-center py-6">No outstanding premiums. All invoices are paid or not yet due.</p>}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── BROKER PERFORMANCE ── */}
        {tab === 'Broker Performance' && (
          <div className="space-y-5">
            <DateRangeBar />
            {brokerLoading ? <PageLoader /> : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label="Total Broker GWP" value={fmtCurrency(broker?.total?.gwp ?? 0)} colour="red" icon={FileText} />
                  <StatCard label="Total Policies" value={broker?.total?.policies ?? 0} colour="default" icon={FileText} />
                  <StatCard label="Total Commissions" value={fmtCurrency(broker?.total?.commission ?? 0)} colour="gold" icon={FileText} />
                </div>
                <div className="card p-0 overflow-hidden">
                  <table className="table">
                    <thead><tr><th>Broker ID</th><th className="text-right">Policies</th><th className="text-right">GWP</th><th className="text-right">Commission</th></tr></thead>
                    <tbody>
                      {(broker?.brokers ?? []).map((b: any) => (
                        <tr key={b.brokerId}>
                          <td><span className="font-mono text-xs">{b.brokerId}</span></td>
                          <td className="text-right">{b.policyCount}</td>
                          <td className="text-right font-semibold">{fmtCurrency(b.gwp)}</td>
                          <td className="text-right">{fmtCurrency(b.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(broker?.brokers ?? []).length === 0 && <p className="text-sm text-gray-400 text-center py-6">No broker policies in the selected period</p>}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── IPEC RETURN ── */}
        {tab === 'IPEC Return' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm font-medium text-gray-700">Quarter:</label>
              <input value={quarter} onChange={e => setQuarter(e.target.value)} className="input w-36"
                placeholder="e.g. 2026-Q2" />
              <span className="text-xs text-gray-400">Format: YYYY-QN</span>
            </div>
            {ipecLoading ? <PageLoader /> : ipecError ? (
              <Alert type="error" message="Failed to load IPEC return. Check quarter format (e.g. 2026-Q2)." />
            ) : ipec ? (
              <div className="space-y-4">
                <div className="card bg-gray-50 border-gray-300">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-5 h-5 text-brand-red" />
                    <h3 className="font-bold text-gray-900">IPEC Statutory Return — {ipec.period}</h3>
                  </div>
                  <p className="text-xs text-gray-500">Generated: {new Date(ipec.reportGeneratedAt).toLocaleString('en-ZW')}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card">
                    <h4 className="font-semibold text-sm mb-3">Premium Income</h4>
                    {Object.entries(ipec.premiumIncome?.byClass ?? {}).map(([cls, amt]) => (
                      <div key={cls} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="capitalize text-gray-600">{cls.replace(/_/g,' ')}</span>
                        <span className="font-semibold">{fmtCurrency(amt as number)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-gray-200">
                      <span>Total</span><span>{fmtCurrency(ipec.premiumIncome?.total ?? 0)}</span>
                    </div>
                  </div>

                  <div className="card">
                    <h4 className="font-semibold text-sm mb-3">Claims Incurred</h4>
                    {Object.entries(ipec.claimsIncurred?.byClass ?? {}).map(([cls, amt]) => (
                      <div key={cls} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="capitalize text-gray-600">{cls.replace(/_/g,' ')}</span>
                        <span className="font-semibold">{fmtCurrency(amt as number)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-gray-200">
                      <span>Total</span><span>{fmtCurrency(ipec.claimsIncurred?.total ?? 0)}</span>
                    </div>
                  </div>

                  <div className="card">
                    <h4 className="font-semibold text-sm mb-3">Solvency Margin</h4>
                    <div className="space-y-2 text-sm">
                      {[
                        ['Minimum Required', fmtCurrency(ipec.solvencyMargin?.minimumRequired ?? 0)],
                        ['Held', fmtCurrency(ipec.solvencyMargin?.held ?? 0)],
                        ['Ratio', fmtPct(ipec.solvencyMargin?.ratio ?? 0)],
                      ].map(([k,v]) => (
                        <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-semibold">{v}</span></div>
                      ))}
                      <div className={`mt-2 pt-2 border-t text-sm font-bold ${ipec.solvencyMargin?.isCompliant ? 'text-green-700' : 'text-red-600'}`}>
                        {ipec.solvencyMargin?.isCompliant ? '✓ IPEC Compliant' : '✗ Below Minimum Solvency — Action Required'}
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <h4 className="font-semibold text-sm mb-3">Portfolio Summary</h4>
                    <div className="space-y-2 text-sm">
                      {[
                        ['Policies in Force', ipec.policiesInForce],
                        ['New Business', ipec.newBusinessCount],
                        ['Outstanding Claims', ipec.outstandingClaims?.count],
                        ['Claims Reserve', fmtCurrency(ipec.outstandingClaims?.reserve ?? 0)],
                      ].map(([k,v]) => (
                        <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-semibold">{v}</span></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── FIU / AML REPORT ── */}
        {tab === 'FIU/AML Report' && (
          <div className="space-y-5">
            <DateRangeBar />
            {fiuLoading ? <PageLoader /> : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="High-Value Transactions (≥$10,000)" value={fiu?.highValueTransactions?.length ?? 0}
                    colour={fiu?.highValueTransactions?.length > 0 ? 'red' : 'green'} icon={AlertTriangle} />
                  <StatCard label="KYC Non-Compliant Customers" value={fiu?.kycNonCompliant ?? 0}
                    colour={fiu?.kycNonCompliant > 0 ? 'red' : 'green'} icon={ShieldCheck} />
                </div>

                {fiu?.kycNonCompliant > 0 && (
                  <Alert type="warning" message={`${fiu.kycNonCompliant} active customers do not have approved KYC. This must be remediated immediately to remain FIU-compliant.`} />
                )}

                <div className="card p-0 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h4 className="font-semibold text-sm">High-Value Transactions (CTR — Cash Threshold Reports)</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Transactions ≥ USD 10,000 per RBZ thresholds</p>
                  </div>
                  <table className="table">
                    <thead><tr><th>Payment Ref</th><th>Amount</th><th>Channel</th><th>Date</th></tr></thead>
                    <tbody>
                      {(fiu?.highValueTransactions ?? []).map((t: any) => (
                        <tr key={t.ref}>
                          <td><span className="font-mono text-xs">{t.ref}</span></td>
                          <td className="font-semibold text-red-700">{fmtCurrency(t.amount)}</td>
                          <td className="capitalize">{t.channel?.replace(/_/g,' ')}</td>
                          <td className="text-gray-400">{fmtDate(t.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(fiu?.highValueTransactions ?? []).length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-6">No high-value transactions in the selected period.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}


