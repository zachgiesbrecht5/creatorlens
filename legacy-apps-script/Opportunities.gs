/**
 * =========================================================
 * ROOTFOR - Opportunities (v1.0)
 * =========================================================
 * One decision-ready view answering: "which brands should we
 * pitch this week, for which route, with what evidence?"
 * Reads every existing tab (YT + IG Raw tabs, Brand Collabs,
 * IG Brand Partnerships, Rebook Radar) - creates nothing new
 * at the source, mutates nothing except the Opportunities tab.
 * Cross-checks the team outreach tracker so nobody pitches a
 * brand someone contacted in the last 90 days.
 * The "Status / Notes" column is YOURS - it survives rebuilds.
 * =========================================================
 */

var OPP = {
  tabName: "Opportunities",
  trackerId: "16zwA7EvNqDQPo5XAoh-nRgsiHqSmdJm_7poES-rxuOg",
  waveDays: 21,        // deals inside this window can indicate an active campaign wave
  recentDays: 60,      // "recent" cutoff for sorting
  pitchedWindowDays: 90,
  maxEvidence: 2
};

function buildOpportunities() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (eUi) {}  // editor/trigger-safe
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var now = Date.now();

  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function dMs(v) {
    if (v instanceof Date) return v.getTime();
    var t = Date.parse(String(v));
    return isFinite(t) ? t : NaN;
  }

  // ---- 1. Collect events from every source tab
  var brands = {};   // norm -> aggregate
  function ev(name, platform, creator, whenMs, url, conf, category) {
    if (!name || name.charAt(0) === "(") return;   // unknown-brand rows stay out
    var k = norm(name);
    if (!k) return;
    var b = brands[k];
    if (!b) b = brands[k] = { name: String(name), platforms: {}, posts: 0,
      creators: {}, lastMs: 0, cats: {}, evidence: [], high: 0 };
    b.platforms[platform] = 1;
    b.posts++;
    if (creator) b.creators[String(creator).toLowerCase()] = String(creator);
    if (isFinite(whenMs) && whenMs > b.lastMs) b.lastMs = whenMs;
    if (category) b.cats[String(category)] = 1;
    if (url) b.evidence.push({ ms: isFinite(whenMs) ? whenMs : 0, url: String(url) });
    if (/^(high|verified)/i.test(String(conf || ""))) b.high++;
    if (isFinite(whenMs)) {
      b.recent = b.recent || [];
      if (now - whenMs <= OPP.waveDays * 86400000) b.recent.push(String(creator || url || b.posts));
    }
  }

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i], nm = sh.getName();
    var isRaw = / - Raw$/.test(nm);
    var isCollab = (nm === "Brand Collabs");
    var isBrandTab = (nm === "IG Brand Partnerships");
    if ((!isRaw && !isCollab && !isBrandTab) || sh.getLastRow() < 2) continue;
    var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var hdr = vals[0].map(String);
    var bCol = hdr.indexOf("Brand");
    if (bCol < 0) continue;
    var confCol = hdr.indexOf("Confidence");
    var urlCol = hdr.indexOf("Video URL"); if (urlCol < 0) urlCol = hdr.indexOf("Post URL");
    var pubCol = hdr.indexOf("Published"); if (pubCol < 0) pubCol = hdr.indexOf("Posted");
    var catCol = hdr.indexOf("Category");
    var creCol = hdr.indexOf("Creator");
    var platform, creatorFixed = "";
    if (isRaw) {
      platform = / IG - Raw$/.test(nm) ? "IG" : (/ TT - Raw$/.test(nm) ? "TT" : "YT");
      creatorFixed = nm.replace(/ IG - Raw$/, "").replace(/ TT - Raw$/, "").replace(/ - Raw$/, "");
    } else { platform = "IG"; }
    for (var r = 1; r < vals.length; r++) {
      var creator = creatorFixed || (creCol >= 0 ? String(vals[r][creCol]).replace(/^@/, "") : "");
      ev(vals[r][bCol], platform, creator,
        pubCol >= 0 ? dMs(vals[r][pubCol]) : NaN,
        urlCol >= 0 ? vals[r][urlCol] : "",
        confCol >= 0 ? vals[r][confCol] : "",
        catCol >= 0 ? vals[r][catCol] : "");
    }
  }

  // ---- 2. Rebookers (proven recurring budget)
  var rebook = {};
  var rr = ss.getSheetByName("Rebook Radar");
  if (rr && rr.getLastRow() >= 2) {
    var rv = rr.getRange(1, 1, rr.getLastRow(), rr.getLastColumn()).getValues();
    var rb = rv[0].map(String).indexOf("Brand");
    if (rb >= 0) for (var q = 1; q < rv.length; q++) rebook[norm(rv[q][rb])] = 1;
  }

  // ---- 3. Outreach tracker cross-check (best effort - never blocks the build)
  var pitched = {};   // norm -> {ms, by, n, replies, lastStatus}
  var excluded = {};  // norm -> 1 (tracker EXCLUSIONS tab)
  try {
    var tr = SpreadsheetApp.openById(OPP.trackerId);
    // 3a. Outreach Log: brand lives in the UNNAMED first column
    var lg = tr.getSheetByName("Outreach Log");
    if (lg && lg.getLastRow() >= 2) {
      var lv = lg.getRange(1, 1, lg.getLastRow(), Math.min(lg.getLastColumn(), 13)).getValues();
      var lh = lv[0].map(String);
      var cD = lh.indexOf("Date Sent"); if (cD < 0) cD = 1;
      var cBy = lh.indexOf("Sent By"); if (cBy < 0) cBy = 2;
      var cSt = lh.indexOf("Status");
      var cRp = lh.indexOf("Response Date");
      for (var lx = 1; lx < lv.length; lx++) {
        var lbn = norm(String(lv[lx][0]).replace(/\s*\(agency\)\s*$/i, ""));
        if (!lbn) continue;
        var lwhen = dMs(lv[lx][cD]);
        var lst = cSt >= 0 ? String(lv[lx][cSt] || "") : "";
        var lrep = (cRp >= 0 && String(lv[lx][cRp] || "").trim() !== "") || /repl|response|clos|won|deal|signed|negoti/i.test(lst);
        var lp = pitched[lbn];
        if (!lp) lp = pitched[lbn] = { ms: 0, by: "", n: 0, replies: 0, lastStatus: "" };
        lp.n++;
        if (lrep) lp.replies++;
        if (isFinite(lwhen) && lwhen > lp.ms) { lp.ms = lwhen; lp.by = String(lv[lx][cBy] || ""); lp.lastStatus = lst; }
      }
    }
    // 3b. EXCLUSIONS tab = do-not-pitch list
    var exsh = tr.getSheetByName("EXCLUSIONS");
    if (exsh && exsh.getLastRow() >= 2) {
      var xv = exsh.getRange(2, 1, exsh.getLastRow() - 1, 4).getValues();
      for (var xy = 0; xy < xv.length; xy++) {
        var xk = norm(xv[xy][0] || xv[xy][1]);
        if (xk && /exclude/i.test(String(xv[xy][3] || "EXCLUDE"))) excluded[xk] = 1;
      }
    }
    // 3c. legacy: any other tab with an explicit Brand column
    var tsheets = tr.getSheets();
    for (var t = 0; t < tsheets.length; t++) {
      var tsh = tsheets[t];
      var tnm = tsh.getName();
      if (tnm === "Outreach Log" || tnm === "EXCLUSIONS" || /exclusion|exlusion/i.test(tnm)) continue;
      if (tsh.getLastRow() < 2) continue;
      var tv = tsh.getRange(1, 1, Math.min(tsh.getLastRow(), 2000), Math.min(tsh.getLastColumn(), 10)).getValues();
      var th = tv[0].map(String);
      var tb = th.indexOf("Brand"), td = -1, tby = -1;
      for (var h = 0; h < th.length; h++) {
        if (td < 0 && /date/i.test(th[h])) td = h;
        if (tby < 0 && /sent by|sender|by/i.test(th[h])) tby = h;
      }
      if (tb < 0) continue;
      for (var x = 1; x < tv.length; x++) {
        var bn = norm(String(tv[x][tb]).replace(/\s*\(agency\)\s*$/i, ""));
        if (!bn) continue;
        var when = td >= 0 ? dMs(tv[x][td]) : NaN;
        var gp = pitched[bn];
        if (!gp) gp = pitched[bn] = { ms: 0, by: "", n: 0, replies: 0, lastStatus: "" };
        gp.n++;
        if (isFinite(when) && when > gp.ms) { gp.ms = when; gp.by = tby >= 0 ? String(tv[x][tby]) : ""; }
      }
    }
  } catch (eTr) { /* tracker unreachable - column will say so */ }

  // ---- 4. Preserve the user's Status / Notes across rebuilds
  var notes = {};
  var old = ss.getSheetByName(OPP.tabName);
  if (old && old.getLastRow() >= 2) {
    var ov = old.getRange(1, 1, old.getLastRow(), old.getLastColumn()).getValues();
    var oh = ov[0].map(String);
    var ob = oh.indexOf("Brand"), on = oh.indexOf("Status / Notes");
    if (ob >= 0 && on >= 0) for (var o = 1; o < ov.length; o++) {
      if (String(ov[o][on]).trim()) notes[norm(ov[o][ob])] = ov[o][on];
    }
  }

  // ---- 5. Score, sort, and write
  var rows = [];
  for (var k2 in brands) {
    var b2 = brands[k2];
    var uniq = Object.keys(b2.creators).length;
    var recentCreators = {};
    (b2.recent || []).forEach(function (c) { recentCreators[c] = 1; });
    var wave = (b2.recent || []).length >= 3 || Object.keys(recentCreators).length >= 2;
    var ageDays = b2.lastMs ? Math.round((now - b2.lastMs) / 86400000) : null;
    var timing = wave ? ("ACTIVE WAVE - " + (b2.recent || []).length + " deals in " + OPP.waveDays + "d")
      : (ageDays == null ? "" : (ageDays <= OPP.recentDays ? "Recent (" + ageDays + "d ago)" : "Older (" + ageDays + "d ago)"));
    var isRebooker = !!rebook[k2];
    var p = pitched[k2];
    var pitchedTxt = "";
    if (excluded[k2]) {
        pitchedTxt = "EXCLUDED - do not pitch";
      } else if (p && p.ms && (now - p.ms) <= OPP.pitchedWindowDays * 86400000) {
      pitchedTxt = "PITCHED " + new Date(p.ms).toISOString().slice(0, 10) + (p.by ? " by " + p.by : "") + " - skip" + (p.replies ? " (has replied before!)" : "");
    } else if (p && p.n) {
        pitchedTxt = "Clear - pitched " + p.n + "x before, " + (p.replies ? p.replies + " repl" + (p.replies == 1 ? "y" : "ies") : "no reply") + (p.ms ? ", last " + new Date(p.ms).toISOString().slice(0, 10) : "");
      } else { pitchedTxt = "Clear"; }
    var route = isRebooker
      ? "Direct brand - proven rebooker (/brand-outreach)"
      : (wave ? "Agency likely casting - pitch NEXT wave (/agency-outreach)"
              : "Brand or agency - check who casts (/agency-outreach rung 5)");
    b2.evidence.sort(function (a, z) { return z.ms - a.ms; });
    var links = [];
    for (var e2 = 0; e2 < Math.min(OPP.maxEvidence, b2.evidence.length); e2++) links.push(b2.evidence[e2].url);
    var creatorNames = [];
    for (var cn in b2.creators) { creatorNames.push(b2.creators[cn]); if (creatorNames.length >= 6) break; }
    rows.push({
      sort: (wave ? 2 : 0) + (isRebooker ? 1 : 0),
      lastMs: b2.lastMs,
      uniq: uniq,
      row: [b2.name, Object.keys(b2.platforms).join("+"), b2.posts, uniq,
        creatorNames.join(", "), b2.lastMs ? new Date(b2.lastMs).toISOString().slice(0, 10) : "",
        timing, Object.keys(b2.cats).join(", "), pitchedTxt, route,
        links.join(String.fromCharCode(10)), notes[k2] || ""]
    });
  }
  rows.sort(function (a, z) {
    if (z.sort !== a.sort) return z.sort - a.sort;
    if (z.lastMs !== a.lastMs) return z.lastMs - a.lastMs;
    return z.uniq - a.uniq;
  });

  var HEAD = ["Brand", "Platforms", "Deals", "Unique creators", "Creators seen", "Last deal",
    "Timing", "Categories", "Outreach check", "Suggested route", "Evidence", "Status / Notes"];
  var sheet = old || ss.insertSheet(OPP.tabName, 0);
  sheet.clear();
  sheet.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  if (rows.length) {
    var data = rows.map(function (r3) { return r3.row; });
    var rng = sheet.getRange(2, 1, data.length, HEAD.length);
    rng.setNumberFormat("@");
    rng.setValues(data);
    sheet.getRange(2, 3, data.length, 2).setNumberFormat("0");
  }
  try {
    sheet.autoResizeColumns(1, 4);
    sheet.setColumnWidth(11, 320);
  } catch (eFmt) {}

  var doneMsg =
    rows.length + " brand(s) ranked.\n\n" +
    "Sort logic: active campaign waves and proven rebookers first, then most recent deals.\n" +
    "\"Outreach check\" flags anything the team pitched in the last " + OPP.pitchedWindowDays + " days.\n" +
    "Your \"Status / Notes\" column is preserved every rebuild.";
  if (ui) { ui.alert("Opportunities built", doneMsg, ui.ButtonSet.OK); }
  else { Logger.log("Opportunities built: " + rows.length + " brands"); }
  return rows.length + " brands";
}

