'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMyAgent, updateMyAgent } from '@/lib/applications';
import { createClient } from '@/lib/supabase/client';

export default function AccountPage() {
  const [name, setName] = useState('');
  const [ic, setIc] = useState('');
  const [staffId, setStaffId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Password change (self-service; onboarded accounts start on a shared temp password).
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

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

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.length < 6) {
      setPwMsg('Password must be at least 6 characters.');
      return;
    }
    if (pw !== pw2) {
      setPwMsg('Passwords do not match.');
      return;
    }
    setPwSaving(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) {
      setPwMsg(error.message);
      return;
    }
    setPw('');
    setPw2('');
    setPwMsg('Password updated. Use it the next time you sign in.');
  };

  return (
    <div className="flex-1">
      <div className="container mx-auto px-4 py-8 max-w-xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            My Account
          </h1>
          <p className="text-sm text-slate-500">
            Your agent details print onto every PDF you generate.
          </p>
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

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Change Password</CardTitle>
            <p className="text-sm text-slate-500">
              If you are still on the temporary password you were given, change it now.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="new-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm new password</Label>
                <Input
                  id="pw2"
                  type="password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={pwSaving}>
                  {pwSaving ? 'Updating…' : 'Update password'}
                </Button>
                {pwMsg && (
                  <span className="text-sm text-slate-600 dark:text-slate-300">{pwMsg}</span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
