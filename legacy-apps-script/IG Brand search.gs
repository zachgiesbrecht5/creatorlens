/**
 * =========================================================
 * ROOTFOR - IG Brand Search (v1.2)
 * =========================================================
 * "Who is this brand activating on Instagram, and when?"
 * - Brand search: #<brand>partner + #<brand>ambassador via the
 *   IG Hashtag Search API, caption-verified, filtered to the
 *   last 60 days, cross-referenced against every "* - Raw" tab
 *   AND the accumulated Ad Radar tab.
 * - #ad sweep: manual sample of the #ad firehose (Meta only
 *   exposes ~24h of recent hashtag media) that accumulates
 *   named-brand rows in "Ad Radar" - click it regularly and
 *   the 30-60 day picture builds itself.
 * Meta limits hashtag queries to 30 UNIQUE hashtags per rolling
 * 7 days (tracked in IG_HASHTAG_LOG). Meta hides usernames on
 * hashtag results - post links are always included.
 * =========================================================
 */

var IGBS = {
  tabName: "IG Brand Partnerships",
  adRadarTab: "Ad Radar",
  brandCollabTab: "Brand Collabs",
  tiktokTab: "TikTok Handles",
  budgetProp: "IG_HASHTAG_LOG",
  budgetLimit: 30,
  lookbackDays: 60,
  mediaFields: "id,caption,media_type,permalink,like_count,comments_count,timestamp"
};

function igBrandSearch() {
  var html = HtmlService.createHtmlOutputFromFile("IgBrandSearchDialog")
    .setWidth(620).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, "Brand search (IG)");
}