// ---------------------------------------------------------- Scan list yield sort

/** Sort the IG Scan List so the highest-yield creators (most brand findings)
 * sit at the top, then errors, then anything not yet scanned. Makes it obvious
 * who is worth rescanning and who to prune. */
function igSortScanListByYield() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sh = ss.getSheetByName(IG.scanListTab);
  if (!sh || sh.getLastRow() < 3) { ui.alert("Nothing to sort yet."); return; }
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, 3);
  var rows = rng.getValues();
  var tagged = rows.map(function (r, i) {
    var st = String(r[2] || "");
    var mF = st.match(/^OK - (\d+) finding/);
    var group = mF ? 0 : (/^ERROR|^RATE/.test(st) ? 1 : 2);
    return { group: group, yield: mF ? parseInt(mF[1], 10) : -1, i: i, row: r };
  });
  tagged.sort(function (a, b) {
    if (a.group !== b.group) return a.group - b.group;
    if (b.yield !== a.yield) return b.yield - a.yield;
    return a.i - b.i;
  });
  rng.setValues(tagged.map(function (t) { return t.row; }));
  var top = tagged.length && tagged[0].yield > 0 ? String(tagged[0].row[0]) + " (" + tagged[0].yield + " findings)" : "n/a";
  ui.alert("Scan list sorted by yield",
    "Highest-yield creators are now at the top (best source of brand intel), " +
    "then errors, then unscanned.\n\nTop creator: " + top, ui.ButtonSet.OK);
}

