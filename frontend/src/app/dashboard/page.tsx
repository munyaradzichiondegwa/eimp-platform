'use client';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Users, FileText, AlertCircle, DollarSign, TrendingUp,
  ShieldCheck, Clock, AlertTriangle, Sparkles, ArrowUpRight,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { StatCard, PageLoader, StatusBadge } from '@/components/ui';
import { reportsApi, policiesApi, claimsApi, aiApi } from '@/lib/api';
import { fmtCurrency, fmtPct, fmtDate, type ExecutiveDashboard } from '@/types';
import { useAuth } from '@/hooks/useAuth';

const PIE_COLOURS = ['#C8102E', '#C9A84C', '#1a1a1a', '#6b7280', '#10b981'];

export default function DashboardPage() {
  const { isRole } = useAuth();

  const { data: dash, isLoading } = useQuery<ExecutiveDashboard>({
    queryKey: ['reports', 'dashboard'],
    queryFn: reportsApi.dashboard,
    refetchInterval: 60_000,
  });
  const { data: policyStats } = useQuery({ queryKey: ['policies', 'stats'], queryFn: policiesApi.stats });
  const { data: claimStats } = useQuery({ queryKey: ['claims', 'stats'], queryFn: claimsApi.stats });

  const canSeeGwpForecast = isRole('super_admin', 'admin', 'finance');
  const canSeeAtRiskRenewals = isRole('super_admin', 'admin', 'underwriter', 'broker');

  const { data: gwpForecast } = useQuery({
    queryKey: ['ai', 'gwp-forecast'],
    queryFn: () => aiApi.getGwpForecast(6),
    enabled: canSeeGwpForecast,
  });
  const { data: atRiskRenewals } = useQuery({
    queryKey: ['ai', 'at-risk-renewals'],
    queryFn: () => aiApi.getAtRiskRenewals(60),
    enabled: canSeeAtRiskRenewals,
  });

  if (isLoading) return <><Header title="Dashboard" /><PageLoader /></>;

  const d = dash!;

  // Build chart data from byProduct
  const productChartData = Object.entries(policyStats?.byProduct || {}).map(([name, count]) => ({
    name: name.length > 16 ? name.slice(0, 14) + '…' : name,
    policies: count,
  }));

  const claimsStatusData = Object.entries(claimStats?.byStatus || {})
    .filter(([, v]) => (v as number) > 0)
    .map(([name, value]) => ({
      name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value,
    }));

  // Bridge historical and forecast into one series without duplicating the
  // last historical month's x-axis category — that point carries both an
  // "actual" and "forecast" value so the two line segments visually connect.
  const gwpHistorical = gwpForecast?.historical ?? [];
  const gwpForecastPoints = gwpForecast?.forecast ?? [];
  const gwpChartData = [
    ...gwpHistorical.slice(0, -1).map((h: { month: string; value: number }) => ({ month: h.month, actual: h.value })),
    ...(gwpHistorical.length > 0
      ? [{
          month: gwpHistorical[gwpHistorical.length - 1].month,
          actual: gwpHistorical[gwpHistorical.length - 1].value,
          forecast: gwpHistorical[gwpHistorical.length - 1].value,
        }]
      : []),
    ...gwpForecastPoints.map((f: { month: string; value: number }) => ({ month: f.month, forecast: f.value })),
  ];

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Executive Dashboard"
        subtitle={`Live data — last refreshed ${new Date().toLocaleTimeString('en-ZW')}`}
      />

      <main className="flex-1 p-6 space-y-6">
        {/* KPI Row 1 — GWP & Policies */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="GWP This Month"
            value={fmtCurrency(d.gwp.current)}
            sub={`YTD: ${fmtCurrency(d.gwp.ytd)}`}
            trend={{ value: d.gwp.growth, label: 'vs last month' }}
            colour="red" icon={DollarSign}
          />
          <StatCard
            label="Active Policies"
            value={d.policies.active.toLocaleString()}
            sub={`${d.policies.pendingPayment} pending payment`}
            colour="default" icon={FileText}
          />
          <StatCard
            label="Open Claims"
            value={d.claims.open.toLocaleString()}
            sub={`Claims ratio: ${fmtPct(d.claims.claimsRatio)}`}
            colour={d.claims.claimsRatio > 70 ? 'red' : 'green'} icon={AlertCircle}
          />
          <StatCard
            label="Total Customers"
            value={d.customers.total.toLocaleString()}
            sub={`+${d.customers.newThisMonth} this month`}
            colour="gold" icon={Users}
          />
        </div>

        {/* KPI Row 2 — Operations */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Collections This Month"
            value={fmtCurrency(d.collections.thisMonth)}
            sub={`${fmtPct(d.collections.collectionRate)} collection rate`}
            colour="green" icon={TrendingUp}
          />
          <StatCard
            label="Outstanding Premiums"
            value={fmtCurrency(d.collections.outstanding)}
            colour={d.collections.outstanding > 50000 ? 'red' : 'default'} icon={DollarSign}
          />
          <StatCard
            label="Avg Settlement Time"
            value={`${d.claims.avgDays.toFixed(1)} days`}
            sub="Target: < 5 days"
            colour={d.claims.avgDays > 5 ? 'red' : 'green'} icon={Clock}
          />
          <StatCard
            label="Fraud Flagged"
            value={d.claims.fraudFlagged.toString()}
            sub="Claims under review"
            colour={d.claims.fraudFlagged > 0 ? 'red' : 'green'} icon={AlertTriangle}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Policies by Product */}
          <div className="card lg:col-span-2">
            <h3 className="section-title">Policies by Product</h3>
            {productChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={productChartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}
                  />
                  <Bar dataKey="policies" fill="#C8102E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
                No policy data yet
              </div>
            )}
          </div>

          {/* Claims by Status */}
          <div className="card">
            <h3 className="section-title">Claims Status</h3>
            {claimsStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={claimsStatusData} cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={2}>
                    {claimsStatusData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
                No claims data yet
              </div>
            )}
          </div>
        </div>

        {/* AI Insights — only rendered if the signed-in role can see at least one section */}
        {(canSeeGwpForecast || canSeeAtRiskRenewals) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {canSeeGwpForecast && (
              <div className="card lg:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="section-title mb-0 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-brand-red" /> GWP Forecast — Next 6 Months
                  </h3>
                  {gwpForecast && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${gwpForecast.confidence === 'high' ? 'bg-green-100 text-green-700'
                        : gwpForecast.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'}`}>
                      {gwpForecast.confidence} confidence
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Linear trend fitted on {gwpHistorical.length} month{gwpHistorical.length === 1 ? '' : 's'} of actual premium data — not a trained model. Treat as directional, not a guarantee.
                </p>
                {gwpChartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={gwpChartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCurrency(v).replace('.00', '')} width={70} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}
                        formatter={(value: number) => fmtCurrency(value)}
                      />
                      <Line type="monotone" dataKey="actual" name="Actual" stroke="#C8102E" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                      <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#C9A84C" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-sm text-gray-400 text-center px-8">
                    Not enough historical premium data yet to fit a trend — this will populate as policies are issued over time.
                  </div>
                )}
              </div>
            )}

            {canSeeAtRiskRenewals && (
              <div className="card">
                <h3 className="section-title flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-brand-red" /> At-Risk Renewals
                </h3>
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
                  {(atRiskRenewals ?? []).slice(0, 6).map((r: any) => (
                    <div key={r.policyId} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{r.policyNumber}</p>
                        <p className="text-xs text-gray-400">{fmtPct(r.renewalProbability)} renewal odds</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2
                        ${r.recommendedAction === 'priority_outreach' ? 'bg-red-100 text-red-700'
                          : r.recommendedAction === 'standard_reminder' ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'}`}>
                        {r.lapseRiskScore}/100
                      </span>
                    </div>
                  ))}
                  {(atRiskRenewals ?? []).length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">No policies expiring within 60 days</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Retention & Compliance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Retention Metrics */}
          <div className="card">
            <h3 className="section-title">Retention</h3>
            <div className="space-y-4">
              {[
                { label: 'Renewal Rate', value: d.retention.renewalRate, colour: '#10b981' },
                { label: 'Lapse Rate', value: d.retention.lapseRate, colour: '#C8102E' },
                { label: 'Collection Rate', value: d.collections.collectionRate, colour: '#C9A84C' },
              ].map(m => (
                <div key={m.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{m.label}</span>
                    <span className="font-semibold">{fmtPct(m.value)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(m.value, 100)}%`, background: m.colour }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Alerts */}
          <div className="card">
            <h3 className="section-title">Compliance Alerts</h3>
            <div className="space-y-3">
              {d.customers.kycPending > 0 && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">KYC Pending</p>
                    <p className="text-xs text-yellow-600">{d.customers.kycPending} customers require KYC review</p>
                  </div>
                </div>
              )}
              {d.policies.expiringSoon > 0 && (
                <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg">
                  <Clock className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-800">Expiring Soon</p>
                    <p className="text-xs text-orange-600">{d.policies.expiringSoon} policies expire within 30 days</p>
                  </div>
                </div>
              )}
              {d.claims.fraudFlagged > 0 && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Fraud Investigation</p>
                    <p className="text-xs text-red-600">{d.claims.fraudFlagged} claims flagged for review</p>
                  </div>
                </div>
              )}
              {d.customers.kycPending === 0 && d.policies.expiringSoon === 0 && d.claims.fraudFlagged === 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                  <p className="text-sm text-green-700 font-medium">All clear — no compliance alerts</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className="card">
            <h3 className="section-title">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'New Customer', href: '/customers', icon: Users },
                { label: 'Issue Policy', href: '/policies', icon: FileText },
                { label: 'Submit Claim', href: '/claims', icon: AlertCircle },
                { label: 'IPEC Return', href: '/reports', icon: ShieldCheck },
                { label: 'Trial Balance', href: '/finance', icon: DollarSign },
              ].map(({ label, href, icon: Icon }) => (
                <a key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 group transition-colors">
                  <Icon className="w-4 h-4 text-brand-red" />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
