'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, MessageSquare, Sparkles, Users, Wallet } from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import { getMyProfile, type FeedbackRow } from '@/lib/applications';
import { countPendingTopups } from '@/lib/teams';
import { createClient } from '@/lib/supabase/client';

type AdminUser = {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  created_at: string;
  extractions: number;
  agent_name: string | null;
  agent_ic: string | null;
  agent_staff_id: string | null;
};

type Stats = {
  total: number;
  totalExtract: number;
  totalDownload: number;
  userCount: number;
  perUser: { email: string; extractions: number; downloads: number }[];
  perBank: { bank: string; count: number }[];
  perDay: { day: string; count: number }[];
};

export default function AdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [pendingTopups, setPendingTopups] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // new-user form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'user'>('user');
  const [agentName, setAgentName] = useState('');
  const [agentIc, setAgentIc] = useState('');
  const [agentStaffId, setAgentStaffId] = useState('');
  const [creating, setCreating] = useState(false);

  const loadFeedback = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });
    setFeedback((data ?? []) as FeedbackRow[]);
  };

  const loadAll = async () => {
    const [u, s] = await Promise.all([
      fetch('/api/admin/users').then((r) => r.json()),
      fetch('/api/admin/stats').then((r) => r.json()),
    ]);
    if (u.error) setError(u.error);
    else setUsers(u.users);
    if (!s.error) setStats(s);
    loadFeedback();
    countPendingTopups().then(setPendingTopups).catch(() => {});
  };

  const resolveFeedback = async (id: string, status: 'open' | 'resolved') => {
    const supabase = createClient();
    await supabase.from('feedback').update({ status }).eq('id', id);
    loadFeedback();
  };

  useEffect(() => {
    getMyProfile().then((p) => {
      if (p?.role !== 'admin') {
        router.replace('/');
        return;
      }
      setAuthed(true);
      loadAll();
    });
  }, [router]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role,
        agent_name: agentName,
        agent_ic: agentIc,
        agent_staff_id: agentStaffId,
      }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(json.error || 'Failed to create user');
      return;
    }
    setEmail('');
    setPassword('');
    setRole('user');
    setAgentName('');
    setAgentIc('');
    setAgentStaffId('');
    loadAll();
  };

  const editAgent = async (u: AdminUser) => {
    const agent_name = window.prompt(`Agent Name for ${u.email}:`, u.agent_name || '');
    if (agent_name === null) return;
    const agent_ic = window.prompt(`Agent IC for ${u.email}:`, u.agent_ic || '');
    if (agent_ic === null) return;
    const agent_staff_id = window.prompt(`Staff ID for ${u.email}:`, u.agent_staff_id || '');
    if (agent_staff_id === null) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_name, agent_ic, agent_staff_id }),
    });
    if (res.ok) loadAll();
    else setError((await res.json()).error || 'Agent update failed');
  };

  const changeRole = async (id: string, newRole: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) loadAll();
    else setError((await res.json()).error || 'Role change failed');
  };

  const resetPassword = async (id: string, userEmail: string) => {
    const password = window.prompt(`New password for ${userEmail} (min 6 chars):`);
    if (!password) return;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) alert('Password reset.');
    else setError((await res.json()).error || 'Password reset failed');
  };

  const deleteUser = async (id: string, userEmail: string) => {
    if (!confirm(`Delete ${userEmail}? Their applications are removed too.`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) loadAll();
    else setError((await res.json()).error || 'Delete failed');
  };

  if (authed === null) {
    return <div className="p-8 text-slate-500">Checking access…</div>;
  }

  const maxDay = Math.max(1, ...(stats?.perDay.map((d) => d.count) ?? [1]));
  const openFeedback = feedback.filter((f) => f.status === 'open').length;
  const usageByEmail: Record<string, { extractions: number; downloads: number }> = {};
  (stats?.perUser ?? []).forEach((p) => {
    usageByEmail[p.email] = { extractions: p.extractions, downloads: p.downloads };
  });

  return (
    <div className="flex-1">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Admin
          </h1>
          <p className="text-sm text-slate-500">Users, usage and reported issues.</p>
        </div>

        {error && <p className="mb-4 text-red-600">{error}</p>}

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <StatCard
            label="Extractions"
            value={stats?.totalExtract ?? '—'}
            icon={Sparkles}
            href="/admin/applications"
          />
          <StatCard label="Downloads" value={stats?.totalDownload ?? '—'} icon={Download} />
          <StatCard label="Users" value={stats?.userCount ?? '—'} icon={Users} />
          <StatCard
            label="Pending top-ups"
            value={pendingTopups}
            hint={pendingTopups > 0 ? 'Agents waiting on credit' : 'Nothing to approve'}
            icon={Wallet}
            tone={pendingTopups > 0 ? 'amber' : 'default'}
            href="/team"
          />
          <StatCard
            label="Open feedback"
            value={openFeedback}
            icon={MessageSquare}
            tone={openFeedback > 0 ? 'amber' : 'default'}
          />
        </div>

        {/* Create user */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Add user</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createUser} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="ne">Email</Label>
                <Input id="ne" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="np">Password</Label>
                <Input id="np" type="text" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 chars" />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="manager">manager</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="an">Agent Name</Label>
                <Input id="an" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="on PDF" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="aic">Agent IC</Label>
                <Input id="aic" value={agentIc} onChange={(e) => setAgentIc(e.target.value)} placeholder="on PDF" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="asi">Staff ID</Label>
                <Input id="asi" value={agentStaffId} onChange={(e) => setAgentStaffId(e.target.value)} placeholder="on PDF" />
              </div>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Users table */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Users</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Agent (Name / IC / Staff ID)</th>
                  <th className="py-2 pr-4">Extractions</th>
                  <th className="py-2 pr-4">Downloads</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">
                      <Select value={u.role} onValueChange={(v) => v && changeRole(u.id, v)}>
                        <SelectTrigger className="w-32 h-7"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">user</SelectItem>
                          <SelectItem value="manager">manager</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-600 dark:text-slate-300">
                      {u.agent_name || u.agent_ic || u.agent_staff_id
                        ? `${u.agent_name || '—'} / ${u.agent_ic || '—'} / ${u.agent_staff_id || '—'}`
                        : <span className="text-amber-600">not set</span>}
                    </td>
                    <td className="py-2 pr-4 font-medium">
                      {usageByEmail[u.email]?.extractions ?? 0}
                    </td>
                    <td className="py-2 pr-4 font-medium">
                      {usageByEmail[u.email]?.downloads ?? 0}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => editAgent(u)}>
                          Agent
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => resetPassword(u.id, u.email)}>
                          Reset PW
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteUser(u.id, u.email)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Feedback log */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Feedback / extraction issues</CardTitle>
          </CardHeader>
          <CardContent>
            {feedback.length === 0 ? (
              <p className="text-slate-500">No feedback yet.</p>
            ) : (
              <div className="space-y-2">
                {feedback.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start justify-between gap-3 border-b last:border-0 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm">{f.message}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(f.created_at).toLocaleString('en-MY')}
                        {f.application_id ? ` · app ${f.application_id.slice(0, 8)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={
                          'text-xs px-2 py-0.5 rounded ' +
                          (f.status === 'open'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700')
                        }
                      >
                        {f.status}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          resolveFeedback(f.id, f.status === 'open' ? 'resolved' : 'open')
                        }
                      >
                        {f.status === 'open' ? 'Resolve' : 'Reopen'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-day bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Extractions per day</CardTitle>
          </CardHeader>
          <CardContent>
            {stats && stats.perDay.length > 0 ? (
              <div className="flex items-end gap-2 h-40">
                {stats.perDay.map((d) => (
                  <div key={d.day} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                    <div className="text-xs text-slate-500">{d.count}</div>
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${(d.count / maxDay) * 100}%` }}
                    />
                    <div className="text-[10px] text-slate-400 rotate-0 truncate w-full text-center">
                      {d.day.slice(5)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">No data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
