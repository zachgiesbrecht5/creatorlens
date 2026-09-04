-- Fix: the auth.users insert trigger runs as supabase_auth_admin whose search_path
-- does not include public, so unqualified table names failed with
-- "Database error saving new user". Pin the search_path and qualify everything.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.credit_ledger (user_id, kind, delta, reason)
  values (new.id, 'scan', 5, 'trial_grant'), (new.id, 'draft', 3, 'trial_grant');
  return new;
end $$;

-- Same hardening for the other security-definer helpers.
alter function public.spend_credit(uuid, text, text, text) set search_path = public;
alter function public.grant_credits(uuid, text, int, text) set search_path = public;
alter function public.apply_referral(uuid, text) set search_path = public;
