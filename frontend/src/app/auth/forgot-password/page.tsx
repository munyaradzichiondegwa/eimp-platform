'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, MailCheck, AlertCircle } from 'lucide-react';
import { authApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again in a moment.');
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
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <MailCheck className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Check your email</h2>
              <p className="text-sm text-gray-500 mt-2">
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password. It expires in 30 minutes.
              </p>
              <Link href="/auth/login" className="text-brand-red font-semibold text-sm mt-6 inline-block">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Forgot password?</h2>
                <p className="text-gray-500 text-sm mt-1">Enter your email and we&apos;ll send you a reset link</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
                <div>
                  <label className="label">Email address</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    autoComplete="email" placeholder="you@ebamicroinsurance.co.zw" className="input" required
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <Link href="/auth/login" className="text-xs text-gray-400 text-center mt-8 block">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