// ---------------------------------------------------------- Team guide

/** Writes / refreshes a plain-language Guide tab so anyone on the team can
 * drive the system without asking Zach. Safe to re-run any time. */
function buildGuideTab() {
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var name = "Guide";
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  var L = [
    ["ROOTFOR CREATOR OUTREACH ENGINE - TEAM GUIDE", ""],
    ["", ""],
    ["THE WEEKLY WORKFLOW", ""],
    ["1", "IG Scanner > Build Opportunities. This refreshes the Opportunities tab: every brand we have evidence on, ranked. Active campaign waves and proven rebookers float to the top."],
    ["2", "Work the Opportunities tab top-down. 'Outreach check' says Clear or PITCHED - never pitch a PITCHED brand. 'Suggested route' says whether to go direct to the brand or hunt the casting agency."],
    ["3", "In Cowork, say: 'run brand-outreach for <creator>' or 'run agency-outreach' - both skills read this sheet automatically and start from the strongest evidence."],
    ["4", "Write your own notes in 'Status / Notes' on the Opportunities tab. That column survives every rebuild."],
    ["", ""],
    ["FINDING NEW CREATORS AND BRANDS", ""],
    ["Scan IG creator", "Scan one Instagram creator's last 100 posts for brand deals. Asks for handle + category. Writes a '<name> IG - Raw' tab (hidden by default - More tools > Open a hidden tab to look at it)."],
    ["Scan IG batch list", "Scans everyone on the 'IG Scan List' tab, up to 40 per run (Meta's hourly limit). Safe to re-run - finished rows are skipped."],
    ["Auto-scan remaining hourly", "Same as above but runs itself once an hour in the background and switches off when the list is done."],
    ["Harvest IG + TikTok handles from YouTube", "Pulls creator Instagram/TikTok handles out of the YouTube channels we already scan and adds new ones to the IG Scan List. Free."],
    ["Sort scan list by yield", "Reorders the IG Scan List so creators whose scans found the most brand deals are on top."],
    ["Scan brand account (find creators)", "Reads a BRAND's own Instagram feed and lists every creator they tagged (collab posts included). Writes the 'Brand Collabs' tab. This catches deals creator scans cannot see."],
    ["Brand search (IG)", "'Who did <brand> partner with in the last 60 days?' Asks for optional follower/engagement filters like 100k-1m, 2%. Writes 'IG Brand Partnerships'. Costs ~2 weekly hashtag credits."],
    ["IG Rebook Radar (repeat partners)", "One click, no API calls: rolls up every brand x creator pair across all Instagram data. Creators a brand booked 2+ times, 30+ days apart, are flagged REPEAT PARTNER - the brand keeps paying them, so the posts are working. The best proof a brand has real creator budget."],
    ["Log TikTok deal", "TikTok has no scanning API, so when anyone spots a TikTok sponsorship, log it in one line (creator | brand | link | type | date). It flows into Opportunities and the Creator Index like any scanned deal."],
    ["Find UGC creators (bio scan)", "For nano/micro UGC casting ($100-250 per post): checks bios of every creator the engine has found via the official API, flags UGC creators + city matches (default NYC/LA) and pulls booking emails from bios into the UGC Finder tab. Resumable - run repeatedly. Fuel it by scanning brand accounts of UGC-heavy brands first."],
    ["Start snowball auto-pilot", "The whole loop on autopilot, hourly: new creators found by your brand searches get queued and scanned automatically. You just search brands; the database and Rebook Radar grow by themselves. Stop under More tools."],
    ["Queue discovered creators (snowball)", "Every creator your brand scans and searches surfaced gets queued for scanning (optional size filter like 10k-500k). Their scans reveal which OTHER brands book them repeatedly, so the Rebook Radar keeps growing past what you already searched."],
    ["Simple view (core tabs only)", "Keeps only Guide, Opportunities, Rebook Radar, IG Rebook Radar and Creator Index visible and hides every other tab - working tabs, raw per-creator scan tabs, logs. Deletes nothing; every scan, rollup and Cowork skill keeps working on hidden tabs. New raw scan tabs are hidden automatically. Bring things back with More tools > Show working tabs, Show raw tabs, or Open a hidden tab (or View > Hidden sheets)."],
    ["Content Radar (what is working)", "Pick any channel. Ranks their recent uploads by how each performed against THEIR OWN median (2.0x = double their normal), shows the thumbnails right in the sheet, and pulls out which title patterns, publish days and video lengths actually lift them. Also marks which videos were sponsored, using your own scan data. Costs no search quota - run it freely on roster creators and on anyone before you pitch them."],
    ["Category Radar (niche research)", "Type a niche (e.g. electrolyte hydration). Returns the best-performing long-form videos in that category from the last 90 days, normalized by channel size so small-channel breakouts surface, plus the title formulas winning in that space. Use it to build creative briefs. Costs 2 search calls."],
    ["YouTube Scanner menu", "Same ideas for YouTube: channel scans, brand search, Rebook Radar (brands that rebook = proven budget), Gap Analysis, and the client Pipeline builder."],
    ["", ""],
    ["LIMITS TO KNOW (so errors do not surprise you)", ""],
    ["Meta hourly limit", "Instagram allows roughly 200 lookups/hour. If you see RATE LIMITED, nothing is lost - wait an hour and re-run; it resumes."],
    ["Hashtag credits", "Instagram allows 30 unique hashtags per rolling 7 days. 'IG hashtag budget' shows usage. Brand searches use ~2 each."],
    ["Hidden creators", "Meta hides usernames on hashtag results. Rows with no creator have a post link - open it to see who posted."],
    ["Invisible collabs", "A brand-authored collab post never shows in the creator's API feed. That is what 'Scan brand account' exists for."],
    ["Unknown brands", "'(unknown - check post)' means paid language was found but the brand could not be parsed - open the link and judge."],
    ["", ""],
    ["GOLDEN RULES", ""],
    ["-", "Drafts only. Nothing in this system ever sends an email."],
    ["-", "Check 'Outreach check' (or the team tracker) before any pitch - 90-day no-double-pitch rule."],
    ["-", "Log every draft batch into the team outreach tracker so Karli, Victoria and Tristan's dedup can see it."],
    ["", ""],
    ["Questions or something looks broken?", "Tell Zach, or tell Cowork exactly what you clicked and what you saw - screenshots help."]
  ];
  sh.getRange(1, 1, L.length, 2).setValues(L);
  sh.getRange(1, 1).setFontWeight("bold").setFontSize(12);
  [3, 9, 19, 26].forEach(function (r) { sh.getRange(r, 1, 1, 2).setFontWeight("bold"); });
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(2, 900);
  sh.getRange(1, 1, L.length, 2).setWrap(true);
  return "guide written";
}

