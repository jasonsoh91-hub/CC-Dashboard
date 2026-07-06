'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getMyBalance,
  listMyTransactions,
  requestTopup,
  type CreditTx,
} from '@/lib/applications';

export default function CreditsPage() {
  const [balance, setBalance] = useState<{ balance: number; source: 'team' | 'user' } | null>(null);
  const [txns, setTxns] = useState<CreditTx[]>([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    getMyBalance().then(setBalance).catch(() => {});
    listMyTransactions().then(setTxns).catch(() => {});
  };
  useEffect(load, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setMsg('Enter a valid amount.');
      return;
    }
    try {
      await requestTopup(amt, note || undefined);
      setAmount('');
      setNote('');
      setMsg('Top-up request submitted. An admin/manager will approve it.');
      load();
    } catch (err) {
      setMsg('Failed: ' + (err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Credits</h1>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            ← Back to form
          </Link>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-slate-500">
              {balance?.source === 'team' ? 'Team pool balance' : 'Your balance'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">RM{(balance?.balance ?? 0).toFixed(2)}</div>
            <p className="text-sm text-slate-500 mt-1">Each form generate costs RM3.</p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Request top-up</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="amt">Amount (RM)</Label>
                <Input id="amt" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-40">
                <Label htmlFor="note">Note (optional)</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid via bank transfer" />
              </div>
              <Button type="submit">Request</Button>
            </form>
            {msg && <p className="text-sm mt-3 text-slate-600 dark:text-slate-300">{msg}</p>}
            <p className="text-xs text-slate-400 mt-2">
              Online payment gateway coming soon. For now top-ups are approved manually by your manager/admin.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Transaction history</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {txns.length === 0 ? (
              <p className="text-slate-500">No transactions yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{new Date(t.created_at).toLocaleString('en-MY')}</td>
                      <td className="py-2 pr-4">{t.type}</td>
                      <td className={'py-2 pr-4 font-medium ' + (t.amount < 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {t.amount < 0 ? '' : '+'}RM{Number(t.amount).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-slate-500">{t.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
