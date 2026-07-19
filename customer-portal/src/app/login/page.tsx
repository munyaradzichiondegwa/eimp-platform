'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white max-w-md mx-auto">
      <div className="px-6 pt-16 pb-8">
        <div className="w-14 h-14 bg-brand-red rounded-2xl flex items-center justify-center mb-5">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-500 text-sm mt-1">Sign in to manage your insurance</p>
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

        <div>
          <label className="label">Password</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password" required className="input pr-12" autoComplete="current-password"
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <Link href="/forgot-password" className="text-xs text-brand-red font-semibold mt-2 inline-block">
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={loading} className="btn-primary mt-2">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="px-6 py-6 text-center">
        <p className="text-sm text-gray-500">
          New to EBA Micro Insurance?{' '}
          <Link href="/register" className="text-brand-red font-semibold">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
