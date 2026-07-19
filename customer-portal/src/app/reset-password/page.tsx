'use client';
import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, CheckCircle } from 'lucide-react';
import { authApi } from '@/lib/api';
import { Alert, PageLoader } from '@/components/ui';

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'This reset link is invalid or has expired. Request a new one.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white max-w-md mx-auto text-center">
        <Alert type="error" message="This reset link is missing a token. Please use the link from your email, or request a new one." />
        <Link href="/forgot-password" className="text-brand-red font-semibold text-sm mt-6">Request a new link</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white max-w-md mx-auto text-center">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-7 h-7 text-green-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">Password reset</h1>
        <p className="text-sm text-gray-500">Taking you to sign in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white max-w-md mx-auto">
      <div className="px-6 pt-16 pb-8">
        <div className="w-14 h-14 bg-brand-red rounded-2xl flex items-center justify-center mb-5">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Set a new password</h1>
        <p className="text-gray-500 text-sm mt-1">Choose something you haven&apos;t used before</p>
      </div>

      <form onSubmit={onSubmit} className="px-6 space-y-4 flex-1">
        {error && <Alert type="error" message={error} />}
        <div>
          <label className="label">New password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            required minLength={10} className="input" placeholder="At least 10 characters" />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            required minLength={10} className="input" placeholder="Re-enter your new password" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary mt-2">
          {loading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto"><PageLoader /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