function buildGuideTabMenu() {
  buildGuideTab();
  SpreadsheetApp.getUi().alert("Guide tab created/refreshed. Share the sheet and point new teammates at it.");
}

// ---------------------------------------------------------- Creator Index

/** One row per scanned creator - the matching surface for "find the right
 * creators for this campaign" work. Aggregates every Raw tab plus follower/
 * engagement data wherever an enrichment captured it. Safe to re-run. */
function buildCreatorIndex() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (eUi) {}
  var ss = SpreadsheetApp.openById(getConfig().sheetId);

  function dMs(vv) {
    if (vv instanceof Date) return vv.getTime();
    var t = Date.parse(String(vv));
    return isFinite(t) ? t : NaN;
  }

  // followers / engagement wherever we captured them
  var enrich = {};
  ["IG Brand Partnerships", "Brand Collabs"].forEach(function (nm) {
    var sh = ss.getSheetByName(nm);
    if (!sh || sh.getLastRow() < 2) return;
    var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var hdr = vals[0].map(String);
    var cCol = hdr.indexOf("Creator"), fCol = hdr.indexOf("Followers"), eCol = hdr.indexOf("Eng %");
    if (cCol < 0) return;
    for (var r = 1; r < vals.length; r++) {
      var cr = String(vals[r][cCol]).replace(/^@/, "").toLowerCase().trim();
      if (!cr) continue;
      var f = vals[r][fCol], e = vals[r][eCol];
      if (f !== "" && f != null && !enrich[cr]) enrich[cr] = { f: f, e: e };
    }
  });

  var creators = {};
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh2 = sheets[i], nm2 = sh2.getName();
    if (!/ - Raw$/.test(nm2) || sh2.getLastRow() < 2) continue;
    var isIg = / IG - Raw$/.test(nm2);
    var isTt = / TT - Raw$/.test(nm2);
    var name = nm2.replace(/ IG - Raw$/, "").replace(/ TT - Raw$/, "").replace(/ - Raw$/, "");
    var key = name.toLowerCase();
    var c = creators[key];
    if (!c) c = creators[key] = { name: name, platforms: {}, deals: 0, high: 0,
      brands: {}, cats: {}, lastMs: 0, ig: isIg };
    if (isIg) c.ig = true;
    c.platforms[isIg ? "IG" : (isTt ? "TT" : "YT")] = 1;
    var vals2 = sh2.getRange(1, 1, sh2.getLastRow(), sh2.getLastColumn()).getValues();
    var hdr2 = vals2[0].map(String);
    var bCol = hdr2.indexOf("Brand"), confCol = hdr2.indexOf("Confidence"),
        pubCol = hdr2.indexOf("Published"), catCol = hdr2.indexOf("Category");
    if (bCol < 0) continue;
    for (var r2 = 1; r2 < vals2.length; r2++) {
      var b = String(vals2[r2][bCol]).trim();
      if (!b || b.charAt(0) === "(") continue;
      c.deals++;
      c.brands[b.replace(/ \(\?\)$/, "")] = 1;
      if (confCol >= 0 && /^(high|verified)/i.test(String(vals2[r2][confCol]))) c.high++;
      if (catCol >= 0 && String(vals2[r2][catCol])) c.cats[String(vals2[r2][catCol])] = 1;
      var ms = pubCol >= 0 ? dMs(vals2[r2][pubCol]) : NaN;
      if (isFinite(ms) && ms > c.lastMs) c.lastMs = ms;
    }
  }

  var rows = [];
  for (var k in creators) {
    var cc = creators[k];
    var bl = Object.keys(cc.brands);
    var en = enrich[k];
    rows.push({
      uniq: bl.length,
      row: [cc.name, Object.keys(cc.platforms).join("+"),
        Object.keys(cc.cats).join(", "), cc.deals, cc.high, bl.length,
        bl.slice(0, 10).join(", "),
        cc.lastMs ? new Date(cc.lastMs).toISOString().slice(0, 10) : "",
        en ? en.f : "", en ? en.e : "",
        cc.ig ? "https://www.instagram.com/" + cc.name + "/" : ""]
    });
  }
  rows.sort(function (a, b) { return b.uniq - a.uniq; });

  var HEAD = ["Creator", "Platforms", "Categories", "Deals", "High-conf",
    "Unique brands", "Brands worked with (top 10)", "Last deal",
    "Followers", "Eng %", "Profile"];
  var out = ss.getSheetByName("Creator Index") || ss.insertSheet("Creator Index", 2);
  out.clear();
  out.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
  out.setFrozenRows(1);
  if (rows.length) {
    var data = rows.map(function (r3) { return r3.row; });
    var rng = out.getRange(2, 1, data.length, HEAD.length);
    rng.setNumberFormat("@");
    rng.setValues(data);
    out.getRange(2, 4, data.length, 3).setNumberFormat("0");
  }
  var msg = rows.length + " creator(s) indexed. This tab is the matching surface: ask Cowork " +
    "to find creators for a brand or campaign and it ranks from here with evidence.";
  if (ui) ui.alert("Creator Index built", msg, ui.ButtonSet.OK);
  else Logger.log(msg);
  return rows.length + " creators";
}

