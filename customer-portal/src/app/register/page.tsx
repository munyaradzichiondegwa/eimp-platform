'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui';

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', phone: '', idNumber: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    setLoading(true);
    try {
      await register(form);
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      setError(Array.isArray(msg) ? msg[0] : (msg || 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white max-w-md mx-auto">
      <div className="px-6 pt-12 pb-6">
        <Link href="/login" className="inline-flex items-center text-gray-400 mb-4">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
        <p className="text-gray-500 text-sm mt-1">Get started with EBA Micro Insurance in minutes</p>
      </div>

      <form onSubmit={onSubmit} className="px-6 space-y-4 flex-1 pb-8">
        {error && <Alert type="error" message={error} />}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">First name</label>
            <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              required className="input" placeholder="Tendai" />
          </div>
          <div>
            <label className="label">Last name</label>
            <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              required className="input" placeholder="Moyo" />
          </div>
        </div>

        <div>
          <label className="label">Email address</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            required className="input" placeholder="you@example.com" />
        </div>

        <div>
          <label className="label">Phone number</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="input" placeholder="+263 71 234 5678" />
        </div>

        <div>
          <label className="label">National ID number</label>
          <input value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))}
            className="input" placeholder="63-123456-A-00" />
          <p className="text-xs text-gray-400 mt-1">You can add this later if you don&apos;t have it handy</p>
        </div>

        <div>
          <label className="label">Password</label>
          <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            required minLength={10} className="input" placeholder="At least 10 characters" />
        </div>

        <button type="submit" disabled={loading} className="btn-primary mt-2">
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-xs text-gray-400 text-center pt-2">
          By signing up, you agree to EBA Micro Insurance&apos;s terms of service and privacy policy.
        </p>
      </form>
    </div>
  );
}
