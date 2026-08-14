'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { completeOnboarding, getMyOnboarding } from '@/lib/applications';
import { createClient } from '@/lib/supabase/client';
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_LINK } from '@/lib/support';

/**
 * First-login welcome dialog. Staff are onboarded on a shared temporary password,
 * so before they can use the dashboard they must supply their IC + agent ID and
 * set a password only they know.
 *
 * Blocking by design: no dismiss button, no backdrop click-through.
 */
export function OnboardingGate() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [ic, setIc] = useState('');
  const [staffId, setStaffId] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyOnboarding().then((o) => {
      if (cancelled || !o || o.onboarded) return;
      setName(o.agent_name);
      setIc(o.agent_ic);
      setStaffId(o.agent_staff_id);
      setShow(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (!ic.trim()) return setErr('Please enter your IC number.');
    if (!staffId.trim()) return setErr('Please enter your Agent ID.');
    if (pw.length < 6) return setErr('New password must be at least 6 characters.');
    if (pw === '123456') return setErr('Please choose a password other than the temporary one.');
    if (pw !== pw2) return setErr('Passwords do not match.');

    setSaving(true);

    // Password first: if this fails the user stays on the temp password AND still
    // sees the dialog next time, which is the safe order to fail in.
    const { error: pwErr } = await createClient().auth.updateUser({ password: pw });
    if (pwErr) {
      setSaving(false);
      return setErr(pwErr.message);
    }

    const res = await completeOnboarding({ agent_ic: ic, agent_staff_id: staffId });
    setSaving(false);
    if (!res.ok) return setErr(res.error || 'Could not save your details.');
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Welcome{name ? `, ${name}` : ''} 👋
          </h2>
          <p className="text-sm text-slate-500">
            Before you start, confirm your agent details and set your own password. Your IC and
            Agent ID are printed on every application form you generate.
          </p>
        </div>

        <form onSubmit={submit} className="px-6 pb-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ob-ic">IC Number</Label>
            <Input
              id="ob-ic"
              value={ic}
              onChange={(e) => setIc(e.target.value)}
              placeholder="e.g. 850329015365"
              inputMode="numeric"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ob-sid">Agent ID</Label>
            <Input
              id="ob-sid"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              placeholder="e.g. A1055"
            />
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ob-pw">New password</Label>
              <Input
                id="ob-pw"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-pw2">Confirm new password</Label>
              <Input
                id="ob-pw2"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>
          </div>

          {err && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {err}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </Button>

          <p className="text-xs text-slate-500 text-center">
            Need credit or having trouble? WhatsApp{' '}
            <a
              href={SUPPORT_WHATSAPP_LINK}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-emerald-700 dark:text-emerald-400 underline"
            >
              {SUPPORT_WHATSAPP}
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
