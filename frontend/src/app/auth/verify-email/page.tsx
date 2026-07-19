'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, CheckCircle, XCircle } from 'lucide-react';
import { authApi } from '@/lib/api';

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('This verification link is missing a token.');
      return;
    }
    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err?.response?.data?.detail || 'This verification link is invalid or has expired.');
      });
  }, [token]);

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
        <div className="w-full max-w-md text-center">
          {status === 'checking' && (
            <>
              <div className="w-8 h-8 border-2 border-brand-red/25 border-t-brand-red rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-400 mt-4">Verifying your email…</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Email verified</h2>
              <p className="text-sm text-gray-500 mt-2 mb-6">Thanks for confirming your email address.</p>
              <Link href="/dashboard" className="btn-primary inline-flex">Continue to EIMP</Link>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-7 h-7 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Verification failed</h2>
              <p className="text-sm text-gray-500 mt-2">{errorMsg}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-red/25 border-t-brand-red rounded-full animate-spin" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
