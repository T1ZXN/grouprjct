-- ============================================================================
-- N2 Wheels — customer accounts: the saved-vehicle table
-- ============================================================================
-- The owner applies this BY HAND in the Supabase Dashboard → SQL Editor
-- (exactly like scripts/sync-fitment-records.sql). It is never run by the site
-- and never run by any script in this repo.
--
-- WHAT IT CREATES
--   public.customer_profiles — ONE row per customer account (id = the auth
--   user's uid), holding that customer's saved vehicle as jsonb. The site's
--   /account page reads and writes its own row only.
--
-- Safe to run more than once (IF NOT EXISTS + policy drops).
--
-- HONESTY NOTE: until this has been run, /account shows the customer a clear
-- "saved vehicles aren't set up yet" card and refuses to pretend a save
-- happened. Nothing is stored locally as a stand-in.
-- ============================================================================

create table if not exists customer_profiles (
  id uuid primary key references auth.users on delete cascade,
  vehicle jsonb,
  updated_at timestamptz default now()
);

-- ── Row-level security ──────────────────────────────────────────────────────
-- RLS is the real boundary: with it on and only the policies below, a customer
-- can read/write THEIR row and no one else's, and an anonymous request gets
-- nothing at all. The site never uses a service_role key.
alter table customer_profiles enable row level security;

drop policy if exists "customer_profiles_select_own" on customer_profiles;
create policy "customer_profiles_select_own" on customer_profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "customer_profiles_insert_own" on customer_profiles;
create policy "customer_profiles_insert_own" on customer_profiles
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "customer_profiles_update_own" on customer_profiles;
create policy "customer_profiles_update_own" on customer_profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No DELETE policy on purpose: /account clears the saved vehicle by writing
-- vehicle = null, so the account keeps its row and its history.

-- ── Verification (run after the block above) ────────────────────────────────
-- Expect the table present with RLS enabled and three policies:
--
--   select id, vehicle, updated_at from customer_profiles limit 1;
--   select policyname, cmd from pg_policies where tablename = 'customer_profiles';
--
-- ── A note for the owner about /admin ──────────────────────────────────────
-- /admin and /account share ONE Supabase project and therefore one session, so
-- any authenticated account (including a shop customer) counts as "authenticated"
-- for these policies. The admin pages themselves are limited by the site's own
-- allow-list setting (VITE_ADMIN_EMAILS, comma-separated business emails); set
-- it to the owner's admin address so customer accounts cannot open the admin
-- tooling. Nothing here changes the existing policies on public.products /
-- public.pricing_settings — tell the team if you want those tightened to an
-- admin-only allow-list too.
