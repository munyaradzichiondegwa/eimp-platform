'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Camera, Check, Upload, MailWarning } from 'lucide-react';
import { portalApi, uploadFileDirect, authApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PageLoader, StatusBadge, Alert, Sheet } from '@/components/ui';

const KYC_DOC_TYPES = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'proof_of_address', label: 'Proof of Address' },
];

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [showKyc, setShowKyc] = useState(false);
  const [docType, setDocType] = useState('national_id');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({ queryKey: ['my-profile'], queryFn: portalApi.getProfile });
  const { data: kycDocs } = useQuery({ queryKey: ['my-kyc'], queryFn: portalApi.getKycDocuments });

  const [form, setForm] = useState({ phone: '', city: '', addressLine1: '' });

  const updateMutation = useMutation({
    mutationFn: portalApi.updateProfile,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-profile'] }); setEditMode(false); },
    onError: (e: any) => setSaveError(e?.response?.data?.detail || 'Update failed'),
  });

  const uploadKycMutation = useMutation({
    mutationFn: portalApi.uploadKycDocument,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-kyc'] }); qc.invalidateQueries({ queryKey: ['my-profile'] }); setShowKyc(false); },
  });

  const [verificationSent, setVerificationSent] = useState(false);
  const resendVerificationMutation = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => setVerificationSent(true),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const fileKey = await uploadFileDirect(file, 'kyc-documents');
      const extension = file.name.split('.').pop() || '';
      await uploadKycMutation.mutateAsync({
        documentType: docType, fileKey, fileExtension: extension, fileSizeBytes: file.size,
      });
    } catch (err: any) {
      setUploadError(err?.response?.data?.detail || err?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <div className="page-container"><PageLoader /></div>;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-5 pt-2">
        <h1>Profile</h1>
        <button onClick={logout} className="text-gray-400">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <div className="card mb-4 flex items-center gap-4">
        <div className="w-16 h-16 bg-brand-red text-white rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0">
          {user?.firstName?.[0]}{user?.lastName?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">{user?.firstName} {user?.lastName}</p>
          <p className="text-sm text-gray-400 truncate">{profile?.email}</p>
          <p className="text-xs text-gray-300 font-mono mt-0.5">{profile?.customerNumber}</p>
        </div>
      </div>

      {user && user.emailVerified === false && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <MailWarning className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">Confirm your email</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {verificationSent
                ? 'Verification link sent — check your inbox.'
                : "We sent a link when you signed up. Didn't get it?"}
            </p>
            {!verificationSent && (
              <button
                onClick={() => resendVerificationMutation.mutate()}
                disabled={resendVerificationMutation.isPending}
                className="text-xs font-semibold text-amber-700 mt-1.5"
              >
                {resendVerificationMutation.isPending ? 'Sending…' : 'Resend verification email'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-sm">Identity Verification</p>
          <StatusBadge status={profile?.kycStatus} type="kyc" />
        </div>
        {profile?.kycStatus !== 'approved' && (
          <>
            <p className="text-xs text-gray-400 mb-3">Upload a document to verify your identity and unlock purchases and claims.</p>
            <button onClick={() => setShowKyc(true)} className="btn-secondary text-xs py-2.5">
              <Upload className="w-3.5 h-3.5" /> Upload Document
            </button>
          </>
        )}
        {(kycDocs || []).length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {kycDocs.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between text-xs">
                <span className="capitalize text-gray-600">{d.documentType.replace(/_/g, ' ')}</span>
                <span className={`font-medium ${d.status === 'approved' ? 'text-green-600' : d.status === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>
                  {d.status === 'approved' && <Check className="w-3 h-3 inline mr-1" />}
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm">Personal Information</p>
          <button onClick={() => { setEditMode(!editMode); setForm({ phone: profile?.phone || '', city: profile?.city || '', addressLine1: profile?.addressLine1 || '' }); }}
            className="text-xs text-brand-red font-semibold">
            {editMode ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {saveError && <div className="mb-3"><Alert type="error" message={saveError} /></div>}

        {!editMode ? (
          <div className="space-y-2.5 text-sm">
            {[
              ['Phone', profile?.phone || '—'],
              ['Address', profile?.addressLine1 || '—'],
              ['City', profile?.city || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-gray-400">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Address</label>
              <input value={form.addressLine1} onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="input" />
            </div>
            <button onClick={() => { setSaveError(''); updateMutation.mutate(form); }} disabled={updateMutation.isPending} className="btn-primary">
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <a href="/support" className="card flex items-center justify-between mb-3">
        <span className="font-medium text-sm">Help & Support</span>
        <span className="text-gray-300">›</span>
      </a>

      <Sheet open={showKyc} onClose={() => setShowKyc(false)} title="Upload Identity Document">
        <div className="space-y-4">
          {uploadError && <Alert type="error" message={uploadError} />}
          <div>
            <label className="label">Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} className="input">
              {KYC_DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" className="hidden" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-primary">
            {uploading ? 'Uploading…' : <><Camera className="w-4 h-4" /> Choose Photo or File</>}
          </button>
          <p className="text-xs text-gray-400 text-center">Accepted: PDF, JPG, PNG. Max 15MB.</p>
        </div>
      </Sheet>
    </div>
  );
}
