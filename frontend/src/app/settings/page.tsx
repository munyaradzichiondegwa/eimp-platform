'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Settings, ShieldCheck, Database, Wifi, Bell, Globe,
  CheckCircle, XCircle, AlertCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { Alert } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

const INTEGRATION_CHECKS = [
  { key: 'ecocash', label: 'EcoCash API', channel: 'Mobile Money', env: 'ECOCASH_API_KEY' },
  { key: 'onemoney', label: 'OneMoney API', channel: 'Mobile Money', env: 'ONEMONEY_API_KEY' },
  { key: 'innbucks', label: 'InnBucks API', channel: 'Mobile Money', env: 'INNBUCKS_API_KEY' },
  { key: 'smtp', label: 'Email (SMTP/SES)', channel: 'Notifications', env: 'SMTP_HOST or SES_REGION' },
  { key: 'sms', label: 'SMS Gateway', channel: 'Notifications', env: 'TWILIO_ACCOUNT_SID or ECONET_SMS_API_KEY' },
  { key: 's3', label: 'AWS S3 Storage', channel: 'Storage', env: 'AWS_S3_BUCKET' },
  { key: 'whatsapp', label: 'WhatsApp Business API', channel: 'Notifications', env: 'WHATSAPP_API_KEY' },
  { key: 'weather', label: 'Weather Data API', channel: 'Agriculture', env: 'WEATHER_API_KEY' },
];

const SECTIONS = ['System', 'Integrations', 'Security', 'About'] as const;
type Section = typeof SECTIONS[number];

