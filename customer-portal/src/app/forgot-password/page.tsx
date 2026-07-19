'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, MailCheck } from 'lucide-react';
import { authApi } from '@/lib/api';
import { Alert } from '@/components/ui';

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

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white max-w-md mx-auto text-center">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
          <MailCheck className="w-7 h-7 text-green-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">Check your email</h1>
        <p className="text-sm text-gray-500 max-w-xs">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password. It expires in 30 minutes.
        </p>
        <Link href="/login" className="text-brand-red font-semibold text-sm mt-6">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white max-w-md mx-auto">
      <div className="px-6 pt-16 pb-8">
        <Link href="/login" className="inline-flex items-center text-gray-400 mb-4">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Forgot password?</h1>
        <p className="text-gray-500 text-sm mt-1">Enter your email and we&apos;ll send you a reset link</p>
      </div>

      <form onSubmit={onSubmit} className="px-6 space-y-4 flex-1">
        {error && <Alert type="error" message={error} />}
        <div>
          <label className="label">Email address</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" required className="input" autoComplete="email"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary mt-2">
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </div>
  );
}