// ---------------------------------------------------------- TikTok deals lane

/** TikTok has no open API for scanning third-party creators (verified Aug 2026:
 * Research API is academic-only, Display API is own-account-only, Creator
 * Marketplace API is gated to TikTok Marketing Partners). So TikTok evidence is
 * HUMAN-logged: the team sees a sponsored TikTok, logs it in 15 seconds, and it
 * flows into Opportunities / Creator Index / creator matching like any scan. */
function igLogTikTokDeal() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt("Log TikTok deal",
    "One line, pipe-separated:\n\n" +
    "creator | brand | post URL | type | date\n\n" +
    "Only creator and brand are required. Type defaults to Paid\n" +
    "(use Gifted/Affiliate/Ambassador when it applies), date defaults to today.\n\n" +
    "Example:  khaby.lame | Hugo Boss | https://tiktok.com/... | Paid | 2026-08-01",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var parts = resp.getResponseText().split("|").map(function (s) { return s.trim(); });
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    ui.alert("Need at least: creator | brand");
    return;
  }
  var res = igLogTikTokDealCore_(parts[0], parts[1], parts[2] || "", parts[3] || "Paid", parts[4] || "");
  ui.alert("TikTok deal logged",
    res + "\n\nIt now counts in Opportunities, the Creator Index and creator matching " +
    "(rebuild those from the menu when you want it reflected).", ui.ButtonSet.OK);
}

