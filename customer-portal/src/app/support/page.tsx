'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, HelpCircle } from 'lucide-react';
import { portalApi } from '@/lib/api';
import { PageLoader, EmptyState, StatusBadge, Sheet, Alert } from '@/components/ui';
import { fmtDate } from '@/types';

export default function SupportPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['my-tickets'], queryFn: portalApi.getTickets,
  });
  const tickets = ticketsData?.data || [];

  const createMutation = useMutation({
    mutationFn: () => portalApi.createTicket({ subject, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
      setShowNew(false); setSubject(''); setDescription('');
    },
    onError: (e: any) => setError(e?.response?.data?.detail || 'Could not create ticket'),
  });

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-5 pt-2">
        <button onClick={() => router.back()} className="text-gray-400">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1>Support</h1>
        <button onClick={() => setShowNew(true)} className="w-9 h-9 bg-brand-red text-white rounded-full flex items-center justify-center">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="card mb-5 bg-brand-red-light border-brand-red/20">
        <p className="text-sm font-semibold text-brand-red mb-1">Need quick help?</p>
        <p className="text-xs text-gray-600">Tap the chat icon for instant answers from our AI assistant, available 24/7.</p>
      </div>

      <div className="section-title">My Tickets</div>

      {isLoading ? <PageLoader /> : tickets.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No support tickets"
          description="Raise a ticket and our team will get back to you."
          action={<button onClick={() => setShowNew(true)} className="btn-primary">New Ticket</button>}
        />
      ) : (
        <div className="space-y-2">
          {tickets.map((t: any) => (
            <div key={t.id} className="card">
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-semibold text-sm flex-1 truncate">{t.subject}</p>
                <StatusBadge status={t.status} />
              </div>
              <p className="text-xs text-gray-400 font-mono mb-1">{t.ticketNumber}</p>
              <p className="text-xs text-gray-400">{fmtDate(t.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="New Support Ticket">
        <div className="space-y-4">
          {error && <Alert type="error" message={error} />}
          <div>
            <label className="label">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="input" placeholder="What can we help with?" />
          </div>
          <div>
            <label className="label">Details</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}
              className="input resize-none" placeholder="Tell us more…" />
          </div>
          <button onClick={() => { setError(''); createMutation.mutate(); }}
            disabled={!subject || !description || createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
