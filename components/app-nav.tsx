'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CreditCard,
  FileText,
  History,
  LayoutGrid,
  LogOut,
  Table2,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { getMyBalance, getMyProfile, type Role } from '@/lib/applications';
import { countPendingTopups } from '@/lib/teams';
import {
  BALANCE_CHANGED_EVENT,
  LOW_BALANCE_WARN,
  SUPPORT_WHATSAPP,
  formsLeft,
} from '@/lib/support';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
  badge?: number;
};

// Pages with no chrome: the sign-in screen has no session to describe.
const HIDDEN_ON = ['/login'];

export function AppNav() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ role: Role; email: string } | null>(null);
  const [balance, setBalance] = useState<{ balance: number; source: 'team' | 'user' } | null>(null);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    const p = await getMyProfile();
    setProfile(p);
    if (!p) return;
    setBalance(await getMyBalance());
    // Only staff can act on requests, so only staff are shown the count.
    if (p.role === 'admin' || p.role === 'manager') setPending(await countPendingTopups());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  // Keep the balance chip honest after a generate charges the account.
  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener(BALANCE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, onChange);
  }, [refresh]);

  // Catch requests that arrive while the tab is left open.
  useEffect(() => {
    if (profile?.role !== 'admin' && profile?.role !== 'manager') return;
    const t = setInterval(() => countPendingTopups().then(setPending), 60_000);
    return () => clearInterval(t);
  }, [profile?.role]);

  if (HIDDEN_ON.includes(pathname) || !profile) return null;

  const role = profile.role;
  const staff = role === 'admin' || role === 'manager';

  const items: NavItem[] = [
    { href: '/', label: 'New application', icon: FileText },
    { href: '/history', label: 'History', icon: History },
    { href: '/admin/applications', label: 'All data', icon: Table2, roles: ['admin'] },
    { href: '/credits', label: 'Credits', icon: Wallet },
    {
      href: '/team',
      label: 'Teams & top-ups',
      icon: Users,
      roles: ['admin', 'manager'],
      badge: pending,
    },
    { href: '/admin', label: 'Admin', icon: LayoutGrid, roles: ['admin'] },
    { href: '/account', label: 'Account', icon: UserCog },
  ];

  const visible = items.filter((i) => !i.roles || i.roles.includes(role));
  const low = balance !== null && balance.balance < LOW_BALANCE_WARN;

  // Longest matching href wins, so /admin/applications doesn't also light up /admin.
  const activeHref = visible
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      {/* Unapproved top-up requests are money an agent is waiting on, so they
          get a banner rather than only a number tucked inside /team. */}
      {staff && pending > 0 && (
        <Link
          href="/team"
          className="block bg-amber-500 text-amber-950 text-sm font-medium text-center py-2 px-4 hover:bg-amber-400 transition-colors"
        >
          {pending} top-up request{pending > 1 ? 's' : ''} waiting for approval — review now →
        </Link>
      )}

      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center gap-3">
            <Link href="/" className="flex items-center gap-2 shrink-0 mr-1">
              <span className="grid place-items-center size-8 rounded-lg bg-slate-900 dark:bg-white">
                <CreditCard className="size-4 text-white dark:text-slate-900" />
              </span>
              <span className="font-semibold tracking-tight hidden sm:inline">CC Dashboard</span>
            </Link>

            <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
              {visible.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      'relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ' +
                      (active
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800')
                    }
                  >
                    <Icon className="size-4" />
                    <span className="hidden md:inline">{item.label}</span>
                    {!!item.badge && (
                      <span className="ml-0.5 grid place-items-center min-w-5 h-5 px-1 rounded-full bg-amber-500 text-amber-950 text-[11px] font-bold">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              {balance === null ? (
                // Placeholder rather than a green RM0.00, which reads as "no credit".
                <span className="rounded-lg px-2.5 py-1.5 w-20 h-8 bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ) : (
                <Link
                  href="/credits"
                  title={
                    low
                      ? `Low credit — ${formsLeft(balance.balance)} form(s) left. Top up, or WhatsApp ${SUPPORT_WHATSAPP}.`
                      : balance.source === 'team'
                        ? 'Team pool balance'
                        : 'Your balance'
                  }
                  className={
                    'rounded-lg px-2.5 py-1.5 text-sm font-semibold tabular-nums transition-colors ' +
                    (low
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/60 dark:text-red-300'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300')
                  }
                >
                  RM{balance.balance.toFixed(2)}
                  {balance.source === 'team' && <span className="font-normal"> pool</span>}
                </Link>
              )}

              <div className="hidden lg:flex flex-col leading-tight text-right">
                <span className="text-xs font-medium truncate max-w-40">{profile.email}</span>
                <span className="text-[11px] text-slate-400 capitalize">{role}</span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                title="Sign out"
                onClick={async () => {
                  await createClient().auth.signOut();
                  window.location.href = '/login';
                }}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
