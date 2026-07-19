'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const [showPwd, setShowPwd] = useState(false);
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      await login(data.email, data.password);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Invalid credentials';
      setServerError(Array.isArray(msg) ? msg[0] : msg);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left brand panel */}
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

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Insurance operations,<br />
            <span className="text-brand-red">fully automated.</span>
          </h1>
          <p className="text-white/60 text-base max-w-md">
            Manage policies, claims, finance and compliance in a single regulated platform
            built for the Zimbabwean insurance market.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { label: 'Policy Issuance', value: '< 4 hours' },
              { label: 'Claims Settlement', value: '< 5 days' },
              { label: 'System Uptime', value: '99.5% SLA' },
              { label: 'Regulators', value: 'IPEC · ZIMRA · FIU' },
            ].map(s => (
              <div key={s.label} className="border border-white/10 rounded-lg p-4">
                <p className="text-white font-bold text-lg">{s.value}</p>
                <p className="text-white/50 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/30 text-xs">
          Prepared by NevTech Consultancy · Ref: NTC/EBA/2026/002 · Regulated by IPEC Zimbabwe
        </p>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-brand-red rounded flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">EBA Micro Insurance EIMP</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Sign in to EIMP</h2>
            <p className="text-gray-500 text-sm mt-1">Authorised personnel only</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{serverError}</p>
              </div>
            )}

            <div>
              <label className="label">Email address</label>
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="you@ebamicroinsurance.co.zw"
                className="input"
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
              <Link href="/auth/forgot-password" className="text-xs text-brand-red font-semibold mt-2 inline-block">
                Forgot password?
              </Link>
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center py-2.5">
              {isSubmitting
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in…</>
                : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-8">
            This system is for authorised EBA Micro Insurance personnel only.<br />
            All access is logged and monitored per IPEC compliance requirements.
          </p>
        </div>
      </div>
    </div>
  );
}
