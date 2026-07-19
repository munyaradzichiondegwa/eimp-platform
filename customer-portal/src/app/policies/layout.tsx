'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { PageLoader } from '@/components/ui';
import BottomNav from '@/components/BottomNav';
import ChatWidget from '@/components/ChatWidget';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading) {
    return <div className="max-w-md mx-auto"><PageLoader /></div>;
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative">
      {children}
      <BottomNav />
      <ChatWidget />
    </div>
  );
}