function igLogTikTokDealCore_(creator, brand, url, dealType, dateStr) {
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var handle = String(creator).replace(/^@/, "").trim();
  var tabName = sanitizeTabName(handle) + " TT - Raw";
  var sh = ss.getSheetByName(tabName);
  if (!sh) {
    sh = ss.insertSheet(tabName);
    try { sh.hideSheet(); } catch (eh) {} // raw tabs stay hidden (Simple view)
    sh.getRange(1, 1, 1, 12).setValues([[
      "Date Scanned", "Brand", "Confidence", "Score", "Video Title", "Video URL",
      "Published", "Views", "Signal Type", "Evidence", "Mass Spons", "Category"
    ]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  var today = new Date().toISOString().slice(0, 10);
  var pub = dateStr && isFinite(Date.parse(dateStr)) ? new Date(Date.parse(dateStr)).toISOString().slice(0, 10) : today;
  var t = String(dealType || "Paid");
  t = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  sh.appendRow([today, String(brand).trim(), "High", 8, "TikTok post (team-logged)",
    String(url).trim(), pub, "", "Manual - " + t, "Logged by team, seen on TikTok", "", "Other"]);
  return "@" + handle + " x " + String(brand).trim() + " (" + t + ", " + pub + ") -> \"" + tabName + "\"";
}


// ------------------------------------------------------------------ Tidy sheet

/** Simple view: only the CORE tabs stay visible, in a fixed order and colour.
 * Everything else - working tabs (feeds/inputs/logs) and the raw per-creator
 * scan tabs - is HIDDEN, never deleted. Every scan, rollup and Cowork skill
 * still reads and writes hidden tabs exactly as before. Reversible any time:
 * showWorkingTabs() brings the working tabs back, showRawTabs() the raw tabs,
 * openHiddenTab() opens one tab by name. */
var TIDY = {
  core: ["Guide", "Opportunities", "Rebook Radar", "IG Rebook Radar", "Creator Index"],
  working: ["Brand Leaderboard", "Brand Partnerships", "IG Brand Partnerships",
    "Brand Collabs", "Ad Radar", "UGC Finder", "IG Scan List", "YT Scan List",
    "TikTok Handles", "Tracked Brands", "Creator Discovery", "Scan Registry",
    "Sales Nav Queue", "Follow-Up Log", "Worked With"],
  colors: {
    "Guide": "#34a853", "Opportunities": "#34a853", "Creator Index": "#34a853",
    "Rebook Radar": "#4285f4", "IG Rebook Radar": "#4285f4"
  }
};

function tidySheet() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var pos = 1, moved = 0, hidden = 0;
  for (var i = 0; i < TIDY.core.length; i++) {
    var sh = ss.getSheetByName(TIDY.core[i]);
    if (!sh) continue;
    try {
      if (sh.isSheetHidden()) sh.showSheet();
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(pos);
      if (TIDY.colors[TIDY.core[i]]) sh.setTabColor(TIDY.colors[TIDY.core[i]]);
      pos++; moved++;
    } catch (e2) {}
  }
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var nm = sheets[s].getName();
    if (TIDY.core.indexOf(nm) >= 0 || sheets[s].isSheetHidden()) continue;
    try { sheets[s].hideSheet(); hidden++; } catch (e3) {}
  }
  var opp = ss.getSheetByName("Opportunities");
  if (opp) { try { ss.setActiveSheet(opp); } catch (e4) {} }
  var msg = "Simple view is on. Visible tabs: " + TIDY.core.join(", ") + "." +
    "\nHidden this run (nothing deleted): " + hidden +
    "\n\nEverything keeps working - scans, rollups and the Cowork skills read and write hidden tabs exactly as before." +
    "\nNew raw scan tabs are hidden automatically from now on." +
    "\nNeed a hidden tab? IG Scanner > More tools > Show working tabs / Show raw tabs / Open a hidden tab (or View > Hidden sheets).";
  if (ui) ui.alert("Simple view", msg, ui.ButtonSet.OK); else Logger.log(msg);
  return { moved: moved, hidden: hidden };
}

/** Brings the working tabs (feeds, inputs, logs) back, placed after the core tabs. */
function showWorkingTabs() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var pos = TIDY.core.length + 1, shown = 0;
  for (var i = 0; i < TIDY.working.length; i++) {
    var sh = ss.getSheetByName(TIDY.working[i]);
    if (!sh) continue;
    try {
      if (sh.isSheetHidden()) sh.showSheet();
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(pos);
      pos++; shown++;
    } catch (e2) {}
  }
  var msg = "Working tabs shown: " + shown + "\nRun IG Scanner > Simple view to hide them again.";
  if (ui) ui.alert("Show working tabs", msg, ui.ButtonSet.OK); else Logger.log(msg);
  return shown;
}