/** Server for the dialog: run the IG brand search, return a plain-text summary. */
function igbsRunBrandSearch(brand, extraCsv, fMin, fMax, engMin) {
  brand = String(brand || "").trim();
  if (!brand) return "No brand given.";
  var extra = String(extraCsv || "").split(",").map(function (s) { return s.trim().replace(/^#/, ""); }).filter(String);
  var filters = {
    fMin: fMin ? Number(fMin) : null,
    fMax: fMax ? Number(fMax) : null,
    engMin: engMin ? Number(engMin) : null
  };
  var res = igBrandSearchCore_(brand, extra, filters);
  var msg = "Searched: " + res.tags.map(function(t){return "#" + t;}).join(", ") +
    "\nWindow: last " + IGBS.lookbackDays + " days" +
    "\n\nPosts reviewed: " + res.reviewed +
    "\nFrom the brand\u2019s own feed: " + (res.acct || 0) +
    "\nVerified " + brand + " partnership posts: " + res.verified +
    "\nKnown creators from your own scans: " + res.internal +
    "\nMatches from Ad Radar: " + res.radar +
    "\nCreators enriched (followers/engagement): " + res.enriched +
    (res.filtered ? "\nRemoved - outside your filters: " + res.filtered : "") +
    (res.unverifiable ? "\nRemoved - creator not identifiable, size unverifiable: " + res.unverifiable : "") +
    "\n\nHashtag credits used (7-day window): " + res.budgetUsed + "/" + IGBS.budgetLimit +
    (res.wave ? "\n\nTIMING: " + res.waveCount + " deals in the last 3 weeks - this looks like an ACTIVE campaign wave. Current casting is probably closed; pitch the NEXT wave or the casting database." : "") +
    "\n\nSee \"" + IGBS.tabName + "\"." +
    (res.anonymous ? "\n\nNote: Meta hides creator names on hashtag results - open the post links to see who posted." : "");
  // Nothing found? Say WHY, so nobody burns credits guessing.
  if (!res.verified && !res.internal && !res.radar) {
    msg += "\n\n--- WHY YOU GOT NOTHING ---\n" +
      "Two doors feed this search and both came back empty:\n\n" +
      "1. HASHTAGS: Meta only shows roughly the last 24 HOURS of posts for a tag. " +
      "So #" + brand.toLowerCase().replace(/[^a-z0-9]/g, "") + "partner only returns something if one of their creators posted TODAY. " +
      "Big always-on ambassador programs (G FUEL, Gymshark, AG1) hit. Smaller or occasional programs usually do not.\n\n" +
      "2. THE BRAND FEED: most brands no longer @-mention creators in their captions - they credit via " +
      "collab posts and photo tags, which no API can see.\n\n" +
      "WHAT ACTUALLY WORKS:\n" +
      "- Re-run this same brand on another day. Results accumulate, so a brand that is dry today can hit tomorrow.\n" +
      "- Scan a CREATOR you already suspect works with them (Scan IG creator) - creator-side detection is strong.\n" +
      "- On YouTube this problem does not exist: use YouTube Scanner > Search brand partnerships for the same brand.";
  }
  try { var rrn = igRepeatSummaryForBrand_(brand); if (rrn) msg += "\n\nREPEAT PARTNERS for " + brand + " (booked 2+ times - likely driving sales):\n" + rrn; } catch (rrErr) {}
  return msg;
}

function igAdSweep() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt("Disclosure sweep",
    "Hashtags to sweep, comma-separated (1 weekly credit each, " + IGBS.budgetLimit + "/week cap).\n" +
    "Default: sponsored, paidpartnership\n\n" +
    "Note: Meta serves the #ad mega-tag unreliably (often empty); disclosure tags\n" +
    "like sponsored / paidpartnership / brandambassador / gifted return more.",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var input = resp.getResponseText().trim();
  var tags = (input ? input.split(",") : ["sponsored", "paidpartnership"])
    .map(igTagNorm_).filter(function(t) { return t.length >= 2; });
  if (!tags.length) { tags = ["sponsored", "paidpartnership"]; }
  var res = igAdSweepCore_(tags);
  ui.alert("Disclosure sweep",
    "Hashtags swept: " + tags.map(function(t){ return "#" + t; }).join(", ") +
    "\n\nPosts sampled (top + recent): " + res.reviewed +
    "\nNew posts with a NAMED brand detected: " + res.added +
    "\nAlready in Ad Radar (skipped): " + res.dupes +
    "\n\nHashtag credits used (7-day window): " + res.budgetUsed + "/" + IGBS.budgetLimit +
    "\n\nMeta only exposes ~24h of recent posts per hashtag - sweep regularly and \"" +
    IGBS.adRadarTab + "\" accumulates your 30-60 day picture.", ui.ButtonSet.OK);
}

function igHashtagBudget() {
  var ui = SpreadsheetApp.getUi();
  var used = igBudgetList_();
  ui.alert("IG hashtag budget",
    "Unique hashtags queried in the last 7 days: " + used.length + "/" + IGBS.budgetLimit +
    (used.length ? "\n\n" + used.join(", ") : "") +
    "\n\nMeta resets each hashtag 7 days after first use.", ui.ButtonSet.OK);
}

// ---------------------------------------------------------- Cores

function igBrandSearchCore_(brand, extraTags, filters) {
  var c = igGetCreds_();
  var bNorm = igTagNorm_(brand);
  if (bNorm.length < 3) throw new Error("Brand name too short.");
  filters = filters || { fMin: null, fMax: null, engMin: null };

  var tags = [bNorm + "partner", bNorm + "ambassador"];
  (extraTags || []).forEach(function(t) { var n = igTagNorm_(t); if (n.length >= 3) tags.push(n); });
  tags = tags.filter(function(t, i) { return tags.indexOf(t) === i; });

  var cutoff = Date.now() - IGBS.lookbackDays * 86400000;
  var hits = igHashtagPosts_(c, tags);
  var found = [], oembedOk = true;
  for (var i = 0; i < hits.posts.length; i++) {
    var post = hits.posts[i];
    var ts = post.timestamp ? Date.parse(post.timestamp) : NaN;
    if (isFinite(ts) && ts < cutoff) continue;
    var cap = post.caption || "";
    var det = [];
    try { det = igDetect_(cap, ""); } catch (e) {}
    var hit = null;
    for (var di = 0; di < det.length; di++) {
      if (igTagNorm_(det[di].brand) === bNorm) { hit = det[di]; break; }
    }
    // Hashtag-presence fallback: only tags that THEMSELVES declare a deal
    // (#brandpartner, #brandambassador) get a free pass. Neutral tags like
    // #drinkag1 are used organically, so they require real disclosure
    // language in the caption (caught by igDetect_ above) to count.
    if (!hit && /partner|ambassador/.test(post._tag) &&
        cap.toLowerCase().indexOf("#" + post._tag) !== -1) {
      hit = { label: "Medium" };
    }
    if (!hit) continue;
    var creator = "";
    if (oembedOk && found.length < 30) {
      var oe = igOembedAuthor_(post.permalink, c.token);
      if (oe === null) { oembedOk = false; } else { creator = oe; }
    }
    found.push({
      brand: brand, source: "Hashtag #" + post._tag + " (" + post._edge + ")",
      creator: creator, label: hit.label || "Medium",
      posted: post.timestamp ? String(post.timestamp).slice(0, 10) : "",
      caption: cap.replace(/\s+/g, " ").slice(0, 140),
      url: post.permalink || "",
      likes: (post.like_count != null ? post.like_count : ""),
      comments: (post.comments_count != null ? post.comments_count : "")
    });
  }

  var internal = igInternalActivations_(brand, cutoff);
  var radar = igRadarActivations_(brand, cutoff);
  // The brand's OWN feed is the richest source: real creator handles (so they can
  // actually be size-filtered) and it works for brands with no partner hashtag.
  var acct = [];
  try { acct = igBrandAccountRows_(c, brand, cutoff); } catch (eAcct) {}
  var all = internal.concat(radar).concat(acct).concat(found);

  // Enrich identifiable creators with followers / engagement / bio location
  var cache = {}, enriched = 0;
  // Followers/engagement cost one Meta call per creator, so only pay for them when a
  // filter actually needs them. No filter = a quick sample, so the search stays fast.
  var needSizeData = !!(filters && (filters.fMin != null || filters.fMax != null || filters.engMin != null));
  var ENRICH_CAP = needSizeData ? 60 : 12;
  var enrichStart = Date.now();
  var enrichStopped = false;
  for (var r = 0; r < all.length; r++) {
    var row = all[r];
    row.followers = ""; row.eng = ""; row.bioloc = "";
    if (Date.now() - enrichStart > 90000) { enrichStopped = true; continue; }  // never run away
    var nm = String(row.creator || "").replace(/^@/, "").trim();
    if (!nm || /\s/.test(nm)) continue;  // not an IG username (e.g. YT channel names)
    if (Object.keys(cache).length >= ENRICH_CAP && !cache.hasOwnProperty(nm.toLowerCase())) continue;
    var info = igEnrichCreator_(c, nm, cache);
    if (info) {
      row.followers = info.followers; row.eng = info.eng; row.bioloc = info.bioloc;
      enriched++;
    }
  }

  // Apply filters. A row whose follower count we could not read cannot be
  // proven to match, so when a size/engagement filter IS set those rows are
  // dropped and counted separately - otherwise the filter would be meaningless
  // (this was the bug: unverifiable rows used to sail straight through).
  var hasFilter = (filters.fMin != null || filters.fMax != null || filters.engMin != null);
  var kept = [], filtered = 0, unverifiable = 0;
  for (var k = 0; k < all.length; k++) {
    var x = all[k];
    var known = (x.followers !== "" && x.followers != null);
    if (hasFilter && !known) { unverifiable++; continue; }
    var drop = false;
    if (known) {
      if (filters.fMin != null && x.followers < filters.fMin) drop = true;
      if (filters.fMax != null && x.followers > filters.fMax) drop = true;
      if (filters.engMin != null) {
        if (x.eng === "" || x.eng == null) drop = true;      // engagement unknown
        else if (x.eng < filters.engMin) drop = true;
      }
    }
    if (drop) { filtered++; } else { kept.push(x); }
  }

  igWriteBrandRows_(brand, kept);
  // Active-wave heuristic: several deals inside ~3 weeks = a campaign running NOW,
  // which usually means current casting is closed - pitch the next wave.
  var waveCount = 0, waveCreators = {};
  for (var w = 0; w < kept.length; w++) {
    var wms = Date.parse(String(kept[w].posted || ""));
    if (isFinite(wms) && Date.now() - wms <= 21 * 86400000) {
      waveCount++;
      if (kept[w].creator) waveCreators[kept[w].creator] = 1;
    }
  }
  var wave = waveCount >= 3 || Object.keys(waveCreators).length >= 2;
  var anon = kept.some(function(x) { return !x.creator; });
  return { tags: tags, reviewed: hits.reviewed, verified: found.length,
    internal: internal.length, radar: radar.length, enriched: enriched,
    filtered: filtered, unverifiable: unverifiable, acct: acct.length,
    budgetUsed: igBudgetList_().length, anonymous: anon, wave: wave, waveCount: waveCount };
}

/** business_discovery lookup: followers, avg engagement %, best-effort bio location. */
function igEnrichCreator_(c, name, cache) {
  var key = name.toLowerCase();
  if (cache[key] !== undefined) return cache[key];
  var out = null;
  try {
    var enc = encodeURIComponent(c.token);
    var f = encodeURIComponent("business_discovery.username(" + name + "){followers_count,biography,media.limit(12){like_count,comments_count}}");
    var j = igGraph_(c.igId + "?fields=" + f + "&access_token=" + enc);
    var bd = j && j.business_discovery;
    if (bd && bd.followers_count) {
      var med = (bd.media && bd.media.data) || [];
      var sum = 0, n = 0;
      for (var i = 0; i < med.length; i++) {
        var lk = med[i].like_count, cm = med[i].comments_count;
        if (lk != null || cm != null) { sum += (lk || 0) + (cm || 0); n++; }
      }
      var eng = n ? Math.round((sum / n) / bd.followers_count * 10000) / 100 : "";
      var bio = String(bd.biography || "");
      var lm = bio.match(/(?:based in|from|📍)\s*([A-Za-z .,'-]{2,40})/i);
      out = { followers: bd.followers_count, eng: eng, bioloc: lm ? lm[1].trim() : "" };
    }
  } catch (e) { out = null; }
  cache[key] = out;
  return out;
}

/** Parse a free-typed filter line into {fMin, fMax, engMin}.
 * Handles: "100k-1m", "100k to 1m", "between 100k and 1m", "100,000 - 1,000,000",
 * "over 100k", "100k+", "under 500k", "max 500k", "2%", and combinations. */
function igParseFilters_(s) {
  var f = { fMin: null, fMax: null, engMin: null };
  if (!s) return f;

  // Engagement first, then strip it so it can't be read as a follower number.
  // Join thousand separators FIRST ("1,000,000" -> "1000000"), only then treat
  // any remaining comma as a separator between clauses.
  var t = String(s).toLowerCase()
    .replace(/(\d)[,\u00a0](?=\d{3}(?:\D|$))/g, "$1")
    .replace(/,/g, " ");
  var eng = t.match(/(\d+(?:\.\d+)?)\s*%/);
  if (eng) { f.engMin = parseFloat(eng[1]); t = t.replace(eng[0], " "); }

  function num(x, suf) {
    var vv = parseFloat(x);
    if (!isFinite(vv)) return null;
    if (suf === "k") vv *= 1e3;
    else if (suf === "m") vv *= 1e6;
    else if (vv < 1000 && /^\d+$/.test(String(x))) vv *= 1e3;  // bare "100" reads as 100k
    return vv;
  }
  var N = "(\\d+(?:\\.\\d+)?)\\s*([km]?)";

  // range: "100k - 1m", "100k to 1m", "between 100k and 1m"
  var range = t.match(new RegExp(N + "\\s*(?:-|–|to|and|until)\\s*" + N));
  if (range) {
    var a = num(range[1], range[2]), b = num(range[3], range[4]);
    if (a != null && b != null) {
      f.fMin = Math.min(a, b);
      f.fMax = Math.max(a, b);
      return f;
    }
  }
  // lower bound: "over 100k", "100k+", "at least 100k", "min 100k"
  var lo = t.match(new RegExp("(?:over|above|more than|at least|min(?:imum)?|>=?)\\s*" + N)) ||
           t.match(new RegExp(N + "\\s*\\+"));
  if (lo) f.fMin = num(lo[1], lo[2]);
  // upper bound: "under 500k", "below 500k", "max 500k"
  var hi = t.match(new RegExp("(?:under|below|less than|at most|max(?:imum)?|<=?)\\s*" + N));
  if (hi) f.fMax = num(hi[1], hi[2]);
  // bare single number with no keyword -> treat as a minimum
  if (f.fMin == null && f.fMax == null) {
    var bare = t.match(new RegExp("(?:^|\\s)" + N + "(?:\\s|$)"));
    if (bare) f.fMin = num(bare[1], bare[2]);
  }
  return f;
}


function igAdSweepCore_(tags) {
  var c = igGetCreds_();
  var hits = igHashtagPosts_(c, tags && tags.length ? tags : ["sponsored", "paidpartnership"]);
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sh = ss.getSheetByName(IGBS.adRadarTab);
  if (!sh) {
    sh = ss.insertSheet(IGBS.adRadarTab);
    sh.getRange(1, 1, 1, 9).setValues([[
      "Date Swept", "Brand", "Confidence", "Posted", "Caption", "Post URL", "Likes", "Comments", "Source"
    ]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  var known = {};
  if (sh.getLastRow() >= 2) {
    var urls = sh.getRange(2, 6, sh.getLastRow() - 1, 1).getValues();
    for (var u = 0; u < urls.length; u++) known[String(urls[u][0])] = 1;
  }
  var today = new Date().toISOString().slice(0, 10);
  var rows = [], dupes = 0;
  for (var i = 0; i < hits.posts.length; i++) {
    var post = hits.posts[i];
    var url = post.permalink || "";
    if (url && known[url]) { dupes++; continue; }
    var det = [];
    try { det = igDetect_(post.caption || "", ""); } catch (e) {}
    for (var d = 0; d < det.length; d++) {
      if (det[d].brand.charAt(0) === "(") continue;  // named brands only in the radar
      rows.push([today, det[d].brand, det[d].label,
        post.timestamp ? String(post.timestamp).slice(0, 10) : "",
        (post.caption || "").replace(/\s+/g, " ").slice(0, 140), url,
        (post.like_count != null ? post.like_count : ""),
        (post.comments_count != null ? post.comments_count : ""),
        "#" + post._tag + " " + post._edge]);
    }
    if (url) known[url] = 1;
  }
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
  return { reviewed: hits.reviewed, added: rows.length, dupes: dupes, budgetUsed: igBudgetList_().length };
}

/** Shared: resolve hashtags -> top+recent media (budget-checked). */
function igHashtagPosts_(c, tags) {
  var enc = encodeURIComponent(c.token);
  var used = igBudgetList_();
  var fresh = tags.filter(function(t) { return used.indexOf(t) === -1; });
  if (used.length + fresh.length > IGBS.budgetLimit) {
    throw new Error("This search needs " + fresh.length + " new hashtag credits but only " +
      (IGBS.budgetLimit - used.length) + " remain in the 7-day window (" + used.length + "/" +
      IGBS.budgetLimit + " used).");
  }
  var seen = {}, posts = [], reviewed = 0;
  for (var ti = 0; ti < tags.length; ti++) {
    var tag = tags[ti];
    var hj = null;
    try {
      hj = igGraph_("ig_hashtag_search?user_id=" + c.igId + "&q=" + encodeURIComponent(tag) + "&access_token=" + enc);
    } catch (e) { continue; }
    igBudgetAdd_(tag);
    var hid = hj && hj.data && hj.data[0] && hj.data[0].id;
    if (!hid) continue;
    var edges = ["top_media", "recent_media"];
    for (var ei = 0; ei < edges.length; ei++) {
      var mj = null;
      try {
        mj = igGraph_(hid + "/" + edges[ei] + "?user_id=" + c.igId + "&fields=" +
          encodeURIComponent(IGBS.mediaFields) + "&limit=50&access_token=" + enc);
      } catch (e2) {
        try {
          mj = igGraph_(hid + "/" + edges[ei] + "?user_id=" + c.igId + "&fields=" +
            encodeURIComponent("id,caption,media_type,permalink,like_count,comments_count") +
            "&limit=50&access_token=" + enc);
        } catch (e3) { continue; }
      }
      var data = (mj && mj.data) || [];
      for (var mi = 0; mi < data.length; mi++) {
        var post = data[mi];
        if (!post || !post.id || seen[post.id]) continue;
        seen[post.id] = 1;
        reviewed++;
        post._tag = tag;
        post._edge = edges[ei].replace("_media", "");
        posts.push(post);
      }
    }
  }
  return { posts: posts, reviewed: reviewed };
}

// ---------------------------------------------------------- Helpers

function igTagNorm_(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9_]/g, ""); }

function igBudgetList_() {
  var p = PropertiesService.getScriptProperties();
  var log = [];
  try { log = JSON.parse(p.getProperty(IGBS.budgetProp) || "[]"); } catch (e) {}
  var cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  log = log.filter(function(x) { return x && x.ts > cutoff; });
  p.setProperty(IGBS.budgetProp, JSON.stringify(log));
  return log.map(function(x) { return x.tag; });
}

function igBudgetAdd_(tag) {
  var p = PropertiesService.getScriptProperties();
  var log = [];
  try { log = JSON.parse(p.getProperty(IGBS.budgetProp) || "[]"); } catch (e) {}
  if (!log.some(function(x) { return x && x.tag === tag; })) log.push({ tag: tag, ts: Date.now() });
  p.setProperty(IGBS.budgetProp, JSON.stringify(log));
}

/** Returns "@name", "" (no name), or null (oEmbed not permitted - stop trying). */
function igOembedAuthor_(permalink, token) {
  if (!permalink) return "";
  try {
    var r = UrlFetchApp.fetch("https://graph.facebook.com/" + IG.graphVersion +
      "/instagram_oembed?url=" + encodeURIComponent(permalink) +
      "&fields=author_name&access_token=" + encodeURIComponent(token),
      { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      var j = JSON.parse(r.getContentText());
      return j.author_name ? ("@" + String(j.author_name).replace(/^@/, "")) : "";
    }
    return null;
  } catch (e) { return null; }
}

function igDateMs_(v) {
  if (v instanceof Date) return v.getTime();
  var t = Date.parse(String(v));
  return isFinite(t) ? t : NaN;
}

/** This brand's rows in every "* - Raw" tab (YT + IG), within the window. */
function igInternalActivations_(brand, cutoffMs) {
  var bNorm = igTagNorm_(brand);
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var out = [];
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var nm = sh.getName();
    if (!/ - Raw$/.test(nm) || sh.getLastRow() < 2) continue;
    var isIg = / IG - Raw$/.test(nm);
    var isTt = / TT - Raw$/.test(nm);
    var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var hdr = vals[0].map(String);
    var bCol = hdr.indexOf("Brand");
    if (bCol < 0) continue;
    var urlCol = hdr.indexOf("Video URL"), pubCol = hdr.indexOf("Published"),
        confCol = hdr.indexOf("Confidence"), titleCol = hdr.indexOf("Video Title");
    for (var r = 1; r < vals.length; r++) {
      if (igTagNorm_(String(vals[r][bCol])) !== bNorm) continue;
      var dMs = pubCol >= 0 ? igDateMs_(vals[r][pubCol]) : NaN;
      if (cutoffMs && isFinite(dMs) && dMs < cutoffMs) continue;
      out.push({
        brand: brand,
        source: "Your scans (" + (isIg ? "Instagram" : (isTt ? "TikTok" : "YouTube")) + ")",
        creator: nm.replace(/ IG - Raw$/, "").replace(/ TT - Raw$/, "").replace(/ - Raw$/, ""),
        label: confCol >= 0 ? String(vals[r][confCol]) : "",
        posted: isFinite(dMs) ? new Date(dMs).toISOString().slice(0, 10) : "",
        caption: titleCol >= 0 ? String(vals[r][titleCol]).replace(/\s+/g, " ").slice(0, 140) : "",
        url: urlCol >= 0 ? String(vals[r][urlCol]) : "",
        likes: "", comments: ""
      });
    }
  }
  return out;
}

/** This brand's rows already collected in the Ad Radar tab, within the window. */
function igRadarActivations_(brand, cutoffMs) {
  var bNorm = igTagNorm_(brand);
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sh = ss.getSheetByName(IGBS.adRadarTab);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();
  for (var r = 0; r < vals.length; r++) {
    if (igTagNorm_(String(vals[r][1])) !== bNorm) continue;
    var dMs = igDateMs_(vals[r][3]);
    if (cutoffMs && isFinite(dMs) && dMs < cutoffMs) continue;
    out.push({
      brand: brand, source: "Ad Radar (#ad sweep)", creator: "",
      label: String(vals[r][2] || ""), posted: isFinite(dMs) ? new Date(dMs).toISOString().slice(0, 10) : "",
      caption: String(vals[r][4] || ""), url: String(vals[r][5] || ""),
      likes: vals[r][6], comments: vals[r][7]
    });
  }
  return out;
}

function igWriteBrandRows_(brand, all) {
  var HEAD = ["Date Scanned", "Brand", "Source", "Creator", "Followers", "Eng %",
    "Bio location", "Confidence", "Posted", "Caption / Title", "Post URL", "Likes", "Comments"];
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sh = ss.getSheetByName(IGBS.tabName);
  if (!sh) {
    sh = ss.insertSheet(IGBS.tabName);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
    sh.setFrozenRows(1);
  } else {
    var cur = sh.getRange(1, 1, 1, HEAD.length).getValues()[0].map(String).join("|");
    if (cur !== HEAD.join("|")) {
      sh.clear();
      sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  }
  var last = sh.getLastRow();
  if (last >= 2) {
    var brands = sh.getRange(2, 2, last - 1, 1).getValues();
    for (var r = brands.length - 1; r >= 0; r--) {
      if (igTagNorm_(String(brands[r][0])) === igTagNorm_(brand)) sh.deleteRow(r + 2);
    }
  }
  var seenU = {}, rows = [];
  var today = new Date().toISOString().slice(0, 10);
  for (var i = 0; i < all.length; i++) {
    var x = all[i];
    var dk = (x.url || "") + "|" + (x.creator || "");
    if (x.url && seenU[dk]) continue;
    if (x.url) seenU[dk] = 1;
    var engCell = (x.eng === "" || x.eng == null) ? "" : (String(x.eng) + "%");
    rows.push([today, x.brand, x.source, x.creator, x.followers, engCell, x.bioloc,
      x.label, x.posted, x.caption, x.url, x.likes, x.comments]);
  }
  if (rows.length) {
    var startRow = sh.getLastRow() + 1;
    var rng = sh.getRange(startRow, 1, rows.length, HEAD.length);
    rng.setNumberFormat("General");
    rng.setValues(rows);
    sh.getRange(startRow, 5, rows.length, 1).setNumberFormat("#,##0");
    sh.getRange(startRow, 6, rows.length, 1).setNumberFormat("@");
  }
  return rows.length;
}

// ---------------------------------------------------------- Brand account scan

/** Scan a BRAND's Instagram account to find the creators it partners with.
 *
 * Why this exists: Business Discovery only returns posts a creator OWNS.
 * When a brand posts a collab (brand is author, creator is co-author) the post
 * appears on the creator's grid but NOT in their API media list - so a creator
 * scan can never see it. Scanning the brand side recovers exactly those deals,
 * and doubles as brand-first discovery: "who has Bonobos worked with?"
 * Costs no hashtag credits - this is plain Business Discovery. */
function igScanBrand() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt("Scan brand account",
    "Brand Instagram handle(s), comma-separated (e.g. bonobos, olipop).\n\n" +
    "Reads the brand's recent posts and pulls out every creator they tagged -\n" +
    "including collab posts that creator-side scans structurally cannot see.\n\n" +
    "Uses no hashtag credits.",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var input = resp.getResponseText().trim();
  if (!input) return;
  var brands = input.split(",").map(function (s) {
    return String(s).trim().replace(/^@/, "").toLowerCase();
  }).filter(Boolean);

  var lines = [], totalCreators = 0;
  for (var i = 0; i < brands.length; i++) {
    try {
      var r = igScanBrandCore_(brands[i]);
      totalCreators += r.creators;
      lines.push("@" + brands[i] + ": " + r.posts + " posts scanned, " +
        r.creators + " creator(s) found" + (r.enriched ? ", " + r.enriched + " enriched" : ""));
    } catch (e) {
      var msg = String(e.message).split("\n")[0];
      if (/request limit|rate limit|#4\b/i.test(msg)) {
        lines.push("@" + brands[i] + ": RATE LIMITED - try again in ~1h");
        break;
      }
      lines.push("@" + brands[i] + ": ERROR - " + msg.slice(0, 120));
    }
  }
  ui.alert("Scan brand account",
    lines.join("\n") +
    "\n\nTotal creator partnerships found: " + totalCreators +
    igRepeatAlertBlock_(brands) +
    "\n\nSee \"" + IGBS.brandCollabTab + "\".",
    ui.ButtonSet.OK);
}

function igScanBrandCore_(brand) {
  var c = igGetCreds_();
  var enc = encodeURIComponent(c.token);
  var f = encodeURIComponent("business_discovery.username(" + brand +
    "){username,followers_count,media_count,media.limit(50){caption,permalink,timestamp,like_count,comments_count,media_type}}");
  var j = igGraph_(c.igId + "?fields=" + f + "&access_token=" + enc);
  var bd = (j && j.business_discovery) || {};
  var media = ((bd.media || {}).data) || [];

  var brandKey = igTagNorm_(brand);
  var seen = {}, rows = [], cache = {}, enriched = 0;
  var today = new Date().toISOString().slice(0, 10);

  for (var i = 0; i < media.length; i++) {
    var post = media[i];
    var cap = String(post.caption || "");
    var mentions = cap.match(/@[A-Za-z0-9._]{2,30}/g) || [];
    for (var k = 0; k < mentions.length; k++) {
      var h = mentions[k].slice(1).toLowerCase().replace(/[._]+$/, "");
      if (!h || h.length < 2) continue;
      if (igTagNorm_(h) === brandKey) continue;       // the brand tagging itself
      var dedupe = h + "|" + (post.permalink || i);
      if (seen[dedupe]) continue;
      seen[dedupe] = 1;

      // A brand tagging someone is already a strong signal; disclosure language
      // in the same caption upgrades it to explicit.
      var disclosed = /#\w*partner\b|#\w*ambassador\b|#ad\b|#sponsored|paid partnership|createdwith/i.test(cap);
      var info = igEnrichCreator_(c, h, cache);
      if (info && cache[h] !== null) enriched++;

      rows.push([today, bd.username || brand, "@" + h,
        info ? info.followers : "", info && info.eng !== "" ? String(info.eng) + "%" : "",
        info ? info.bioloc : "",
        disclosed ? "High" : "Medium",
        disclosed ? "Brand collab + disclosure" : "Tagged by brand",
        post.timestamp ? String(post.timestamp).slice(0, 10) : "",
        cap.replace(/\s+/g, " ").slice(0, 140),
        post.permalink || "",
        post.like_count != null ? post.like_count : "",
        post.comments_count != null ? post.comments_count : ""]);
    }
  }

  igWriteBrandCollabRows_(bd.username || brand, rows);
  return { posts: media.length, creators: rows.length, enriched: enriched };
}

/** The brand's own feed as brand-search rows. Creator handles here are real,
 * which is what makes follower/engagement filtering actually possible. */
function igBrandAccountRows_(c, brand, cutoffMs) {
  var enc = encodeURIComponent(c.token);
  var f = encodeURIComponent("business_discovery.username(" + brand +
    "){username,media.limit(50){caption,permalink,timestamp,like_count,comments_count}}");
  var j = igGraph_(c.igId + "?fields=" + f + "&access_token=" + enc);
  var bd = (j && j.business_discovery) || {};
  var media = ((bd.media || {}).data) || [];
  var brandKey = igTagNorm_(brand), out = [], seen = {};
  for (var i = 0; i < media.length; i++) {
    var post = media[i];
    var ts = post.timestamp ? Date.parse(post.timestamp) : NaN;
    if (cutoffMs && isFinite(ts) && ts < cutoffMs) continue;
    var cap = String(post.caption || "");
    var mentions = cap.match(/@[A-Za-z0-9._]{2,30}/g) || [];
    for (var k = 0; k < mentions.length; k++) {
      var h = mentions[k].slice(1).toLowerCase().replace(/[._]+$/, "");
      if (!h || h.length < 2 || igTagNorm_(h) === brandKey) continue;
      var key = h + "|" + (post.permalink || i);
      if (seen[key]) continue;
      seen[key] = 1;
      var disclosed = /#\w*partner\b|#\w*ambassador\b|#ad\b|#sponsored|paid partnership|createdwith/i.test(cap);
      out.push({
        brand: brand,
        source: "Brand's own feed (tagged)",
        creator: "@" + h,
        label: disclosed ? "High" : "Medium",
        posted: post.timestamp ? String(post.timestamp).slice(0, 10) : "",
        caption: cap.replace(/\s+/g, " ").slice(0, 140),
        url: post.permalink || "",
        likes: post.like_count != null ? post.like_count : "",
        comments: post.comments_count != null ? post.comments_count : ""
      });
    }
  }
  return out;
}

function igWriteBrandCollabRows_(brand, rows) {
  var HEAD = ["Date Scanned", "Brand", "Creator", "Followers", "Eng %", "Bio location",
    "Confidence", "Signal", "Posted", "Caption", "Post URL", "Likes", "Comments"];
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sh = ss.getSheetByName(IGBS.brandCollabTab);
  if (!sh) {
    sh = ss.insertSheet(IGBS.brandCollabTab);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  // replace this brand's previous rows so re-scans stay clean
  var last = sh.getLastRow();
  if (last >= 2) {
    var col = sh.getRange(2, 2, last - 1, 1).getValues();
    for (var r = col.length - 1; r >= 0; r--) {
      if (igTagNorm_(String(col[r][0])) === igTagNorm_(brand)) sh.deleteRow(r + 2);
    }
  }
  if (!rows.length) return 0;
  var start = sh.getLastRow() + 1;
  var rng = sh.getRange(start, 1, rows.length, HEAD.length);
  rng.setNumberFormat("@");
  rng.setValues(rows);
  sh.getRange(start, 4, rows.length, 1).setNumberFormat("#,##0");
  return rows.length;
}

// ---------------------------------------------------------- YT -> IG handle harvester

/** Menu action: mine Instagram handles from YouTube channel + video descriptions
 * of every channel already scanned into a "* - Raw" tab, and append NEW handles
 * to the IG Scan List for batch scanning. Costs YouTube quota only (cheap list
 * calls), zero Meta hashtag credits. */
function igHarvestHandles() {
  var ui = SpreadsheetApp.getUi();
  var res = igHarvestCore_();
  ui.alert("Harvest social handles from YouTube",
    "YT videos inspected: " + res.videos +
    "\nChannels inspected: " + res.channels +
    "\n\nINSTAGRAM" +
    "\n  handles found: " + res.found +
    "\n  NEW added to \"" + IG.scanListTab + "\": " + res.added +
    "\n\nTIKTOK" +
    "\n  handles found: " + res.ttFound +
    "\n  NEW added to \"" + IGBS.tiktokTab + "\": " + res.ttAdded +
    (res.added ? "\n\nNext: review \"" + IG.scanListTab + "\" (category in column B is optional) and run \"Scan IG batch list\"." : "") +
    "\n\nNote: TikTok has no open API for scanning third-party creators, so the " +
    "TikTok tab is a mapped reference list with profile links - not scannable like IG.",
    ui.ButtonSet.OK);
}

function igHarvestCore_() {
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var key = config.ytApiKey;

  // 1. Video IDs from every YouTube "* - Raw" tab (skip the IG ones)
  var vids = {};
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var nm = sheets[i].getName();
    if (!/ - Raw$/.test(nm) || / IG - Raw$/.test(nm) || sheets[i].getLastRow() < 2) continue;
    var vals = sheets[i].getRange(1, 1, sheets[i].getLastRow(), sheets[i].getLastColumn()).getValues();
    var hdr = vals[0].map(String);
    var uCol = hdr.indexOf("Video URL");
    if (uCol < 0) continue;
    for (var r = 1; r < vals.length; r++) {
      var mv = String(vals[r][uCol]).match(/(?:[?&]v=|youtu\.be\/)([\w-]{11})/);
      if (mv) vids[mv[1]] = 1;
    }
  }
  var vidIds = Object.keys(vids);

  var IG_SKIP = { p: 1, reel: 1, reels: 1, tv: 1, stories: 1, story: 1, explore: 1,
    accounts: 1, share: 1, invites: 1, direct: 1, about: 1, legal: 1, web: 1 };
  var TT_SKIP = { tag: 1, discover: 1, music: 1, video: 1, foryou: 1, explore: 1,
    live: 1, search: 1, upload: 1, about: 1, legal: 1, embed: 1, business: 1 };

  var handles = {}, tiktoks = {};
  function harvest(text, src) {
    var re = /instagram\.com\/([A-Za-z0-9._]{2,30})/gi, hm;
    while ((hm = re.exec(text)) !== null) {
      var h = hm[1].toLowerCase().replace(/[._]+$/, "");
      if (h.length < 2 || IG_SKIP[h]) continue;
      if (!handles[h]) handles[h] = src;
    }
    // TikTok profile links always carry the @ , so false positives are rare
    var tre = /tiktok\.com\/@([A-Za-z0-9._]{2,24})/gi, tm;
    while ((tm = tre.exec(text)) !== null) {
      var th = tm[1].toLowerCase().replace(/[._]+$/, "");
      if (th.length < 2 || TT_SKIP[th]) continue;
      if (!tiktoks[th]) tiktoks[th] = src;
    }
  }

  // 2. Video descriptions + channel ids (videos.list, 50 per call)
  var channels = {};
  for (var b = 0; b < vidIds.length; b += 50) {
    try {
      var rr = UrlFetchApp.fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" +
        vidIds.slice(b, b + 50).join(",") + "&key=" + key, { muteHttpExceptions: true });
      var jj = JSON.parse(rr.getContentText());
      var items = jj.items || [];
      for (var it = 0; it < items.length; it++) {
        var sn = items[it].snippet || {};
        if (sn.channelId) channels[sn.channelId] = sn.channelTitle || sn.channelId;
        harvest(sn.description || "", sn.channelTitle || "");
      }
    } catch (e) {}
  }

  // 3. Channel descriptions (channels.list, 50 per call)
  var chIds = Object.keys(channels);
  for (var c2 = 0; c2 < chIds.length; c2 += 50) {
    try {
      var rc = UrlFetchApp.fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&id=" +
        chIds.slice(c2, c2 + 50).join(",") + "&key=" + key, { muteHttpExceptions: true });
      var jc = JSON.parse(rc.getContentText());
      var citems = jc.items || [];
      for (var ci = 0; ci < citems.length; ci++) {
        var cs = citems[ci].snippet || {};
        harvest(cs.description || "", cs.title || "");
      }
    } catch (e2) {}
  }

  // 4. Append NEW Instagram handles to the IG Scan List
  var sh = ss.getSheetByName(IG.scanListTab);
  if (!sh) {
    sh = ss.insertSheet(IG.scanListTab);
    sh.getRange(1, 1, 1, 3).setValues([["Instagram Username", "Category", "Status"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  var existing = {};
  if (sh.getLastRow() >= 2) {
    var evals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var e3 = 0; e3 < evals.length; e3++) existing[String(evals[e3][0]).toLowerCase().replace(/^@/, "")] = 1;
  }
  for (var s2 = 0; s2 < sheets.length; s2++) {
    var inm = sheets[s2].getName();
    var mm = inm.match(/^(.*) IG - Raw$/);
    if (mm) existing[mm[1].toLowerCase()] = 1;
  }
  var rows = [];
  for (var h2 in handles) {
    if (existing[h2]) continue;
    rows.push([h2, "", "Harvested from YT: " + handles[h2]]);
  }
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);

  // 5. Append NEW TikTok handles to the TikTok Handles tab (reference only -
  //    TikTok exposes no open API for scanning third-party creators)
  var tsh = ss.getSheetByName(IGBS.tiktokTab);
  if (!tsh) {
    tsh = ss.insertSheet(IGBS.tiktokTab);
    tsh.getRange(1, 1, 1, 5).setValues([[
      "TikTok Handle", "Profile URL", "Found On (YT channel)", "Date Added", "Notes"
    ]]).setFontWeight("bold");
    tsh.setFrozenRows(1);
  }
  var tExisting = {};
  if (tsh.getLastRow() >= 2) {
    var tvals = tsh.getRange(2, 1, tsh.getLastRow() - 1, 1).getValues();
    for (var t3 = 0; t3 < tvals.length; t3++) {
      tExisting[String(tvals[t3][0]).toLowerCase().replace(/^@/, "")] = 1;
    }
  }
  var today = new Date().toISOString().slice(0, 10);
  var tRows = [];
  for (var t2 in tiktoks) {
    if (tExisting[t2]) continue;
    tRows.push(["@" + t2, "https://www.tiktok.com/@" + t2, tiktoks[t2], today, ""]);
  }
  if (tRows.length) tsh.getRange(tsh.getLastRow() + 1, 1, tRows.length, 5).setValues(tRows);

  return { videos: vidIds.length, channels: chIds.length,
    found: Object.keys(handles).length, added: rows.length,
    ttFound: Object.keys(tiktoks).length, ttAdded: tRows.length };
}

// ---------------------------------------------------------- Brand alias starter pack
// Extends the shared BRAND_ALIASES map at load time (existing entries always win).
// More aliases = sharper attribution: plain-text and inside-hashtag matching only
// works for brands this map knows about.
(function () {
  if (typeof BRAND_ALIASES !== "object" || !BRAND_ALIASES) return;
  var extra = {
    // seen on Rootfor creators
    pac: "PacSun", pacsun: "PacSun", ikea: "IKEA", ikeausa: "IKEA",
    calvinklein: "Calvin Klein", polestar: "Polestar", merrell: "Merrell",
    adidas: "Adidas", airbnb: "Airbnb", fancyfeast: "Fancy Feast",
    drmartens: "Dr. Martens", disneyplus: "Disney+", jins: "JINS",
    brooklinen: "Brooklinen", dropbox: "Dropbox", logitech: "Logitech",
    stanley1913: "Stanley", adobe: "Adobe",
    // apparel / footwear
    nike: "Nike", lululemon: "lululemon", gymshark: "Gymshark", skims: "SKIMS",
    uniqlo: "UNIQLO", zara: "Zara", madewell: "Madewell", everlane: "Everlane",
    allbirds: "Allbirds", newbalance: "New Balance", hoka: "HOKA",
    patagonia: "Patagonia", northface: "The North Face", thenorthface: "The North Face",
    // home
    dyson: "Dyson", ourplace: "Our Place", caraway: "Caraway", hexclad: "HexClad",
    ruggable: "Ruggable", wayfair: "Wayfair", westelm: "West Elm",
    potterybarn: "Pottery Barn", homedepot: "The Home Depot", lowes: "Lowe's",
    // beauty
    sephora: "Sephora", ulta: "Ulta Beauty", glossier: "Glossier",
    rarebeauty: "Rare Beauty", fenty: "Fenty Beauty", fentybeauty: "Fenty Beauty",
    cerave: "CeraVe", olaplex: "Olaplex",
    // gear / wellness
    yeti: "YETI", owala: "Owala", hydroflask: "Hydro Flask", gopro: "GoPro",
    garmin: "Garmin", peloton: "Peloton", whoop: "WHOOP", ouraring: "Oura",
    // digital / subscriptions
    amazon: "Amazon", audible: "Audible", squarespace: "Squarespace",
    skillshare: "Skillshare", betterhelp: "BetterHelp", nordvpn: "NordVPN",
    expressvpn: "ExpressVPN", hellofresh: "HelloFresh", factormeals: "Factor",
    doordash: "DoorDash", ubereats: "Uber Eats",
    // food & drink
    chipotle: "Chipotle", starbucks: "Starbucks", dunkin: "Dunkin'",
    liquidiv: "Liquid I.V.", ag1: "AG1", drinkag1: "AG1", athleticgreens: "AG1",
    kobo: "Kobo", rakutenkobo: "Kobo", soltech: "Soltech", auraframes: "Aura Frames",
    cozyearth: "Cozy Earth", barbour: "Barbour",
    viture: "VITURE", sihoo: "SIHOO", hbada: "Hbada", laifen: "Laifen",
    laifentech: "Laifen", govee: "Govee", ringconn: "RingConn",
    secretlab: "Secretlab", dreo: "DREO", oralb: "Oral-B",
    gillette: "Gillette", volvo: "Volvo", raybanmeta: "Ray-Ban Meta",
    fellowproducts: "Fellow"
  };
  for (var k in extra) { if (!BRAND_ALIASES[k]) BRAND_ALIASES[k] = extra[k]; }
})();


// ------------------------------------------------------------------ IG Rebook Radar (repeat partners)

/** Roll up every brand x creator pair across Brand Collabs, IG Brand
 * Partnerships and all "* IG - Raw" tabs. A creator a brand keeps paying
 * (2+ verified deals, 30+ days apart) is a REPEAT PARTNER - the strongest
 * public signal the first post drove sales. Reads the sheet only; no API
 * calls, no hashtag credits. */
var IGRR = { tabName: "IG Rebook Radar", minGapDays: 30, maxEvidence: 3 };

function buildIgRebookRadar() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var groups = igRebookGroups_(null);
  var rows = [], repeats = 0, multi = 0;
  for (var k in groups) {
    var g = groups[k];
    if (g.posts < 2) continue;
    var span = (g.minMs && g.maxMs) ? Math.round((g.maxMs - g.minMs) / 86400000) : 0;
    var isRepeat = g.verified >= 2 && span >= IGRR.minGapDays;
    if (isRepeat) repeats++; else multi++;
    rows.push([g.brand, "@" + g.creator,
      isRepeat ? "REPEAT PARTNER" : "Multi-post (single campaign?)",
      g.posts, g.verified,
      g.minMs ? igRrDate_(g.minMs) : "", g.maxMs ? igRrDate_(g.maxMs) : "",
      span, g.followers || "", g.eng || "",
      g.srcs.join(", ")].concat(g.urls.slice(0, IGRR.maxEvidence)));
  }
  rows.sort(function (a, b) {
    var ra = a[2] === "REPEAT PARTNER" ? 0 : 1, rb = b[2] === "REPEAT PARTNER" ? 0 : 1;
    if (ra !== rb) return ra - rb;
    if (b[4] !== a[4]) return b[4] - a[4];
    return b[3] - a[3];
  });
  var HEAD = ["Brand", "Creator", "Status", "Posts", "Verified deals", "First seen",
    "Last seen", "Span (days)", "Followers", "Eng %", "Sources",
    "Evidence 1", "Evidence 2", "Evidence 3"];
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sh = ss.getSheetByName(IGRR.tabName);
  if (!sh) sh = ss.insertSheet(IGRR.tabName);
  sh.clear();
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
  sh.setFrozenRows(1);
  if (rows.length) {
    var norm = rows.map(function (r) { while (r.length < HEAD.length) r.push(""); return r.slice(0, HEAD.length); });
    var rng = sh.getRange(2, 1, norm.length, HEAD.length);
    rng.setNumberFormat("@");
    rng.setValues(norm);
    sh.getRange(2, 4, norm.length, 2).setNumberFormat("0");
  }
  var msg = "Creator x brand pairs with 2+ IG posts: " + rows.length +
    "\n\nREPEAT PARTNERS (2+ verified deals, " + IGRR.minGapDays + "+ days apart): " + repeats +
    "\nMulti-post inside one window: " + multi +
    "\n\nRepeat partners are creators a brand keeps re-booking - the strongest public evidence the posts drive sales. They sort to the top of \"" + IGRR.tabName + "\".";
  if (ui) ui.alert("IG Rebook Radar", msg, ui.ButtonSet.OK); else Logger.log(msg);
  return { pairs: rows.length, repeats: repeats, multi: multi };
}

/** Gather brand x creator events from all IG sources. brandKeyFilter (normalized) optional. */
function igRebookGroups_(brandKeyFilter) {
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var groups = {};
  function keyOf(s) { return String(s || "").toLowerCase().replace(/\s*\(\?\)\s*$/, "").replace(/[^a-z0-9]/g, ""); }
  function toMs(x) { if (!x) return 0; if (x instanceof Date) return x.getTime(); var d = new Date(String(x)); var t = d.getTime(); return isNaN(t) ? 0 : t; }
  function add(brand, creator, conf, msVal, url, src, followers, eng) {
    var bk = keyOf(brand);
    var ck = String(creator || "").toLowerCase().replace(/^@/, "").trim();
    if (!bk || !ck || bk.indexOf("unknown") === 0) return;
    if (brandKeyFilter && bk !== brandKeyFilter) return;
    var k = bk + "|" + ck;
    var g = groups[k];
    if (!g) { g = groups[k] = { brand: String(brand).replace(/\s*\(\?\)\s*$/, ""), creator: ck, posts: 0, verified: 0, minMs: 0, maxMs: 0, urls: [], seen: {}, srcs: [], followers: "", eng: "" }; }
    var u = String(url || "").trim();
    if (u && g.seen[u]) return;
    if (u) { g.seen[u] = 1; g.urls.push(u); }
    g.posts++;
    if (conf === "High" || conf === "Medium") g.verified++;
    if (msVal) { if (!g.minMs || msVal < g.minMs) g.minMs = msVal; if (msVal > g.maxMs) g.maxMs = msVal; }
    if (g.srcs.indexOf(src) < 0) g.srcs.push(src);
    if (followers && !g.followers) g.followers = followers;
    if (eng && !g.eng) g.eng = eng;
  }
  var sh = ss.getSheetByName(IGBS.brandCollabTab || "Brand Collabs");
  if (sh && sh.getLastRow() > 1) {
    var v1 = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
    for (var i = 0; i < v1.length; i++) {
      add(v1[i][1], v1[i][2], String(v1[i][6]), toMs(v1[i][8]) || toMs(v1[i][0]), v1[i][10], "Brand feed", v1[i][3], v1[i][4]);
    }
  }
  sh = ss.getSheetByName(IGBS.tabName);
  if (sh && sh.getLastRow() > 1) {
    var v2 = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
    for (var j = 0; j < v2.length; j++) {
      add(v2[j][1], v2[j][3], String(v2[j][7]), toMs(v2[j][8]) || toMs(v2[j][0]), v2[j][10], "Brand search", v2[j][4], v2[j][5]);
    }
  }
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var nm = sheets[s].getName();
    if (!/ IG - Raw$/.test(nm)) continue;
    var creator = nm.replace(/ IG - Raw$/, "");
    var lr = sheets[s].getLastRow();
    if (lr < 2) continue;
    var v3 = sheets[s].getRange(2, 1, lr - 1, 7).getValues();
    for (var q = 0; q < v3.length; q++) {
      add(v3[q][1], creator, String(v3[q][2]), toMs(v3[q][6]) || toMs(v3[q][0]), v3[q][5], "Creator scan");
    }
  }
  return groups;
}

function igRrDate_(msVal) {
  return new Date(msVal).toISOString().slice(0, 10);
}

/** Repeat-partner lines for ONE brand (used in scan/search alerts). */
/** Repeat-partner lines for ONE brand (used in scan/search alerts).
 *  Fast path: read the already-built IG Rebook Radar tab (one sheet read).
 *  Recomputing from every raw tab took ~20s on a 300-tab sheet. */
function igRepeatSummaryForBrand_(brand) {
  var bk = String(brand || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!bk) return "";
  try {
    var ss = SpreadsheetApp.openById(getConfig().sheetId);
    var sh = ss.getSheetByName(IGRR.tabName);
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
      var out = [];
      for (var i = 0; i < v.length && out.length < 6; i++) {
        if (String(v[i][2]) !== "REPEAT PARTNER") continue;
        var rowKey = String(v[i][0]).toLowerCase().replace(/\s*\(\?\)\s*$/, "").replace(/[^a-z0-9]/g, "");
        if (rowKey !== bk) continue;
        out.push(String(v[i][1]) + " - " + v[i][4] + " verified deals over " + v[i][7] + " days");
      }
      return out.join("\n");   // radar exists: trust it, stay fast
    }
  } catch (eFast) {}
  // No radar tab yet - fall back to the full (slow) computation once.
  var groups = igRebookGroups_(bk);
  var lines = [];
  for (var k in groups) {
    var g = groups[k];
    var span = (g.minMs && g.maxMs) ? Math.round((g.maxMs - g.minMs) / 86400000) : 0;
    if (g.verified >= 2 && span >= IGRR.minGapDays) {
      lines.push("@" + g.creator + " - " + g.verified + " verified deals over " + span + " days");
    }
  }
  lines.sort();
  return lines.slice(0, 6).join("\n");
}

/** Repeat block for several brand handles at once (Scan brand account alert). */
function igRepeatAlertBlock_(brands) {
  var out = "";
  try {
    for (var i = 0; i < brands.length; i++) {
      var s = igRepeatSummaryForBrand_(brands[i]);
      if (s) out += "\n\nREPEAT PARTNERS for @" + brands[i] + " (booked 2+ times - likely driving sales):\n" + s;
    }
  } catch (e) {}
  return out;
}


// ------------------------------------------------------------------ Snowball: queue discovered creators

/** Menu action: every creator handle surfaced by brand-side scans/searches
 * (Brand Collabs + IG Brand Partnerships) that is NOT yet on the IG Scan
 * List gets queued for batch scanning. Their scans then reveal every other
 * brand that books them repeatedly, so the Rebook Radar grows past what
 * was already searched. Optional size filter finds "upcoming" creators. */
function igQueueDiscoveredCreators() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var filters = null;
  if (ui) {
    var resp = ui.prompt("Queue discovered creators (snowball)",
      "Finds every creator handle your brand scans and brand searches surfaced that is not yet on the IG Scan List, and queues them for batch scanning.\n\n" +
      "Optional size filter, e.g. \"10k-500k\" or \"under 250k\" - leave blank for all. When a filter is set, creators with unknown size are skipped.",
      ui.ButtonSet.OK_CANCEL);
    if (resp.getSelectedButton() !== ui.Button.OK) return;
    var t = resp.getResponseText().trim();
    filters = t ? igParseFilters_(t) : null;
  }
  var res = igQueueDiscoveredCore_(filters);
  var msg = "Discovered creator handles: " + res.found +
    "\nAlready on the Scan List or scanned: " + res.existing +
    (res.filtered ? "\nSkipped - outside your size filter: " + res.filtered : "") +
    (res.unknown ? "\nSkipped - size unknown (filter set): " + res.unknown : "") +
    "\n\nNEW creators queued: " + res.added +
    "\n\nNext: IG Scanner > Scan IG batch list (or Auto-scan remaining hourly)." +
    "\nAfter they scan, run IG Rebook Radar again - each new creator brings their full brand history, so the radar snowballs outward.";
  if (ui) ui.alert("Queue discovered creators", msg, ui.ButtonSet.OK); else Logger.log(msg);
  return res;
}

function igQueueDiscoveredCore_(filters) {
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var cand = {};
  function addCand(h, followers) {
    h = String(h || "").toLowerCase().replace(/^@/, "").trim();
    if (!h || h.length < 2 || /[^a-z0-9._]/.test(h)) return;
    if (!cand[h]) cand[h] = { followers: null };
    var f = parseInt(String(followers || "").replace(/[^0-9]/g, ""), 10);
    if (f && (!cand[h].followers || f > cand[h].followers)) cand[h].followers = f;
  }
  var sh = ss.getSheetByName(IGBS.brandCollabTab || "Brand Collabs");
  if (sh && sh.getLastRow() > 1) {
    var v1 = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    for (var i = 0; i < v1.length; i++) addCand(v1[i][2], v1[i][3]);
  }
  sh = ss.getSheetByName(IGBS.tabName);
  if (sh && sh.getLastRow() > 1) {
    var v2 = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
    for (var j = 0; j < v2.length; j++) addCand(v2[j][3], v2[j][4]);
  }
  var existing = {};
  var sl = ss.getSheetByName(IG.scanListTab);
  if (!sl) {
    sl = ss.insertSheet(IG.scanListTab);
    sl.getRange(1, 1, 1, 3).setValues([["Instagram Username", "Category", "Status"]]).setFontWeight("bold");
    sl.setFrozenRows(1);
  }
  if (sl.getLastRow() > 1) {
    var e1 = sl.getRange(2, 1, sl.getLastRow() - 1, 1).getValues();
    for (var k = 0; k < e1.length; k++) existing[String(e1[k][0]).toLowerCase().replace(/^@/, "").trim()] = 1;
  }
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var mm = sheets[s].getName().match(/^(.*) IG - Raw$/);
    if (mm) existing[mm[1].toLowerCase().trim()] = 1;
  }
  var found = 0, exist = 0, filtered = 0, unknown = 0, rows = [];
  for (var h in cand) {
    found++;
    if (existing[h]) { exist++; continue; }
    if (filters && (filters.fMin != null || filters.fMax != null)) {
      var f = cand[h].followers;
      if (!f) { unknown++; continue; }
      if (filters.fMin != null && f < filters.fMin) { filtered++; continue; }
      if (filters.fMax != null && f > filters.fMax) { filtered++; continue; }
    }
    rows.push([h, "", ""]);
  }
  if (rows.length) sl.getRange(sl.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  return { found: found, existing: exist, filtered: filtered, unknown: unknown, added: rows.length };
}


// ------------------------------------------------------------------ Snowball auto-pilot

/** Hourly background loop: queue newly discovered creators, then scan a
 * chunk of the IG Scan List. Brand searches feed it; it never stops on
 * its own (new discoveries revive the queue). Rate-limit safe via igBatchRun_. */
var IGSNOW = { triggerFn: "igSnowballTick" };

function igSnowballTick() {
  var q = igQueueDiscoveredCore_(null);
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sheet = ss.getSheetByName(IG.scanListTab);
  var res = (sheet && sheet.getLastRow() >= 2) ? igBatchRun_(sheet, IGBATCH.perRun) : null;
  var refreshed = 0;
  if (res && !res.remaining && !res.limited && !q.added) refreshed = igRefreshStalest_(sheet, 4);
  Logger.log("Snowball tick: queued " + q.added + " new creator(s)" + (res ? "; scan pass done (remaining: " + res.remaining + (res.limited ? ", rate limited" : "") + ")" : "; nothing to scan"));
  return { queued: q.added, scan: res };
}

function igStartSnowball() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  igStopSnowballCore_();
  ScriptApp.newTrigger(IGSNOW.triggerFn).timeBased().everyHours(1).create();
  var msg = "Snowball auto-pilot is ON - it runs hourly in the background.\n\n" +
    "Each hour it:\n" +
    "1. Queues any NEW creators your brand searches and brand-account scans discovered\n" +
    "2. Scans up to " + IGBATCH.perRun + " pending creators (their full partnership history lands in the sheet)\n\n" +
    "Your only job: run Brand search / Scan brand account whenever a brand interests you. " +
    "New creators and everyone THEY work with populate on their own. " +
    "Rebuild Opportunities / IG Rebook Radar whenever you want the fresh rollup.\n\n" +
    "Stop anytime: More tools > Stop snowball auto-pilot.";
  if (ui) ui.alert("Snowball auto-pilot", msg, ui.ButtonSet.OK); else Logger.log(msg);
}

function igStopSnowball() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var n = igStopSnowballCore_();
  var msg = n ? "Snowball auto-pilot stopped." : "Snowball auto-pilot was not running.";
  if (ui) ui.alert("Snowball auto-pilot", msg, ui.ButtonSet.OK); else Logger.log(msg);
}

function igStopSnowballCore_() {
  var ts = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === IGSNOW.triggerFn) { ScriptApp.deleteTrigger(ts[i]); n++; }
  }
  return n;
}


