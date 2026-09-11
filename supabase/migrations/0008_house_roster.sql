-- Preload the Rootfor roster for every house-org user (existing and future),
-- so a teammate signing in with @rootforgroup.com can pitch immediately.
-- Adds any roster creator the user doesn't already have (matched by handle);
-- never overwrites an existing row.

create or replace function seed_house_roster(uid uuid) returns int language plpgsql security definer as $$
declare h uuid; n int := 0;
begin
  select id into h from orgs where is_house limit 1;
  if h is null then return 0; end if;
  insert into roster_creators (user_id, org_id, name, handle, platform, followers, niche, pitch_angle)
  select uid, h, v.name, v.handle, v.platform, v.followers, v.niche, v.pitch_angle from (values
    ('Andy Yen', 'andyyyen', 'instagram', 202000, 'lifestyle / design, LA loft',
      'Concept-first. Turns his LA loft into content with product placed inside the story; highest-performing video is the open-loft-to-guest-room conversion (1.8M views, products linked in ShopMy). Recurring formats: his cats Juji and Shuko, linen curtain build, moon jar ceramics. Recent partners: adidas, IKEA, Logitech, Fancy Feast. Do not cite Airbnb.'),
    ('Ainsley Bo', 'okay.ainsley', 'instagram', 127000, 'fashion / beauty / dance, Toronto and NYC',
      'Fashion and beauty creator pursuing professional dance (grew up in her mom''s dance studio). Based in Toronto and NYC. Partners: La Roche-Posay Cicaplast, Pacsun, Knix; Aerie Realmakers member. Open with "Hope all is well" and introduce @okay.ainsley to their influencer marketing team.'),
    ('Angela Cenedella', 'thelawyerangela', 'multi', 760000, 'legal / business, NBC News legal analyst',
      '1.9M on TikTok, 760K on Instagram. Manhattan-based lawyer and NBC News legal analyst who explains business, contracts and consumer law. Partners: Clio, FreshBooks, Quo (OpenPhone), Claude, Notion, Adobe, Surfshark, Rent the Runway. NBC role limits news-outlet collabs and sensitive topics.'),
    ('BrianGoesLive', 'briangoeslive', 'instagram', 104000, 'gaming / PC builds',
      'Went 0 to 125K followers in 30 days with a serialized PC build where the budget grows with follower count. Audience 90% men, 69% aged 18-34, US-led. Paid partners: Blacklyte, Secretlab; OBSBOT collab. Priority lane: gaming-adjacent consumables and software (energy drinks, snacks, VPNs, game stores, creator software).'),
    ('CafeAndy', 'cafeandy_', 'instagram', 245000, 'coffee / personal finance docuseries',
      'Grew 0 to 200K in 60 days on serialized content. Current flagship series "Working to save my parents $100K", a numbered personal-finance docuseries filmed while working construction out of a van. Also a "joymaxxing" series. Partners: Govee, AeroPress, Moccamaster. Wants few high-value deals above $3K.'),
    ('Cafe by Chris', 'cafebychris', 'instagram', 36000, 'coffee / home barista, bilingual EN and ES',
      'Chris Calcano, Puerto Rican home-barista creator in Maryland teaching espresso tips and latte art in English and Spanish across IG, TikTok and YouTube. Partners: AeroPress (paid retainer), Mahlkönig, Gemilai, Pure Over, OutIn. Building a ceramics shelf, so cups and ceramics brands fit.'),
    ('Chelsea', 'the.lead.lady', 'instagram', 319000, 'lead-safety educator, kids and home',
      'Lead-safety educator for parents. Goal is 1-2 partnerships a month, trust over rate. Lumetallix is the only test product she promotes (never pitch swab kits). Retainer with Olive/Giga Studios; Branch Basics gifting. Lanes: kids and baby, kitchenware, water filtration, home goods, home cleaning and air quality.'),
    ('Jimmy', 'jimmyeverydayy', 'instagram', 366000, 'new-dad lifestyle, family finance, Denver filmmaker',
      'Denver filmmaker and dad of two (toddler and newborn). Day-in-the-life content plus a family finance and budgeting pillar as a "learner not a guru". Wants service-based lifestyle brands that fit the family routine, not one-off product ads. Proof partners: Kroger (via Dentsu), Mazda, Dove Baby (via Collectively), Amica for finance/insurance. Keep kids'' faces minimal; he is the talent.'),
    ('Lizzie Bowker', 'lizziebowker', 'instagram', null, 'beauty / skincare, Toronto',
      'Beauty and skincare creator based in Toronto. Partners: Youth To The People (signed), Hello Klean (first Canadian deal), Typology Paris, L''Oréal (in progress), Palmer''s inbound. Gifting is an acceptable starting point with brands she loves.'),
    ('Mariana', 'mariianarangel', 'instagram', 23500, 'NYC lifestyle, running, NYU grad student',
      'Full-time research job plus NYU master''s at night, Barry''s and running, then a Guinness with friends. Partners: Runna (code in bio), Starbucks (3-month exclusivity on coffee, coffee QSRs and RTD protein through late 2026), Cometeer, Bertolli. Does not drink carbonated water.'),
    ('Tiana Michele', 'bytianamichele', 'instagram', 65700, 'NYC photographer and director, apartment reno, fashion',
      'NYC photographer and director; apartment renovation, outfits, NY Bridal Fashion Week (on a second account), workshops. Partners: Adobe (multi-wave), Canon EOS R6 Mark III, Nuuly ($7K paid), Brooklinen ambassador, Peerspace. Conflicts: rival camera bodies, rival creative suites, competing bedding.'),
    ('Trey Drechsel', 'treydrechsel5', 'youtube', null, 'pro basketball, Mexico City',
      'Pro basketball player based in Mexico City, competition and daily-life content on YouTube (@treydrechsel5) and Instagram (@treydrechsel). Paid partners: BenQ, Factor; Hyperice gifted. No gambling or sportsbook brands while under contract. Pitch YouTube-first to lifestyle brands already spending on YouTube.'),
    ('UFD Tech', 'UFDTech', 'youtube', 1500000, 'tech / PC hardware reviews',
      'Brett Stelmaszek, ~1.5M YouTube subscribers, PC hardware and tech reviews. Audience skews male 25-34, US 31%. Dedicated integrations; 3-month embed usage, no exclusivity except Helix (bedding). Long list of recurring sponsors already under contract; check the exclusion list before pitching hardware brands.'),
    ('Vic Romero', 'vicccromero', 'tiktok', 12900, 'NYC mental health, thrift fashion, small-space living',
      'TikTok-first (12.9K followers, 2.4M likes), ~90% women 18-34, NYC. Signature content: Solo Dates series, mental health talks, thrift hauls, "worth the money" recs. Moving into a new NYC apartment Oct 2026 and adopting a cat, so home, decor and pet brands fit. Partners: Luna Bronze, Pair Eyewear, Torras, Interscope Records. Budget-friendly, $500-2K per Reel.'),
    ('YooJin', 'yoojinslife', 'instagram', 165000, 'NYC lifestyle, cat content, K-beauty and Korean pantry',
      'NYC lifestyle and cat creator: 165K Instagram, 170K TikTok (@yoojinjeong), 55K YouTube. Strong fit for K-beauty, Korean food and grocery, cat gear, camera accessories, K-fashion. Use roster-level agency proof (Adobe via Golin, Dove via Collectively, Kroger via Dentsu); do not cite Starface until closed.')
  ) as v(name, handle, platform, followers, niche, pitch_angle)
  where not exists (select 1 from roster_creators r where r.user_id = uid and lower(coalesce(r.handle,'')) = lower(v.handle));
  get diagnostics n = row_count;
  return n;
end $$;

-- future house sign-ins
create or replace function seed_house_roster_trigger() returns trigger language plpgsql security definer as $$
begin
  if new.org_id is not null and exists (select 1 from orgs where id = new.org_id and is_house) then
    perform seed_house_roster(new.id);
  end if;
  return new;
end $$;
drop trigger if exists profiles_seed_house_roster on profiles;
create trigger profiles_seed_house_roster after insert on profiles for each row execute function seed_house_roster_trigger();

-- existing house users
select p.email, seed_house_roster(p.id) as seeded
from profiles p join orgs o on o.id = p.org_id where o.is_house;
