'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, FileText, AlertCircle, DollarSign,
  BarChart2, Settings, LogOut, ShieldCheck, Briefcase, ChevronRight, Handshake,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [] },
  { href: '/customers', label: 'Customers', icon: Users, roles: [] },
  { href: '/policies', label: 'Policies', icon: FileText, roles: [] },
  { href: '/claims', label: 'Claims', icon: AlertCircle, roles: [] },
  { href: '/brokers', label: 'Brokers', icon: Handshake, roles: ['super_admin','admin','underwriter','finance','broker'] },
  { href: '/finance', label: 'Finance', icon: DollarSign, roles: ['super_admin','admin','finance','compliance'] },
  { href: '/reports', label: 'Reports', icon: BarChart2, roles: ['super_admin','admin','finance','compliance'] },
  { href: '/users', label: 'Users', icon: Briefcase, roles: ['super_admin','admin'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['super_admin','admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout, isRole } = useAuth();

  const visibleNav = NAV.filter(n => n.roles.length === 0 || isRole(...n.roles));

  return (
    <aside className="w-60 flex-shrink-0 bg-sidebar-bg flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-red rounded flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">EBA Micro</p>
            <p className="text-white/50 text-xs leading-tight">Insurance EIMP</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all group
                ${active
                  ? 'bg-brand-red text-white font-medium'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3 h-3 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* User panel */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-white/50 text-xs truncate capitalize">{user?.role?.replace('_',' ')}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full mt-1 flex items-center gap-2 px-3 py-2 text-white/60 hover:text-white text-xs rounded-md hover:bg-sidebar-hover transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