/** Idle-capacity freshness rotation: when the scan list is fully done and no
 * new creators were queued, clear Status on the next K rows (rotating pointer)
 * so they re-scan on the following tick. Full roster refreshes every ~1-2 days. */
function igRefreshStalest_(sheet, k) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var n = sheet.getLastRow() - 1;
  var props = PropertiesService.getScriptProperties();
  var ptr = Number(props.getProperty("IGSNOW_ROT") || 0) % n;
  var st = sheet.getRange(2, 3, n, 1).getValues();
  var cleared = 0, i = 0;
  for (; i < n && cleared < k; i++) {
    var row = (ptr + i) % n;
    if (/^OK\b/.test(String(st[row][0] || ""))) {
      sheet.getRange(2 + row, 3).setValue("");
      cleared++;
    }
  }
  props.setProperty("IGSNOW_ROT", String((ptr + i) % n));
  return cleared;
}


// ------------------------------------------------------------------ UGC Finder (nano/micro casting)

/** Bio-scan every creator the engine has discovered, via the OFFICIAL
 * Business Discovery API (not scraping): flags UGC creators, city matches
 * (default NYC + LA), and pulls emails straight out of bios. Ledger tab is
 * resumable - each run checks up to perRun new handles, rate-limit safe. */
var IGUGC = {
  tabName: "UGC Finder",
  perRun: 60,
  defaultCities: "NYC, New York, Brooklyn, Manhattan, Queens, Long Island, LA, Los Angeles, West Hollywood, Long Beach, Orange County, SoCal, Santa Monica",
  defaultSize: "1k-25k"
};

