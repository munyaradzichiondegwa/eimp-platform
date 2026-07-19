'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, Plus, Eye, UserCheck, UserX } from 'lucide-react';
import Header from '@/components/layout/Header';
import { StatusBadge, PageLoader, EmptyState, Modal, Pagination, Alert, StatCard } from '@/components/ui';
import { usersApi } from '@/lib/api';
import { fmtDate, type UserRole } from '@/types';
import { Users } from 'lucide-react';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Administrator' },
  { value: 'underwriter', label: 'Underwriter' },
  { value: 'claims_officer', label: 'Claims Officer' },
  { value: 'finance', label: 'Finance Officer' },
  { value: 'compliance', label: 'Compliance Officer' },
  { value: 'broker', label: 'Broker / Agent' },
  { value: 'readonly', label: 'Read Only' },
];

const createSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(10, 'Minimum 10 characters'),
  role: z.enum(['super_admin','admin','underwriter','claims_officer','finance','compliance','broker','customer','readonly']),
  phone: z.string().optional(),
  department: z.string().optional(),
  branchId: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [createError, setCreateError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', roleFilter, page],
    queryFn: () => usersApi.list({ role: roleFilter, page, limit: 20 }),
  });

  const { data: stats } = useQuery({
    queryKey: ['users', 'stats'],
    queryFn: usersApi.stats,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'readonly' },
  });

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => setCreateError(e?.response?.data?.detail || 'Failed to create user'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      usersApi.setStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setSelected(null);
    },
  });

  const onSubmit = (data: CreateForm) => {
    setCreateError('');
    createMutation.mutate(data);
  };

  // Filter locally for name search (API filter by role only)
  const filteredUsers = (data?.data ?? []).filter((u: any) =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    u.lastName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="User Management"
        subtitle={`${data?.total ?? 0} platform users`}
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New User
          </button>
        }
      />

      <main className="flex-1 p-6 space-y-5">
        {/* Stats by role */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={stats?.total ?? 0} colour="default" icon={Users} />
          <StatCard label="Underwriters" value={stats?.byRole?.underwriter ?? 0} colour="gold" icon={Users} />
          <StatCard label="Claims Officers" value={stats?.byRole?.claims_officer ?? 0} colour="red" icon={Users} />
          <StatCard label="Brokers / Agents" value={stats?.byRole?.broker ?? 0} colour="green" icon={Users} />
        </div>

        <div className="card p-0 overflow-hidden">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 p-4 border-b border-gray-100">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email…" className="input pl-9" />
            </div>
            <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="input w-44">
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {isLoading ? <PageLoader /> : filteredUsers.length === 0 ? (
            <EmptyState title="No users found"
              action={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" />Add User</button>} />
          ) : (
            <>
              <div className="table-container border-0 rounded-none">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Role</th>
                      <th>Department</th><th>Status</th><th>Last Login</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u: any) => (
                      <tr key={u.id}>
                        <td className="font-medium">{u.firstName} {u.lastName}</td>
                        <td className="text-gray-500">{u.email}</td>
                        <td>
                          <span className="capitalize text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-700">
                            {u.role?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="text-gray-400">{u.department || '—'}</td>
                        <td><StatusBadge status={u.status} type="user" /></td>
                        <td className="text-gray-400">{u.lastLogin ? fmtDate(u.lastLogin) : 'Never'}</td>
                        <td>
                          <button onClick={() => setSelected(u)} className="btn-ghost text-xs">
                            <Eye className="w-3.5 h-3.5" /> View
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

      {/* Create User Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setCreateError(''); }}
        title="Create Platform User" size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createError && <Alert type="error" message={createError} />}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input {...register('firstName')} className="input" />
              {errors.firstName && <p className="form-error">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input {...register('lastName')} className="input" />
              {errors.lastName && <p className="form-error">{errors.lastName.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="label">Email Address *</label>
              <input {...register('email')} type="email" className="input" />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="label">Password * (min 10 characters)</label>
              <input {...register('password')} type="password" className="input" />
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>
            <div>
              <label className="label">Role *</label>
              <select {...register('role')} className="input">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {errors.role && <p className="form-error">{errors.role.message}</p>}
            </div>
            <div>
              <label className="label">Phone</label>
              <input {...register('phone')} className="input" placeholder="+263712345678" />
            </div>
            <div>
              <label className="label">Department</label>
              <input {...register('department')} className="input" placeholder="e.g. Operations" />
            </div>
            <div>
              <label className="label">Branch ID</label>
              <input {...register('branchId')} className="input" placeholder="e.g. HRE-001" />
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-xs text-yellow-700">
              The user will receive login credentials at the email address provided.
              They should change their password on first login. All access is logged per IPEC compliance.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* User Detail & Action Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`User — ${selected.email}`} size="md">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Name', `${selected.firstName} ${selected.lastName}`],
                ['Email', selected.email],
                ['Role', selected.role?.replace(/_/g, ' ')],
                ['Status', null],
                ['Department', selected.department || '—'],
                ['Branch', selected.branchId || '—'],
                ['MFA', selected.mfaEnabled ? 'Enabled' : 'Disabled'],
                ['Last Login', selected.lastLogin ? fmtDate(selected.lastLogin) : 'Never'],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <p className="text-gray-400 text-xs mb-0.5 capitalize">{k}</p>
                  {k === 'Status'
                    ? <StatusBadge status={selected.status} type="user" />
                    : <p className="font-medium capitalize">{String(v)}</p>}
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">Account Actions</h4>
              <div className="flex gap-3 flex-wrap">
                {selected.status !== 'active' && (
                  <button onClick={() => statusMutation.mutate({ id: selected.id, status: 'active' })}
                    disabled={statusMutation.isPending} className="btn-primary text-xs">
                    <UserCheck className="w-3.5 h-3.5" /> Activate
                  </button>
                )}
                {selected.status === 'active' && (
                  <button onClick={() => statusMutation.mutate({ id: selected.id, status: 'suspended' })}
                    disabled={statusMutation.isPending} className="btn-secondary text-xs text-red-600">
                    <UserX className="w-3.5 h-3.5" /> Suspend
                  </button>
                )}
                {selected.status !== 'inactive' && (
                  <button onClick={() => statusMutation.mutate({ id: selected.id, status: 'inactive' })}
                    disabled={statusMutation.isPending} className="btn-secondary text-xs">
                    Deactivate
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                All status changes are immutably logged in the audit trail.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
