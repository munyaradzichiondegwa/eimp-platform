'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle } from 'lucide-react';
import { authApi } from '@/lib/api';
import { PageLoader, Spinner } from '@/components/ui';

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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white max-w-md mx-auto text-center">
      {status === 'checking' && (
        <>
          <Spinner size="lg" />
          <p className="text-sm text-gray-400 mt-4">Verifying your email…</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">Email verified</h1>
          <p className="text-sm text-gray-500 mb-6">Thanks for confirming your email address.</p>
          <Link href="/dashboard" className="btn-primary">Continue to your account</Link>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-7 h-7 text-red-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">Verification failed</h1>
          <p className="text-sm text-gray-500 mb-6 max-w-xs">{errorMsg}</p>
          <Link href="/profile" className="text-brand-red font-semibold text-sm">Request a new link from your profile</Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto"><PageLoader /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
