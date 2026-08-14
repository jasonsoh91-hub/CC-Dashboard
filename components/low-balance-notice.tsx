'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { getMyBalance, getMyOnboarding } from '@/lib/applications';
import {
  BALANCE_CHANGED_EVENT,
  CREDIT_FLOOR,
  LOW_BALANCE_WARN,
  SUPPORT_WHATSAPP,
  SUPPORT_WHATSAPP_LINK,
  formsLeft,
} from '@/lib/support';

const DISMISS_KEY = 'cc-lowbal-dismissed-at';

/**
 * Low-credit reminder. Pops up when the balance falls under RM4 (2 forms left).
 *
 * Dismissible — unlike the onboarding gate this must not block work. Dismissing
 * records the balance it was dismissed at, so it stays quiet until the balance
 * drops further; that way it nags on each step down (RM2 -> RM0 -> -RM2) instead
 * of on every page load.
 */
export function LowBalanceNotice() {
  const [balance, setBalance] = useState<number | null>(null);
  const [source, setSource] = useState<'team' | 'user'>('user');
  const [show, setShow] = useState(false);

  const check = useCallback(async () => {
    const onboarding = await getMyOnboarding();
    // Signed out, or still behind the welcome dialog — don't stack two modals.
    if (!onboarding || !onboarding.onboarded) return;

    const b = await getMyBalance().catch(() => null);
    if (!b) return;

    setBalance(b.balance);
    setSource(b.source);

    if (b.balance >= LOW_BALANCE_WARN) {
      sessionStorage.removeItem(DISMISS_KEY);
      setShow(false);
      return;
    }

    const dismissedAt = sessionStorage.getItem(DISMISS_KEY);
    if (dismissedAt !== null && b.balance >= Number(dismissedAt)) return;
    setShow(true);
  }, []);

  useEffect(() => {
    check();
    const onChange = () => check();
    window.addEventListener(BALANCE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, onChange);
  }, [check]);

  if (!show || balance === null) return null;

  const left = formsLeft(balance);
  const blocked = left === 0;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, String(balance));
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {blocked ? 'Out of credit' : 'Running low on credit'}
          </h2>
          <p className="text-sm text-slate-500">
            {source === 'team' ? 'Your team pool balance is ' : 'Your balance is '}
            <span className={'font-semibold ' + (balance < 0 ? 'text-red-600' : '')}>
              RM{balance.toFixed(2)}
            </span>
            {blocked ? (
              <> — you can&apos;t generate any more forms until you top up.</>
            ) : (
              <>
                {' '}
                — enough for {left} more form{left === 1 ? '' : 's'}
                {balance < 2 && <> (on credit, down to RM{CREDIT_FLOOR.toFixed(2)})</>}.
              </>
            )}
          </p>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300">
          Request a top-up on the Credits page, or WhatsApp{' '}
          <a
            href={SUPPORT_WHATSAPP_LINK}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-700 dark:text-emerald-400 underline"
          >
            {SUPPORT_WHATSAPP}
          </a>
          .
        </p>

        <div className="flex gap-2">
          <Link href="/credits" onClick={dismiss} className={buttonVariants() + ' flex-1'}>
            Request top-up
          </Link>
          <Button variant="outline" onClick={dismiss}>
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
