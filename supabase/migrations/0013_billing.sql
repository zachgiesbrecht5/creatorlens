-- Billing. Stripe is the source of truth for subscriptions; we mirror the
-- state onto profiles so gating is one column read.
--   plan: trial (free) | pro | agency | team (house) | admin
-- Credits: scans are unlimited on any paid plan; drafts and research refill
-- monthly on invoice.paid (pro 60/15, agency unlimited/60). Contact reveals
-- are a new credit for the free tier only.

alter type plan_t add value if not exists 'agency';

alter table profiles add column if not exists stripe_customer_id text unique;
alter table profiles add column if not exists stripe_subscription_id text;
alter table profiles add column if not exists plan_status text;             -- active | trialing | past_due | canceled
alter table profiles add column if not exists plan_renews_at timestamptz;
alter table profiles add column if not exists founding boolean not null default false;   -- beta user: founding discount for life
alter table profiles add column if not exists reveal_credits int not null default 3;    -- free-tier contact reveals

-- everyone who signed up before billing went live is a founding user
update profiles set founding = true;

-- spend_credit: paid plans never run out of scans; agency never runs out of drafts
create or replace function spend_credit(p_user uuid, p_kind text, p_reason text, p_ref text default null)
returns boolean language plpgsql security definer as $$
declare ok boolean;
begin
  if p_kind = 'scan' then
    update profiles set scan_credits = scan_credits - 1 where id = p_user and (scan_credits > 0 or plan in ('team','pro','agency','admin')) returning true into ok;
  elsif p_kind = 'research' then
    update profiles set research_credits = research_credits - 1 where id = p_user and (research_credits > 0 or plan in ('team','admin')) returning true into ok;
  elsif p_kind = 'reveal' then
    update profiles set reveal_credits = reveal_credits - 1 where id = p_user and (reveal_credits > 0 or plan in ('team','pro','agency','admin')) returning true into ok;
  else
    update profiles set draft_credits = draft_credits - 1 where id = p_user and (draft_credits > 0 or plan in ('team','agency','admin')) returning true into ok;
  end if;
  if ok then insert into credit_ledger (user_id, kind, delta, reason, ref) values (p_user, p_kind, -1, p_reason, p_ref); end if;
  return coalesce(ok, false);
end $$;

-- monthly refill, called by the Stripe webhook on invoice.paid
create or replace function refill_plan_credits(p_user uuid, p_plan text) returns void language plpgsql security definer as $$
begin
  if p_plan = 'pro' then
    update profiles set draft_credits = greatest(draft_credits, 60), research_credits = greatest(research_credits, 15) where id = p_user;
  elsif p_plan = 'agency' then
    update profiles set draft_credits = greatest(draft_credits, 9999), research_credits = greatest(research_credits, 60) where id = p_user;
  end if;
  insert into credit_ledger (user_id, kind, delta, reason) values (p_user, 'refill', 0, 'plan:' || p_plan);
end $$;
