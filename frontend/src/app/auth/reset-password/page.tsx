'use client';
import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react';
import { authApi } from '@/lib/api';

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
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'This reset link is invalid or has expired. Request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar-bg flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-red rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">EBA Micro Insurance</p>
            <p className="text-white/50 text-sm">Enterprise Management Platform</p>
          </div>
        </div>
        <p className="text-white/30 text-xs">
          Prepared by NevTech Consultancy · Ref: NTC/EBA/2026/002 · Regulated by IPEC Zimbabwe
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {!token ? (
            <div className="text-center">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-left">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">This reset link is missing a token. Please use the link from your email.</p>
              </div>
              <Link href="/auth/forgot-password" className="text-brand-red font-semibold text-sm mt-6 inline-block">
                Request a new link
              </Link>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Password reset</h2>
              <p className="text-sm text-gray-500 mt-2">Taking you to sign in…</p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Set a new password</h2>
                <p className="text-gray-500 text-sm mt-1">Choose something you haven&apos;t used before</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
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
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-red/25 border-t-brand-red rounded-full animate-spin" /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
