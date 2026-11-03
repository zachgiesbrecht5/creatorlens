-- Lock down what the public API (the anon key in every browser) can reach.
-- Found while checking permissions for 0063:
--  * any signed-in user could UPDATE their own profiles row through the REST API, including plan, role, org_id
--    and every *_credits column (so: make themselves admin, join the house org, or top up credits);
--  * credit and admin functions (grant_credits, spend_credit, refill_plan_credits, claim_scan_jobs, refresh_brand_wall...)
--    were executable by anon and authenticated via /rest/v1/rpc;
--  * brand_wall_mv and the security-definer views brand_wall / creators_slim were readable over the API,
--    which is the house-only reverse view.
-- The web app and worker reach all of these with the service-role key from the server, so nothing they do changes.
-- The only browser-side calls are scan_jobs reads (RLS), queue_position and ig_pool_ready_at, which stay.

-- profiles: users may edit only their own pitch voice and signatures (what /settings writes)
revoke insert, update on public.profiles from anon, authenticated;
grant update (pitch_prompt, signature, email_signature) on public.profiles to authenticated;

-- server-only functions
do $$
declare f text;
begin
  foreach f in array array[
    'grant_credits(uuid, text, integer, text)',
    'spend_credit(uuid, text, text, text)',
    'refill_plan_credits(uuid, text)',
    'apply_referral(uuid, text)',
    'claim_scan_jobs(integer, text)',
    'requeue_stuck_jobs()',
    'refresh_brand_wall()',
    'seed_house_roster(uuid)',
    'seed_house_roster_trigger()',
    'attach_house_org()',
    'handle_new_user()',
    'log_signup()',
    'prune_pageviews()',
    'hood_remaining(uuid)',
    'category_counts()',
    'lane_top_posts(uuid[], integer, integer)',
    'lane_top_posts(uuid[], integer, integer, boolean)'
  ] loop
    begin
      execute format('revoke execute on function public.%s from public, anon, authenticated', f);
      execute format('grant execute on function public.%s to service_role', f);
    exception when undefined_function then raise notice 'skip %', f;
    end;
  end loop;
end $$;

-- house-only data
revoke all on public.brand_wall_mv from anon, authenticated;
revoke all on public.brand_wall from anon, authenticated;
revoke all on public.creators_slim from anon, authenticated;
grant select on public.brand_wall_mv, public.brand_wall, public.creators_slim to service_role;