function showRawTabs() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sheets = ss.getSheets(), shown = 0;
  for (var s = 0; s < sheets.length; s++) {
    if (/ - Raw$/.test(sheets[s].getName()) && sheets[s].isSheetHidden()) {
      try { sheets[s].showSheet(); shown++; } catch (e2) {}
    }
  }
  var msg = "Raw tabs shown again: " + shown + "\nRun IG Scanner > Simple view to hide them again.";
  if (ui) ui.alert("Show raw tabs", msg, ui.ButtonSet.OK); else Logger.log(msg);
  return shown;
}

/** Menu action: type part of a tab name (creator handle, brand, "UGC"...) and
 * the first matching hidden tab is shown and opened. */
function openHiddenTab() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt("Open a hidden tab", "Type part of the tab name (creator handle, brand, 'UGC', 'Scan List'...):", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var q = String(r.getResponseText() || "").trim().toLowerCase();
  if (!q) return;
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sheets = ss.getSheets(), hits = [];
  for (var s = 0; s < sheets.length; s++) {
    if (sheets[s].getName().toLowerCase().indexOf(q) >= 0) hits.push(sheets[s]);
  }
  if (!hits.length) { ui.alert("Open a hidden tab", "No tab name contains '" + q + "'.", ui.ButtonSet.OK); return; }
  var sh = hits[0];
  if (sh.isSheetHidden()) sh.showSheet();
  ss.setActiveSheet(sh);
  if (hits.length > 1) {
    var others = hits.slice(1, 6).map(function (h) { return h.getName(); }).join(", ");
    ui.alert("Open a hidden tab", "Opened '" + sh.getName() + "'. " + (hits.length - 1) + " other tab(s) also match (" + others + (hits.length > 6 ? ", ..." : "") + ") - type more of the name to open one of those.", ui.ButtonSet.OK);
  }
}

