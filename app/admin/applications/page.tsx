'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
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
import {
  getMyProfile,
  getOwnerDirectory,
  getPdfUrl,
  listAllApplications,
  type SavedApplication,
} from '@/lib/applications';
import { applicationsToCsv, downloadCsv, EXPORT_COLUMNS, type OwnerInfo } from '@/lib/export';

const ALL = '__all__';

export default function AdminApplicationsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<SavedApplication[]>([]);
  const [owners, setOwners] = useState<Record<string, OwnerInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [bank, setBank] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    getMyProfile().then(async (p) => {
      if (p?.role !== 'admin') {
        router.replace('/');
        return;
      }
      setAuthed(true);
      try {
        const [apps, dir] = await Promise.all([listAllApplications(), getOwnerDirectory()]);
        setRows(apps);
        setOwners(dir);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load applications');
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  const agentOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    return ids
      .map((id) => ({ id, label: owners[id]?.email ?? id.slice(0, 8) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, owners]);

  const bankOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.bank_id).filter(Boolean))) as string[],
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // `to` is a date; compare against end-of-day so the chosen day is included.
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : null;
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;

    return rows.filter((r) => {
      if (agent !== ALL && r.user_id !== agent) return false;
      if (status !== ALL && r.status !== status) return false;
      if (bank !== ALL && r.bank_id !== bank) return false;
      const ts = new Date(r.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (q) {
        const hay = [r.applicant_name, r.ic_number, owners[r.user_id]?.email, r.card_type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, agent, status, bank, from, to, owners]);

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`cc-applications-${stamp}.csv`, applicationsToCsv(filtered, owners));
  };

  const openPdf = async (row: SavedApplication) => {
    if (!row.pdf_path) return;
    const url = await getPdfUrl(row.pdf_path);
    if (url) window.open(url, '_blank');
    else
      alert(
        'Could not open this PDF. Storage access is still owner-scoped, so an admin cannot read another agent’s file yet.'
      );
  };

  if (authed === null) return <div className="p-8 text-slate-500">Checking access…</div>;

  const generated = filtered.filter((r) => r.status === 'generated').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Applications</h1>
            <p className="text-sm text-slate-500">
              Every extraction across all agents. {EXPORT_COLUMNS.length} columns per row in the
              export.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportCsv} disabled={filtered.length === 0}>
              Export CSV ({filtered.length})
            </Button>
            <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>
              Admin
            </Link>
          </div>
        </div>

        {error && <p className="mb-4 text-red-600">{error}</p>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-slate-500">Showing</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{filtered.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-slate-500">Generated</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{generated}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-slate-500">Extracted only</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{filtered.length - generated}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-slate-500">Agents</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{agentOptions.length}</CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, IC, agent email"
                className="w-56"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Agent</Label>
              <Select value={agent} onValueChange={(v) => setAgent(v ?? ALL)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All agents</SelectItem>
                  {agentOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v ?? ALL)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  <SelectItem value="generated">generated</SelectItem>
                  <SelectItem value="extracted">extracted</SelectItem>
                  <SelectItem value="draft">draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Bank</Label>
              <Select value={bank} onValueChange={(v) => setBank(v ?? ALL)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All banks</SelectItem>
                  {bankOptions.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setAgent(ALL);
                setStatus(ALL);
                setBank(ALL);
                setFrom('');
                setTo('');
              }}
            >
              Reset
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Records</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <p className="text-slate-500">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-slate-500">No applications match these filters.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Applicant</th>
                    <th className="py-2 pr-4">IC</th>
                    <th className="py-2 pr-4">Bank / Card</th>
                    <th className="py-2 pr-4">Agent</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const data = (r.data ?? {}) as Record<string, unknown>;
                    const isOpen = expanded === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr className="border-b last:border-0 align-top">
                          <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                            {new Date(r.created_at).toLocaleString('en-MY')}
                          </td>
                          <td className="py-2 pr-4 font-medium">{r.applicant_name || '—'}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{r.ic_number || '—'}</td>
                          <td className="py-2 pr-4 text-xs">
                            {r.bank_id || '—'}
                            <br />
                            <span className="text-slate-400">{r.card_type || '—'}</span>
                          </td>
                          <td className="py-2 pr-4 text-xs">
                            {owners[r.user_id]?.agent_name || owners[r.user_id]?.email || '—'}
                          </td>
                          <td className="py-2 pr-4">
                            <span
                              className={
                                'text-xs px-2 py-0.5 rounded ' +
                                (r.status === 'generated'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700')
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExpanded(isOpen ? null : r.id)}
                              >
                                {isOpen ? 'Hide' : 'View'}
                              </Button>
                              {r.pdf_path && (
                                <Button variant="outline" size="sm" onClick={() => openPdf(r)}>
                                  PDF
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b bg-slate-50 dark:bg-slate-800/50">
                            <td colSpan={7} className="p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                                {Object.entries(data)
                                  .filter(([, v]) => v !== null && v !== undefined && v !== '')
                                  .map(([k, v]) => (
                                    <div key={k} className="min-w-0">
                                      <div className="text-slate-400">{k}</div>
                                      <div className="truncate font-medium">
                                        {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