function igFindUgcCreators() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  var cities = IGUGC.defaultCities, sizeTxt = IGUGC.defaultSize;
  if (ui) {
    var r1 = ui.prompt("Find UGC creators (bio scan)",
      "Checks the bio of every creator the engine has discovered (scan list, brand scans, searches) via the official API - flags UGC creators, city matches, and grabs booking emails from bios.\n\n" +
      "City keywords (comma-separated), or leave blank for the default NYC + LA set:\n" + IGUGC.defaultCities,
      ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    if (r1.getResponseText().trim()) cities = r1.getResponseText().trim();
    var r2 = ui.prompt("Size range",
      "Follower range (default " + IGUGC.defaultSize + " = nano/micro, the $100-250/post tier). e.g. \"1k-25k\", \"under 50k\", blank = default.",
      ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;
    if (r2.getResponseText().trim()) sizeTxt = r2.getResponseText().trim();
  }
  var res = igUgcScanCore_(cities, igParseFilters_(sizeTxt));
  var msg = "Candidates known to the engine: " + res.total +
    "\nAlready checked: " + res.done +
    "\nChecked this run: " + res.checked + (res.limited ? " (stopped - Meta rate limit, rerun in ~1h)" : "") +
    "\n\nThis run: in size range " + res.inSize + ", UGC in bio " + res.ugc + ", city match " + res.city + ", email in bio " + res.email +
    "\n\nSee \"" + IGUGC.tabName + "\" - UGC + city + email rows sort to the top." +
    (res.total - res.done - res.checked > 0 ? "\n\nRUN AGAIN to keep going (" + (res.total - res.done - res.checked) + " handles left)." : "");
  if (ui) ui.alert("UGC Finder", msg, ui.ButtonSet.OK); else Logger.log(msg);
  return res;
}

function igUgcScanCore_(cityCsv, filters) {
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var c = igGetCreds_();
  var cityWords = String(cityCsv || "").split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  var cand = {};
  function add(h) {
    h = String(h || "").toLowerCase().replace(/^@/, "").trim();
    if (h && h.length > 1 && !/[^a-z0-9._]/.test(h)) cand[h] = 1;
  }
  var sl = ss.getSheetByName(IG.scanListTab);
  if (sl && sl.getLastRow() > 1) sl.getRange(2, 1, sl.getLastRow() - 1, 1).getValues().forEach(function (r) { add(r[0]); });
  var bc = ss.getSheetByName(IGBS.brandCollabTab || "Brand Collabs");
  if (bc && bc.getLastRow() > 1) bc.getRange(2, 3, bc.getLastRow() - 1, 1).getValues().forEach(function (r) { add(r[0]); });
  var bp = ss.getSheetByName(IGBS.tabName);
  if (bp && bp.getLastRow() > 1) bp.getRange(2, 4, bp.getLastRow() - 1, 1).getValues().forEach(function (r) { add(r[0]); });
  ss.getSheets().forEach(function (s) { var m = s.getName().match(/^(.*) IG - Raw$/); if (m) add(m[1]); });
  var HEAD = ["Handle", "Followers", "Eng %", "UGC in bio", "City match", "Email", "Bio (start)", "Profile", "Checked", "Status / Notes"];
  var sh = ss.getSheetByName(IGUGC.tabName);
  if (!sh) { sh = ss.insertSheet(IGUGC.tabName); sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold"); sh.setFrozenRows(1); }
  var doneMap = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { doneMap[String(r[0]).toLowerCase().replace(/^@/, "")] = 1; });
  var handles = Object.keys(cand);
  var rows = [], checked = 0, limited = false;
  var stats = { inSize: 0, ugc: 0, city: 0, email: 0 };
  for (var i = 0; i < handles.length && checked < IGUGC.perRun; i++) {
    var h = handles[i];
    if (doneMap[h]) continue;
    checked++;
    var bio = "", fol = "", eng = "", status = "OK";
    try {
      var f = encodeURIComponent("business_discovery.username(" + h + "){followers_count,biography,media.limit(12){like_count,comments_count}}");
      var j = igGraph_(c.igId + "?fields=" + f + "&access_token=" + encodeURIComponent(c.token));
      var bd = j && j.business_discovery;
      if (bd) {
        fol = bd.followers_count;
        bio = String(bd.biography || "");
        var med = (bd.media && bd.media.data) || [];
        var sum = 0, n = 0;
        for (var q = 0; q < med.length; q++) { var lk = med[q].like_count, cm = med[q].comments_count; if (lk != null || cm != null) { sum += (lk || 0) + (cm || 0); n++; } }
        if (n && fol) eng = String(Math.round((sum / n) / fol * 10000) / 100) + "%";
      } else status = "not a business/creator account";
    } catch (e) {
      var m0 = String(e.message || e);
      if (/#4\b|request limit|rate limit/i.test(m0)) { limited = true; checked--; break; }
      status = "error: " + m0.slice(0, 60);
    }
    var bioL = bio.toLowerCase();
    var isUgc = /\bugc\b|user[- ]generated|content creator/.test(bioL);
    var cityHit = "";
    for (var cw = 0; cw < cityWords.length; cw++) {
      var w0 = cityWords[cw];
      var hit = w0.length <= 3 ? new RegExp("\\b" + w0 + "\\b", "i").test(bio) : bioL.indexOf(w0) >= 0;
      if (hit) { cityHit = w0; break; }
    }
    var em = bio.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    var inSize = true;
    if (filters && fol !== "" && fol != null) {
      if (filters.fMin != null && fol < filters.fMin) inSize = false;
      if (filters.fMax != null && fol > filters.fMax) inSize = false;
    }
    if (fol !== "" && fol != null && inSize) stats.inSize++;
    if (isUgc) stats.ugc++;
    if (cityHit) stats.city++;
    if (em) stats.email++;
    rows.push(["@" + h, fol, eng, isUgc ? "YES" : "", cityHit, em ? em[0] : "", bio.slice(0, 160).replace(/\n/g, " "), "https://instagram.com/" + h, new Date().toISOString().slice(0, 10), status + (inSize ? "" : " - outside size range")]);
  }
  if (rows.length) {
    var rng = sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEAD.length);
    rng.setNumberFormat("@");
    rng.setValues(rows);
  }
  if (sh.getLastRow() > 2) {
    var all = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues();
    all.sort(function (a, b) {
      function sc(r) { return (r[3] === "YES" ? 4 : 0) + (r[4] ? 2 : 0) + (r[5] ? 1 : 0) - (String(r[9]).indexOf("outside") >= 0 ? 8 : 0); }
      return sc(b) - sc(a);
    });
    sh.getRange(2, 1, all.length, HEAD.length).setValues(all);
  }
  return { total: handles.length, done: Object.keys(doneMap).length, checked: checked, limited: limited, inSize: stats.inSize, ugc: stats.ugc, city: stats.city, email: stats.email };
}
