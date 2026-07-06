'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { getMyProfile } from '@/lib/applications';
import {
  listTeams,
  listProfiles,
  listTopupRequests,
  createTeam,
  updateTeam,
  assignMember,
  setTeamMode,
  allocateCredit,
  adminTopup,
  managerTopupPool,
  approveTopup,
  type Team,
  type ProfileRow,
  type TopupRequest,
} from '@/lib/teams';

export default function TeamPage() {
  const router = useRouter();
  const [role, setRole] = useState<'admin' | 'manager' | 'user' | null>(null);
  const [uid, setUid] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamMgr, setNewTeamMgr] = useState<string>('');

  const emailById = Object.fromEntries(profiles.map((p) => [p.id, p.email]));

  const load = useCallback(async () => {
    const [t, p, r] = await Promise.all([listTeams(), listProfiles(), listTopupRequests()]);
    setTeams(t);
    setProfiles(p);
    setRequests(r);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUid(user?.id ?? '');
      const prof = await getMyProfile();
      const r = prof?.role ?? 'user';
      setRole(r);
      if (r === 'user') {
        router.replace('/credits');
        return;
      }
      load();
    })();
  }, [router, load]);

  const guard = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const managers = profiles.filter((p) => p.role === 'manager' || p.role === 'admin');

  // Which teams to show: admin -> all; manager -> teams they manage.
  const visibleTeams = role === 'admin' ? teams : teams.filter((t) => t.manager_id === uid);

  if (role === null) return <div className="p-8 text-slate-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Teams &amp; Credit</h1>
          <div className="flex gap-2">
            {role === 'admin' && (
              <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>Admin</Link>
            )}
            <Link href="/" className={buttonVariants({ variant: 'outline' })}>Form</Link>
          </div>
        </div>

        {err && <p className="mb-4 text-red-600">{err}</p>}

        {/* Pending top-up requests */}
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">Pending top-up requests</CardTitle></CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-slate-500">None.</p>
            ) : (
              <div className="space-y-2">
                {pending.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 border-b last:border-0 py-2 text-sm">
                    <div>
                      <span className="font-medium">{emailById[r.user_id] || r.user_id}</span>
                      {' · '}RM{Number(r.amount).toFixed(2)}
                      {r.note ? <span className="text-slate-500"> · {r.note}</span> : ''}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => guard(() => approveTopup(r.id, true))}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => guard(() => approveTopup(r.id, false))}>Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin: create team */}
        {role === 'admin' && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">Create team</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <input
                  className="border rounded-md h-8 px-2 text-sm bg-background"
                  placeholder="Team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <Select value={newTeamMgr} onValueChange={(v) => setNewTeamMgr(v || '')}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Manager" /></SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.email} ({m.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() =>
                    newTeamName &&
                    guard(async () => {
                      await createTeam(newTeamName, newTeamMgr || null);
                      setNewTeamName('');
                      setNewTeamMgr('');
                    })
                  }
                >
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Teams */}
        {visibleTeams.map((team) => {
          const members = profiles.filter((p) => p.team_id === team.id);
          return (
            <Card key={team.id} className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>{team.name}</span>
                  <span className="text-sm font-normal text-slate-500">
                    Pool: RM{Number(team.balance).toFixed(2)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-slate-500">
                    Manager: {team.manager_id ? emailById[team.manager_id] || '—' : '—'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span>Mode:</span>
                    <Select value={team.credit_mode} onValueChange={(v) => v && guard(() => setTeamMode(team.id, v as 'pool' | 'individual'))}>
                      <SelectTrigger className="w-36 h-7"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pool">pool (shared)</SelectItem>
                        <SelectItem value="individual">individual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const a = Number(prompt('Top up team pool by RM:'));
                      if (a > 0)
                        guard(() =>
                          role === 'admin'
                            ? adminTopup('team', team.id, a, 'pool top-up')
                            : managerTopupPool(a, 'pool top-up')
                        );
                    }}
                  >
                    Top up pool
                  </Button>
                </div>

                {/* Members */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="py-1 pr-4">Member</th>
                        <th className="py-1 pr-4">Role</th>
                        <th className="py-1 pr-4">Individual balance</th>
                        <th className="py-1 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.length === 0 ? (
                        <tr><td colSpan={4} className="py-2 text-slate-400">No members.</td></tr>
                      ) : members.map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="py-1 pr-4">{m.email}</td>
                          <td className="py-1 pr-4">{m.role}</td>
                          <td className="py-1 pr-4 font-medium">RM{Number(m.balance).toFixed(2)}</td>
                          <td className="py-1 pr-4">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const a = Number(prompt(`Allocate RM from pool to ${m.email}:`));
                                  if (a > 0) guard(() => allocateCredit(m.id, a));
                                }}
                              >
                                Allocate
                              </Button>
                              {role === 'admin' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const a = Number(prompt(`Direct top up RM to ${m.email}:`));
                                    if (a > 0) guard(() => adminTopup('user', m.id, a, 'admin top-up'));
                                  }}
                                >
                                  Top up
                                </Button>
                              )}
                              {role === 'admin' && (
                                <Button size="sm" variant="destructive" onClick={() => guard(() => assignMember(m.id, null))}>
                                  Remove
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Admin: unassigned users */}
        {role === 'admin' && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Unassigned users</CardTitle></CardHeader>
            <CardContent>
              {profiles.filter((p) => !p.team_id).length === 0 ? (
                <p className="text-slate-500">Everyone is assigned.</p>
              ) : (
                <div className="space-y-2">
                  {profiles.filter((p) => !p.team_id).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 border-b last:border-0 py-2 text-sm">
                      <span>{p.email} ({p.role})</span>
                      <Select onValueChange={(v) => v && guard(() => assignMember(p.id, v as string))}>
                        <SelectTrigger className="w-48 h-7"><SelectValue placeholder="Assign to team" /></SelectTrigger>
                        <SelectContent>
                          {teams.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
