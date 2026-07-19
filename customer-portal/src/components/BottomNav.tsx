'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileText, AlertCircle, User } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/policies', label: 'Policies', icon: FileText },
  { href: '/claims', label: 'Claims', icon: AlertCircle },
  { href: '/profile', label: 'Profile', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-nav z-40">
      <div className="max-w-md mx-auto grid grid-cols-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 py-2.5 transition-colors ${active ? 'text-brand-red' : 'text-gray-400'}`}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[11px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)] bg-white" />
    </nav>
  );
}
