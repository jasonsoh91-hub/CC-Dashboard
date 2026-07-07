'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMyAgent, updateMyAgent } from '@/lib/applications';

export default function AccountPage() {
  const [name, setName] = useState('');
  const [ic, setIc] = useState('');
  const [staffId, setStaffId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getMyAgent()
      .then((a) => {
        if (a) {
          setName(a.agent_name);
          setIc(a.agent_ic);
          setStaffId(a.agent_staff_id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await updateMyAgent({ agent_name: name, agent_ic: ic, agent_staff_id: staffId });
    setSaving(false);
    setMsg(res.ok ? 'Saved. These auto-fill your generated PDFs.' : res.error || 'Save failed.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">My Account</h1>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agent Details</CardTitle>
            <p className="text-sm text-slate-500">
              Auto-filled into the &quot;Agent Name / Agent IC / Staff ID&quot; fields of every
              application PDF you generate.
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-slate-500 text-sm">Loading…</div>
            ) : (
              <form onSubmit={save} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="an">Agent Name</Label>
                  <Input id="an" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="aic">Agent IC</Label>
                  <Input id="aic" value={ic} onChange={(e) => setIc(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asi">Staff ID</Label>
                  <Input id="asi" value={staffId} onChange={(e) => setStaffId(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  {msg && <span className="text-sm text-slate-600 dark:text-slate-300">{msg}</span>}
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