// ------------------------------------------------------------------ Data quality purge

/** One-off (re-runnable) cleanup: applies the strict hashtag rule and junk-domain
 * stoplist retroactively to every YouTube Raw tab. Deletes rows whose brand is
 * junk infrastructure, or whose only evidence is a bare unknown hashtag. */
function purgeJunkRows() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sheets = ss.getSheets();
  var start = Date.now();
  var deleted = 0, tabs = 0, partial = false;
  function bkey(s) { return String(s || "").toLowerCase().replace(/\s*\(\?\)\s*$/, "").replace(/[^a-z0-9]/g, ""); }
  var JUNKSET = {};
  for (var j = 0; j < JUNK_DOMAINS.length; j++) JUNKSET[bkey(JUNK_DOMAINS[j])] = 1;
  var extra = ["sponsored", "sponsor", "ads", "gifted", "paidpartnership", "affiliate", "giveaway", "unboxing"];
  for (var j2 = 0; j2 < extra.length; j2++) JUNKSET[extra[j2]] = 1;
  var aliasKeys = {};
  for (var ak in BRAND_ALIASES) { aliasKeys[bkey(ak)] = 1; aliasKeys[bkey(BRAND_ALIASES[ak])] = 1; }
  for (var s = 0; s < sheets.length; s++) {
    var nm = sheets[s].getName();
    if (!/ - Raw$/.test(nm) || / IG - Raw$/.test(nm) || / TT - Raw$/.test(nm)) continue;
    var sh = sheets[s], lr = sh.getLastRow();
    if (lr < 2) continue;
    var lc = Math.max(sh.getLastColumn(), 12);
    var v = sh.getRange(2, 1, lr - 1, lc).getValues();
    var keep = [], removed = 0;
    for (var r = 0; r < v.length; r++) {
      var bk = bkey(v[r][1]);
      var ev = String(v[r][9] || "");
      var junk = !!JUNKSET[bk];
      var bareTag = ev.indexOf("(hashtag in description)") >= 0 && !aliasKeys[bk];
      if (bk && (junk || bareTag)) { removed++; continue; }
      keep.push(v[r]);
    }
    if (removed) {
      sh.getRange(2, 1, lr - 1, lc).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, lc).setValues(keep);
      deleted += removed;
    }
    tabs++;
    if (Date.now() - start > 270000) { partial = true; break; }
  }
  var msg = "Junk purge: removed " + deleted + " rows across " + tabs + " YouTube tabs." +
    (partial ? "\n\nTime limit hit - RUN AGAIN to continue (cleaned tabs re-check fast)." :
    "\n\nDone. Rebuild Opportunities + IG Rebook Radar + Creator Index to refresh the rollups.");
  if (ui) ui.alert("Purge junk rows", msg, ui.ButtonSet.OK); else Logger.log(msg);
  return { deleted: deleted, tabs: tabs, partial: partial };
}
