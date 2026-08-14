/**
 * One-off onboarding: create agent accounts, set their agent details, and top up credit.
 *
 * Idempotent — safe to re-run. Existing accounts are not recreated and are only
 * topped up once (guarded by a ledger note tag).
 *
 * The roster is PII (real names, personal emails, staff IDs) so it is NOT kept in
 * this repo. Pass a gitignored JSON file of
 *   [{ "name": "...", "email": "...", "staffId": "..." }, ...]
 *
 * Usage:
 *   node scripts/onboard-agents.mjs roster.local.json           # dry run, prints the plan
 *   node scripts/onboard-agents.mjs roster.local.json --apply   # actually writes to Supabase
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// .env.local is Next-specific; load it manually.
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const APPLY = process.argv.includes('--apply');
const TEMP_PASSWORD = '123456';
const TOPUP = 10;
const LEDGER_NOTE = 'onboarding top-up';

const rosterPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!rosterPath) {
  console.error('Usage: node scripts/onboard-agents.mjs <roster.json> [--apply]');
  process.exit(1);
}
const AGENTS = JSON.parse(readFileSync(rosterPath, 'utf8'));

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function findUserByEmail(email) {
  // listUsers is paginated; the staff list is small so one page is plenty.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===');
  console.log(`Target: ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);

  for (const a of AGENTS) {
    let user = await findUserByEmail(a.email);
    const existed = !!user;

    if (!user) {
      if (!APPLY) {
        console.log(`[plan] CREATE ${a.email} (${a.name}, ${a.staffId}) pw=${TEMP_PASSWORD}`);
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: a.email,
          password: TEMP_PASSWORD,
          email_confirm: true,
        });
        if (error) {
          console.error(`[fail] create ${a.email}: ${error.message}`);
          continue;
        }
        user = data.user;
        console.log(`[ok]  created ${a.email} -> ${user.id}`);
      }
    } else {
      console.log(`[skip] ${a.email} already exists (${user.id})`);
    }

    if (!APPLY) {
      console.log(`[plan] SET role=user agent_name="${a.name}" agent_staff_id=${a.staffId}`);
      console.log(`[plan] TOPUP RM${TOPUP.toFixed(2)} to ${a.email}\n`);
      continue;
    }

    // Profile row is created by the handle_new_user trigger; fill in the agent details.
    const { error: pErr } = await admin
      .from('profiles')
      .update({
        role: 'user',
        email: a.email,
        agent_name: a.name,
        agent_staff_id: a.staffId,
      })
      .eq('id', user.id);
    if (pErr) {
      console.error(`[fail] profile ${a.email}: ${pErr.message}`);
      continue;
    }

    // Top up once. Guard on the ledger so re-runs don't stack credit.
    const { data: prior } = await admin
      .from('credit_transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('note', LEDGER_NOTE)
      .limit(1);

    if (prior?.length) {
      console.log(`[skip] ${a.email} already has an onboarding top-up`);
    } else {
      const { data: prof } = await admin
        .from('profiles')
        .select('balance, team_id')
        .eq('id', user.id)
        .single();
      const next = Number(prof?.balance ?? 0) + TOPUP;

      const { error: bErr } = await admin
        .from('profiles')
        .update({ balance: next })
        .eq('id', user.id);
      if (bErr) {
        console.error(`[fail] topup ${a.email}: ${bErr.message}`);
        continue;
      }
      await admin.from('credit_transactions').insert({
        team_id: prof?.team_id ?? null,
        user_id: user.id,
        actor_id: null,
        amount: TOPUP,
        type: 'topup',
        note: LEDGER_NOTE,
      });
      console.log(`[ok]  ${a.email} balance RM${next.toFixed(2)} (+${TOPUP})`);
    }

    if (existed) {
      console.log(`[note] ${a.email} existed — password left unchanged`);
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
