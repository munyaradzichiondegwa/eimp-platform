'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Search, Plus, Eye, CheckCircle, MessageSquare } from 'lucide-react';
import Header from '@/components/layout/Header';
import { StatusBadge, PageLoader, EmptyState, Modal, Pagination, Alert } from '@/components/ui';
import { customersApi, aiApi } from '@/lib/api';
import { fmtDate, type Customer, type KycStatus, type PaginatedResponse } from '@/types';
import { useAuth } from '@/hooks/useAuth';

const KYC_STATUS_OPTIONS: { value: KycStatus; label: string }[] = [
  { value: 'not_submitted', label: 'Not Submitted' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 're_verification_required', label: 'Re-verification Required' },
];

export default function CustomersPage() {
  const qc = useQueryClient();
  const { isRole } = useAuth();
  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [createError, setCreateError] = useState('');

  const canViewChatHistory = isRole('super_admin', 'admin', 'compliance');
  const { data: chatSessions, isLoading: chatLoading } = useQuery({
    queryKey: ['ai', 'chat-history', selected?.id],
    queryFn: () => aiApi.getChatHistory(selected!.id),
    enabled: !!selected && showChatHistory && canViewChatHistory,
  });

  const { data, isLoading } = useQuery<PaginatedResponse<Customer>>({
    queryKey: ['customers', search, kycFilter, page],
    queryFn: () => customersApi.list({ search, kycStatus: kycFilter, page, limit: 20 }),
  });

  const createMutation = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => setCreateError(e?.response?.data?.detail || 'Failed to create customer'),
  });

  const kycMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes: string }) =>
      customersApi.updateKycStatus(id, status, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();

  const onSubmit = (data: any) => {
    setCreateError('');
    createMutation.mutate(data);
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Customers"
        subtitle={`${data?.total ?? 0} total records`}
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New Customer
          </button>
        }
      />

      <main className="flex-1 p-6">
        <div className="card p-0 overflow-hidden">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 p-4 border-b border-gray-100">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name, email, ID number, customer number…"
                className="input pl-9"
              />
            </div>
            <select value={kycFilter} onChange={e => { setKycFilter(e.target.value); setPage(1); }}
              className="input w-48">
              <option value="">All KYC Status</option>
              {KYC_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Table */}
          {isLoading ? <PageLoader /> : (
            <>
              {data?.data.length === 0 ? (
                <EmptyState title="No customers found" description="Try adjusting your search filters or add a new customer."
                  action={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Customer</button>} />
              ) : (
                <div className="table-container border-0 rounded-none">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Customer No.</th><th>Name</th><th>Email</th>
                        <th>Phone</th><th>Type</th><th>KYC Status</th><th>Joined</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.data.map(c => (
                        <tr key={c.id}>
                          <td><span className="font-mono text-xs text-gray-500">{c.customerNumber}</span></td>
                          <td><span className="font-medium text-gray-900">{c.firstName} {c.lastName}{c.companyName}</span></td>
                          <td>{c.email}</td>
                          <td>{c.phone || '—'}</td>
                          <td><span className="capitalize text-xs">{c.type}</span></td>
                          <td><StatusBadge status={c.kycStatus} type="kyc" /></td>
                          <td className="text-gray-400">{fmtDate(c.createdAt)}</td>
                          <td>
                            <button onClick={() => { setSelected(c); setShowChatHistory(false); }} className="btn-ghost text-xs">
                              <Eye className="w-3.5 h-3.5" /> View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={page} total={data?.total ?? 0} limit={20} onChange={setPage} />
            </>
          )}
        </div>
      </main>

      {/* Create Customer Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(''); reset(); }} title="New Customer" size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Customer Type</label>
              <select {...register('type', { required: true })} className="input">
                <option value="individual">Individual</option>
                <option value="corporate">Corporate</option>
              </select>
            </div>
            <div>
              <label className="label">First Name</label>
              <input {...register('firstName')} className="input" placeholder="e.g. Tendai" />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input {...register('lastName')} className="input" placeholder="e.g. Moyo" />
            </div>
            <div>
              <label className="label">Company Name (corporate)</label>
              <input {...register('companyName')} className="input" placeholder="e.g. Apex Trading (Pvt) Ltd" />
            </div>
            <div>
              <label className="label">National ID Number</label>
              <input {...register('idNumber')} className="input" placeholder="e.g. 63-123456-A-00" />
            </div>
            <div>
              <label className="label">Email Address *</label>
              <input {...register('email', { required: 'Email is required' })} type="email" className="input" />
              {errors.email && <p className="form-error">{String(errors.email.message)}</p>}
            </div>
            <div>
              <label className="label">Phone (E.164 format)</label>
              <input {...register('phone')} className="input" placeholder="+263712345678" />
            </div>
            <div>
              <label className="label">Date of Birth</label>
              <input {...register('dateOfBirth')} type="date" className="input" />
            </div>
            <div>
              <label className="label">City</label>
              <input {...register('city')} className="input" placeholder="e.g. Harare" />
            </div>
            <div>
              <label className="label">Province</label>
              <select {...register('province')} className="input">
                <option value="">Select province</option>
                {['Harare','Bulawayo','Manicaland','Mashonaland Central','Mashonaland East',
                  'Mashonaland West','Masvingo','Matabeleland North','Matabeleland South','Midlands'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Customer Segment</label>
              <select {...register('segment')} className="input">
                <option value="retail">Retail</option>
                <option value="micro">Micro</option>
                <option value="sme">SME</option>
                <option value="corporate">Corporate</option>
                <option value="agricultural">Agricultural</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? 'Creating…' : 'Create Customer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Detail Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`Customer — ${selected.customerNumber}`} size="lg">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Customer Number', selected.customerNumber],
                ['Full Name', `${selected.firstName || ''} ${selected.lastName || ''}${selected.companyName || ''}`],
                ['Email', selected.email],
                ['Phone', selected.phone || '—'],
                ['ID Number', selected.idNumber || '—'],
                ['Type', selected.type],
                ['Segment', selected.segment],
                ['City', selected.city || '—'],
                ['KYC Status', null],
                ['Member Since', fmtDate(selected.createdAt)],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <p className="text-gray-400 text-xs mb-0.5">{k}</p>
                  {k === 'KYC Status' ? <StatusBadge status={selected.kycStatus} type="kyc" /> : <p className="font-medium">{v || '—'}</p>}
                </div>
              ))}
            </div>
            {(selected.kycStatus === 'not_submitted' || selected.kycStatus === 'pending_review') && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3">Update KYC Status</h4>
                <div className="flex gap-3">
                  <button onClick={() => kycMutation.mutate({ id: selected.id, status: 'approved', notes: 'Approved by officer' })}
                    className="btn-primary text-xs">
                    <CheckCircle className="w-3.5 h-3.5" /> Approve KYC
                  </button>
                  <button onClick={() => kycMutation.mutate({ id: selected.id, status: 'rejected', notes: 'Documents incomplete' })}
                    className="btn-secondary text-xs text-red-600">
                    Reject
                  </button>
                </div>
              </div>
            )}

            {canViewChatHistory && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-brand-red" /> AI Chatbot History
                  </h4>
                  {!showChatHistory && (
                    <button onClick={() => setShowChatHistory(true)} className="btn-ghost text-xs">Load history</button>
                  )}
                </div>

                {showChatHistory && (
                  chatLoading ? <PageLoader /> : (chatSessions?.length ?? 0) === 0 ? (
                    <p className="text-xs text-gray-400">No chatbot sessions recorded for this customer.</p>
                  ) : (
                    <div className="space-y-4 max-h-80 overflow-y-auto">
                      {chatSessions.map((session: any) => (
                        <div key={session.id} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400">{fmtDate(session.createdAt)}</span>
                            <span className={
                              session.status === 'escalated' ? 'badge-orange'
                                : session.status === 'active' ? 'badge-green'
                                : 'badge-gray'
                            }>
                              {session.status}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {(session.messages ?? []).map((m: any, i: number) => (
                              <div key={i} className={`text-xs px-2.5 py-1.5 rounded-lg max-w-[85%] ${
                                m.role === 'user' ? 'bg-gray-100 text-gray-700 ml-auto' : 'bg-brand-red/5 text-gray-700'
                              }`}>
                                <span className="font-semibold capitalize">{m.role}: </span>{m.content}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
                <p className="text-[11px] text-gray-300 mt-2">Visible to Compliance, Admin, and Super Admin only — for audit and QA purposes.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
