'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  listApplications,
  deleteApplication,
  getPdfUrl,
  getMyProfile,
  getOwnerEmails,
  type SavedApplication,
  type Role,
} from '@/lib/applications';

const RELOAD_KEY = 'cc-reload-application';

export default function HistoryPage() {
  const router = useRouter();
  const [apps, setApps] = useState<SavedApplication[]>([]);
  const [role, setRole] = useState<Role>('user');
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const staff = role === 'admin' || role === 'manager';

  const load = async () => {
    setLoading(true);
    try {
      const prof = await getMyProfile();
      const r = prof?.role ?? 'user';
      setRole(r);
      setApps(await listApplications());
      if (r === 'admin' || r === 'manager') setOwners(await getOwnerEmails());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDownload = async (app: SavedApplication) => {
    if (!app.pdf_path) return;
    const url = await getPdfUrl(app.pdf_path);
    if (url) window.open(url, '_blank');
    else alert('Could not fetch PDF link.');
  };

  const handleLoad = (app: SavedApplication) => {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify(app.data));
    router.push('/');
  };

  const handleDelete = async (app: SavedApplication) => {
    if (!confirm('Delete this application permanently?')) return;
    try {
      await deleteApplication(app);
      setApps((prev) => prev.filter((a) => a.id !== app.id));
    } catch (e) {
      alert('Delete failed: ' + (e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              Saved Applications
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {apps.length} saved{staff ? ' · viewing all users' : ''} · role: {role}
            </p>
          </div>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            ← Back to form
          </Link>
        </div>

        {loading && <p className="text-slate-500">Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && apps.length === 0 && (
          <p className="text-slate-500">No applications saved yet.</p>
        )}

        <div className="space-y-3">
          {apps.map((app) => (
            <Card key={app.id} className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{app.applicant_name || 'Unnamed applicant'}</span>
                  <span className="text-xs font-normal text-slate-500">
                    {new Date(app.created_at).toLocaleString('en-MY')}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                <span>IC: {app.ic_number || '—'}</span>
                <span>Bank: {app.bank_id || '—'}</span>
                <span>Card: {app.card_type || '—'}</span>
                {staff && <span>By: {owners[app.user_id] || '—'}</span>}
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleLoad(app)}>
                    Load into form
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!app.pdf_path}
                    onClick={() => handleDownload(app)}
                  >
                    Download PDF
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(app)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
