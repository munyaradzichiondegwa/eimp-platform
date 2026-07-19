'use client';
import { Bell, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Props { title: string; subtitle?: string; actions?: React.ReactNode; }

export default function Header({ title, subtitle, actions }: Props) {
  const { user } = useAuth();
  return (
    <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-gray-200 flex-shrink-0">
      <div>
        <h1 className="text-base font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <button className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-brand-red rounded-full"></span>
        </button>
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium text-gray-700">{user?.firstName} {user?.lastName}</p>
          <p className="text-xs text-gray-400 capitalize">{user?.role?.replace(/_/g,' ')}</p>
        </div>
      </div>
    </header>
  );
}