export default function SettingsPage() {
  const { user, isRole } = useAuth();
  const [section, setSection] = useState<Section>('System');

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/../../health').then(r => r.data),
    retry: false,
  });

  if (!isRole('super_admin', 'admin')) {
    return (
      <div className="flex flex-col flex-1">
        <Header title="Settings" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-600">Access Restricted</p>
            <p className="text-sm text-gray-400 mt-1">System settings require Admin or Super Admin role.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Settings" subtitle="System configuration and integration management" />

      <main className="flex-1 p-6">
        <div className="flex gap-6">
          {/* Sidebar nav */}
          <div className="w-48 flex-shrink-0">
            <nav className="space-y-1">
              {SECTIONS.map(s => (
                <button key={s} onClick={() => setSection(s)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${section === s ? 'bg-brand-red/10 text-brand-red' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {s}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-5 max-w-3xl">

            {/* ── SYSTEM ── */}
            {section === 'System' && (
              <div className="space-y-4">
                <div className="card">
                  <h3 className="section-title flex items-center gap-2">
                    <Database className="w-4 h-4 text-brand-red" /> System Health
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      ['API Status', health ? '✓ Online' : '✗ Offline'],
                      ['Service', health?.service ?? 'EBA EIMP API'],
                      ['Version', health?.version ?? '2.0'],
                      ['Environment', health?.environment ?? process.env.NODE_ENV ?? 'unknown'],
                      ['Last Check', new Date().toLocaleTimeString('en-ZW')],
                      ['DB Connection', health ? '✓ Connected' : '✗ Unknown'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-gray-400 text-xs mb-0.5">{k}</p>
                        <p className={`font-medium ${String(v).startsWith('✗') ? 'text-red-600' : String(v).startsWith('✓') ? 'text-green-700' : 'text-gray-900'}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h3 className="section-title flex items-center gap-2">
                    <Settings className="w-4 h-4 text-brand-red" /> Business Configuration
                  </h3>
                  <div className="space-y-3 text-sm">
                    {[
                      ['Company Name', 'EBA Micro Insurance Company (Pvt) Ltd'],
                      ['Regulatory Body', 'Insurance and Pensions Commission (IPEC) Zimbabwe'],
                      ['Base Currency', 'USD (Multi-currency: ZiG, ZAR, GBP supported)'],
                      ['Data Residency', 'Zimbabwe / South Africa (AWS af-south-1)'],
                      ['Backup Frequency', 'Hourly incremental, daily full, 30-day retention'],
                      ['RTO Target', '< 4 hours'],
                      ['RPO Target', '< 1 hour'],
                      ['Uptime SLA', '≥ 99.5% (excluding scheduled maintenance)'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
                        <span className="text-gray-500 w-40 flex-shrink-0">{k}</span>
                        <span className="font-medium text-gray-800">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h3 className="section-title flex items-center gap-2">
                    <Bell className="w-4 h-4 text-brand-red" /> Scheduled Jobs
                  </h3>
                  <div className="space-y-3 text-sm">
                    {[
                      { job: 'Renewal Reminders', schedule: 'Daily 08:00 CAT', desc: '60, 30, 7 days before expiry' },
                      { job: 'KYC Expiry Alerts', schedule: 'Daily 09:00 CAT', desc: '30, 14, 7 days before expiry' },
                      { job: 'Lapse Processing', schedule: 'Daily 01:00 CAT', desc: 'Policies 14 days past due' },
                      { job: 'Overdue Invoices', schedule: 'Daily 02:00 CAT', desc: 'Mark invoices past due date' },
                      { job: 'Payment Retry', schedule: 'Every 5 minutes', desc: 'Queued payments with backoff' },
                    ].map(j => (
                      <div key={j.job} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="font-medium">{j.job}</p>
                          <p className="text-xs text-gray-400">{j.desc}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{j.schedule}</span>
                          <div className="flex items-center gap-1 justify-end mt-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span className="text-xs text-green-600">Active</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── INTEGRATIONS ── */}
            {section === 'Integrations' && (
              <div className="space-y-4">
                <Alert type="info" message="Configure integration credentials in the .env file on the server. Restart the backend container after changes." />
                {['Mobile Money', 'Notifications', 'Storage', 'Agriculture'].map(channel => {
                  const items = INTEGRATION_CHECKS.filter(i => i.channel === channel);
                  return (
                    <div key={channel} className="card">
                      <h3 className="section-title flex items-center gap-2">
                        <Wifi className="w-4 h-4 text-brand-red" /> {channel}
                      </h3>
                      <div className="space-y-3">
                        {items.map(item => (
                          <div key={item.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                            <div>
                              <p className="font-medium">{item.label}</p>
                              <p className="text-xs text-gray-400 font-mono">{item.env}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">Configure in .env</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="card">
                  <h3 className="section-title">Webhook Endpoints</h3>
                  <div className="space-y-2 text-sm font-mono">
                    {[
                      'POST /api/v1/payments/webhook/ecocash',
                      'POST /api/v1/payments/webhook/onemoney',
                      'POST /api/v1/payments/webhook/innbucks',
                    ].map(ep => (
                      <div key={ep} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <span className="text-green-700 text-xs font-bold">POST</span>
                        <span className="text-gray-700 text-xs">{ep}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">Register these URLs with each payment gateway to receive real-time payment confirmations.</p>
                </div>
              </div>
            )}

            {/* ── SECURITY ── */}
            {section === 'Security' && (
              <div className="space-y-4">
                <div className="card">
                  <h3 className="section-title flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand-red" /> Security Configuration
                  </h3>
                  <div className="space-y-3 text-sm">
                    {[
                      { label: 'Authentication', value: 'JWT — 15 min access, 7 day refresh with rotation', status: 'active' },
                      { label: 'Password Policy', value: 'Minimum 10 characters, bcrypt hash (12 rounds)', status: 'active' },
                      { label: 'Account Lockout', value: '5 failed attempts → 30 min lockout', status: 'active' },
                      { label: 'MFA', value: 'TOTP / SMS OTP — configurable per user', status: 'active' },
                      { label: 'Transport Encryption', value: 'TLS 1.3 on all endpoints', status: 'active' },
                      { label: 'Data Encryption (rest)', value: 'AES-256 (AWS S3 SSE-KMS)', status: 'active' },
                      { label: 'Rate Limiting', value: '100 req/min per authenticated user', status: 'active' },
                      { label: 'Session Timeout', value: '15 min (admin), 60 min (customers)', status: 'active' },
                      { label: 'Audit Trail', value: 'Immutable append-only log of all actions', status: 'active' },
                      { label: 'CORS Policy', value: 'Restricted to known domains in production', status: 'active' },
                    ].map(item => (
                      <div key={item.label} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                        <div className="flex-1">
                          <p className="font-medium">{item.label}</p>
                          <p className="text-xs text-gray-400">{item.value}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-3">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-xs text-green-600 capitalize">{item.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── ABOUT ── */}
            {section === 'About' && (
              <div className="card">
                <h3 className="section-title flex items-center gap-2">
                  <Globe className="w-4 h-4 text-brand-red" /> About EIMP
                </h3>
                <div className="space-y-4 text-sm">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-bold text-gray-900 text-base">Enterprise Insurance Management Platform v2.0</p>
                    <p className="text-gray-500 mt-1">EBA Micro Insurance Company (Pvt) Ltd</p>
                  </div>
                  {[
                    ['Document Reference', 'NTC/EBA/2026/002'],
                    ['Technology Advisor', 'NevTech Consultancy — Munyaradzi Chiondegwa, MBA'],
                    ['Contact', 'chiondegwabm@gmail.com | +263 713 794 347'],
                    ['Address', '5393 Aspindale Road, Tynwald, Harare, Zimbabwe'],
                    ['Backend', 'NestJS 10 + TypeScript | PostgreSQL 16 | Redis 7'],
                    ['Frontend', 'Next.js 14 + React 18 + Tailwind CSS'],
                    ['Infrastructure', 'Docker | AWS EKS | AWS RDS | AWS S3 (af-south-1)'],
                    ['Classification', 'STRICTLY CONFIDENTIAL'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
                      <span className="text-gray-400 w-40 flex-shrink-0">{k}</span>
                      <span className="font-medium text-gray-700">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
