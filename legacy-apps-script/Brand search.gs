/**
 * ============================================================
 * ROOTFOR — Brand Partnership Search (v1.2)
 * ============================================================
 * FULL REPLACEMENT for BrandSearch.gs. Select-all, paste over, save.
 *
 * The reverse lookup: type a brand (or a list of adjacent brands), get the
 * creators they've actually PAID — and who they've REBOOKED.
 *
 * v1.2 CHANGES (from v1.1), tuned on the Cirkul/Air Up/Waterdrop/Liquid IV run:
 * - DEPTH PAGING: each search angle now follows pagination.
 *   pagesPerSearch (default 3) -> up to 150 candidates per angle instead
 *   of 50. Each page bills 1 call against the ~100 searches/day budget,
 *   so one brand = angles(2) x pages(3) = 6 calls. The prompt shows the
 *   projected cost before running.
 * - BRAND SYNTAX for messy names, right in the prompt:
 *     Liquid IV | Liquid I.V.        pipe = alias spellings (extra
 *                                    searches, same brand in results)
 *     Waterdrop = waterdrop.com      equals = pinned domain. Kills
 *                                    homonyms: a video whose brand-ish
 *                                    domain is waterdropfilter.com gets
 *                                    REJECTED when waterdrop.com is pinned
 *                                    (the BOS Water problem). The domain
 *                                    also verifies as evidence, so
 *                                    drinkcirkul.com-style sponsor links
 *                                    count for a pinned Cirkul.
 *   Combine both:  Liquid IV | Liquid I.V. = liquidiv.com
 * - Accurate search accounting: the completion popup reports actual
 *   API search calls (cache hits are free and not counted).
 *
 * v1.1 CHANGES (from v1.0), tuned on the Cirkul run:
 * - SUBSCRIBER FLOOR: minSubs (default 10,000) hides micro/UGC channels.
 *   The Cirkul results were dominated by 5-2,000-sub gifting recipients —
 *   real spend signal lives above the floor. Set to 0 to see everything.
 * - PAID vs SEEDING SPLIT: rows are only "Verified" when the video carries
 *   actual paid language (sponsored by / paid partnership / use code /
 *   brought to you by / #ad ...). Gifted/PR/"thanks for sending" and
 *   hashtag-only matches are classed "Gifted / seeding / UGC" and EXCLUDED
 *   by default (includeSeeding: true to keep them).
 * - FUZZY BRAND KEYS: "Cirkul" now also matches evidence extracted as
 *   "drinkcirkul" / "cirkul.com" (compacted containment, min 5 chars), so
 *   handle-style sponsor links verify properly.
 * - REBOOK RADAR: new rollup tab aggregating the whole Brand Partnerships
 *   tab per brand x creator: video count, first/last seen, day span, and
 *   Rebooked = Yes when 2+ videos land 30+ days apart. Rebooked + Verified
 *   rows are where a brand has proven, repeated budget — your warmest
 *   adjacency targets. Rebuilt automatically after every search.
 *
 * Same dependencies as v1.0: Code.gs (getConfig, validateConfig,
 * extractBrands, normalizeBrandName) and Discovery.gs (getScanRegistryIds,
 * getScannedCreatorNames, normalizeCreatorKey).
 * Menu line (already added if you installed v1.0):
 *     .addItem("Search brand partnerships", "searchBrandPartnerships")
 * ============================================================
 */

var BRAND_SEARCH = {
  tabName: "Brand Partnerships",
  rebookTabName: "Rebook Radar",
  monthsBack: 18,           // how far back to search
  resultsPerSearch: 50,     // max per search.list page
  pagesPerSearch: 3,        // pages per angle; each page = 1 search call
  maxBrandsPerRun: 10,
  minSubs: 10000,           // hide channels below this (0 = no floor)
  includeSeeding: false,    // true = keep gifted/PR/UGC/hashtag-only rows
  rebookMinVideos: 2,       // rebook = at least this many videos...
  rebookMinSpanDays: 30,    // ...spread over at least this many days
  cacheHours: 72,
};

var BRAND_SEARCH_HEADERS = [
  "Brand", "Creator", "Handle", "Channel URL", "Subscribers",
  "Match Type", "Evidence", "Video Title", "Video URL", "Published",
  "Views", "YT Disclosure", "Already Scanned", "Date Searched"
];

var REBOOK_HEADERS = [
  "Brand", "Creator", "Handle", "Channel URL", "Subscribers",
  "Videos", "First Seen", "Last Seen", "Span (days)", "Rebooked",
  "Best Match", "Example Video", "Already Scanned"
];

// Paid-deal language (money changed hands) vs seeding language (free product).
var BRAND_PAID_RE = /sponsored\s+by|paid\s+partnership|paid\s+promotion|brought\s+to\s+you\s+by|presented\s+by|in\s+partnership\s+with|partnered\s+with|use\s+(?:my\s+|the\s+)?code|promo\s+code|discount\s+code|#ad\b|#sponsored\b|for\s+sponsoring/i;
var BRAND_SEED_RE = /\bsent\s+(?:me|us|this|over)|for\s+sending|gifted|provided\s+by|supplied\s+by|courtesy\s+of|pr\s+(?:package|box)|#gifted/i;


// ── ENTRY POINT (menu: "Search brand partnerships") ─────────

var brandSearchCalls_ = 0; // actual API search calls this run (cache hits free)

function searchBrandPartnerships() {
  var html = HtmlService.createHtmlOutputFromFile("BrandSearchDialog")
    .setWidth(620).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, "Search brand partnerships");
}

/** Server for the dialog: brand suggestions from your own database, best first. */
function bsGetBrandSuggestions() {
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var out = [], seen = {};
  function grab(tab, brandCol, dealCol) {
    var sh = ss.getSheetByName(tab);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(brandCol, dealCol)).getValues();
    for (var i = 0; i < v.length; i++) {
      var n = String(v[i][brandCol - 1]).trim().replace(/\s*\(\?\)\s*$/, "");
      var k = n.toLowerCase();
      if (!n || seen[k] || k.indexOf("(unknown") >= 0) continue;
      seen[k] = 1;
      out.push({ n: n, d: Number(v[i][dealCol - 1]) || 0 });
    }
  }
  grab("Opportunities", 1, 3);
  grab("Brand Leaderboard", 1, 2);
  out.sort(function (a, b) { return b.d - a.d; });
  return out.slice(0, 4000);
}

/** Server for the dialog: run the search, return a plain-text summary. */
function bsRunBrandSearch(inputText) {
  var config = getConfig();
  validateConfig(config);
  var entries = parseBrandEntries_(String(inputText || "")).slice(0, BRAND_SEARCH.maxBrandsPerRun);
  if (entries.length === 0) return "No brands given.";
  brandSearchCalls_ = 0;
  var totals = { videosChecked: 0, matches: 0, creators: {}, filteredSubs: 0, filteredSeeding: 0 };
  var allRows = [];
  var errs = [];
  for (var i = 0; i < entries.length; i++) {
    try {
      var r = runBrandPartnershipSearch_(config, entries[i]);
      allRows = allRows.concat(r.rows);
      totals.videosChecked += r.videosChecked;
      totals.matches += r.rows.length;
      totals.filteredSubs += r.filteredSubs;
      totals.filteredSeeding += r.filteredSeeding;
      for (var c in r.creators) totals.creators[c] = true;
    } catch (e) {
      errs.push(entries[i].brand + ": " + String(e.message).slice(0, 80));
      Logger.log("Brand search failed for " + entries[i].brand + ": " + e.message);
    }
  }
  var brandNames = entries.map(function (en) { return en.brand; });
  writeBrandPartnershipsTab_(config, brandNames, allRows);
  buildRebookRadar_(config);
  return "Done. " + entries.length + " brand(s), " + brandSearchCalls_ + " search calls used.\n" +
    totals.matches + " partnership videos kept across " + Object.keys(totals.creators).length + " creators " +
    "(filtered: " + totals.filteredSeeding + " gifted/UGC, " + totals.filteredSubs + " below the sub floor).\n" +
    "See \"" + BRAND_SEARCH.tabName + "\" and \"" + BRAND_SEARCH.rebookTabName + "\" - Rebooked = Yes means proven repeat budget." +
    (errs.length ? "\nErrors: " + errs.join(" | ") : "");
}

/**
 * "Cirkul = drinkcirkul.com, Liquid IV | Liquid I.V." ->
 * [{brand, aliases:[], domain}, {brand, aliases:["Liquid I.V."], domain:""}]
 * Pure — unit-testable.
 */
function parseBrandEntries_(text) {
  return (text || "").split(",").map(function(chunk) {
    var domain = "";
    var eq = chunk.indexOf("=");
    if (eq > -1) {
      domain = chunk.substring(eq + 1).trim().toLowerCase()
        .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      chunk = chunk.substring(0, eq);
    }
    var names = chunk.split("|")
      .map(function(n) { return n.trim(); })
      .filter(function(n) { return n.length > 1; });
    if (names.length === 0) return null;
    return { brand: names[0], aliases: names.slice(1), domain: domain };
  }).filter(function(e) { return e !== null; });
}


// ── SEARCH + VERIFY ONE BRAND ───────────────────────────────

function runBrandPartnershipSearch_(config, entry) {
  var brand = entry.brand;
  var allNames = [brand].concat(entry.aliases || []);

  // Accepted brand keys: every spelling, plus the pinned domain's first label
  // ("drinkcirkul.com" -> "drinkcirkul" verifies as evidence).
  var targetKeys = allNames.map(function(n) {
    return compactBrandKey_(normalizeBrandName(n));
  });
  if (entry.domain) {
    var domLabel = compactBrandKey_(entry.domain.split(".")[0]);
    if (domLabel && targetKeys.indexOf(domLabel) === -1) targetKeys.push(domLabel);
  }
  var brandRes = allNames.map(function(n) {
    return new RegExp(
      n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "i");
  });

  // 1. Two angles per spelling; dedupe video IDs across all of them.
  var videoIds = {};
  var queries = [];
  for (var n = 0; n < allNames.length; n++) {
    queries.push({ q: '"' + allNames[n] + '"', paidOnly: true });
    if (n === 0) queries.push({ q: '"' + allNames[n] + '" sponsored', paidOnly: false });
  }
  for (var qi = 0; qi < queries.length; qi++) {
    var items;
    try {
      items = brandSearchVideosCached_(config, queries[qi].q, queries[qi].paidOnly);
    } catch (e) {
      Logger.log("  search failed (" + queries[qi].q + "): " + e.message);
      continue;
    }
    for (var j = 0; j < items.length; j++) {
      var vid = items[j].id && items[j].id.videoId;
      if (vid) videoIds[vid] = true;
    }
    Utilities.sleep(100);
  }

  var vids = Object.keys(videoIds);
  var rows = [];
  var creators = {};
  var channelIds = {};
  var filteredSeeding = 0;

  // 2. Full details in batches of 50, then verify each video.
  for (var v = 0; v < vids.length; v += 50) {
    var batch = vids.slice(v, v + 50);
    var url = "https://www.googleapis.com/youtube/v3/videos"
      + "?key=" + config.ytApiKey
      + "&id=" + batch.join(",")
      + "&part=snippet,statistics,paidProductPlacementDetails";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) continue;
    var items = JSON.parse(resp.getContentText()).items || [];

    for (var k = 0; k < items.length; k++) {
      var video = items[k];
      var sn = video.snippet || {};
      var flag = !!(video.paidProductPlacementDetails
        && video.paidProductPlacementDetails.hasPaidProductPlacement);

      var match = classifyBrandVideo_(targetKeys, brandRes, sn, flag, entry.domain);
      if (!match) continue;
      if (match.rank >= 3 && !BRAND_SEARCH.includeSeeding) { filteredSeeding++; continue; }

      creators[sn.channelId] = true;
      channelIds[sn.channelId] = true;
      rows.push({
        brand: brand,
        channelId: sn.channelId,
        creator: sn.channelTitle || sn.channelId,
        matchType: match.type,
        matchRank: match.rank,
        evidence: match.evidence,
        videoTitle: sn.title || "",
        videoUrl: "https://www.youtube.com/watch?v=" + video.id,
        published: sn.publishedAt ? sn.publishedAt.substring(0, 10) : "",
        views: Number((video.statistics || {}).viewCount || 0),
        flag: flag,
      });
    }
    Utilities.sleep(80);
  }

  // 3. Hydrate channels, then apply the subscriber floor.
  var profiles = getChannelProfilesBatch_(config, Object.keys(channelIds));
  var kept = [];
  var filteredSubs = 0;
  for (var r = 0; r < rows.length; r++) {
    var p = profiles[rows[r].channelId] || {};
    var hidden = !!p.hidden;
    var subs = p.subs || 0;
    if (BRAND_SEARCH.minSubs > 0 && !hidden && subs < BRAND_SEARCH.minSubs) {
      filteredSubs++;
      continue;
    }
    rows[r].handle = p.handle || "";
    rows[r].subs = hidden ? "hidden" : subs;
    rows[r].channelUrl = "https://www.youtube.com/channel/" + rows[r].channelId;
    kept.push(rows[r]);
  }

  Logger.log("Brand '" + brand + "': " + vids.length + " candidates -> "
    + kept.length + " kept (" + filteredSeeding + " seeding, "
    + filteredSubs + " sub-floor filtered)");

  return {
    rows: kept, videosChecked: vids.length, creators: creators,
    filteredSubs: filteredSubs, filteredSeeding: filteredSeeding,
  };
}

/** "Ridge Wallet" -> "ridgewallet"; used for containment matching. */
function compactBrandKey_(name) {
  return (name || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Target matches extracted key exactly, or by containment when >= 5 chars
 *  ("cirkul" inside "drinkcirkul"; "ridgewallet" vs "ridge" both ways). */
function brandKeyMatches_(targetCompact, extractedCompact) {
  if (!targetCompact || !extractedCompact) return false;
  if (targetCompact === extractedCompact) return true;
  if (targetCompact.length >= 5 && extractedCompact.indexOf(targetCompact) > -1) return true;
  if (extractedCompact.length >= 5 && targetCompact.indexOf(extractedCompact) > -1) return true;
  return false;
}

/**
 * Decide whether one video is a real partnership with the target brand.
 * Returns { type, rank, evidence } or null.
 *   rank 0  Verified + YT disclosure     paid language + evidence + flag
 *   rank 1  Verified sponsor evidence    paid language + evidence
 *   rank 2  YT disclosure + paid mention flag + brand named + paid language
 *   rank 3  Gifted / seeding / UGC       evidence or flagged mention, but
 *                                        only seeding/hashtag signals
 * v1.2: targetKeys/brandRes are ARRAYS (brand + aliases + pinned-domain
 * label); pinnedDomain enables homonym rejection.
 * Pure logic on top of extractBrands/normalizeBrandName — unit-testable.
 */
function classifyBrandVideo_(targetKeys, brandRes, snippet, flag, pinnedDomain) {
  var title = snippet.title || "";
  var desc = snippet.description || "";
  var fullText = title + "\n" + desc + "\n" + (snippet.tags || []).join(" ");

  // Homonym rejection: if a domain is pinned and this video's brand-looking
  // domains all point somewhere else (waterdropfilter.com when
  // waterdrop.com is pinned), it's a different company — drop it.
  if (pinnedDomain && hasConflictingBrandDomain_(fullText, targetKeys, pinnedDomain)) {
    return null;
  }

  var extractedEvidence = null;
  var extracted = extractBrands(fullText, desc);
  for (var e = 0; e < extracted.length && extractedEvidence === null; e++) {
    var key = compactBrandKey_(normalizeBrandName(extracted[e].name));
    for (var t = 0; t < targetKeys.length; t++) {
      if (brandKeyMatches_(targetKeys[t], key)) {
        extractedEvidence = extracted[e].evidence || "";
        break;
      }
    }
  }

  var mention = null;
  for (var r = 0; r < brandRes.length; r++) {
    brandRes[r].lastIndex = 0;
    var mm = brandRes[r].exec(fullText);
    if (mm) { mention = mm; break; }
  }

  var hasPaidLanguage = BRAND_PAID_RE.test(fullText);
  var hasSeedLanguage = BRAND_SEED_RE.test(fullText);
  var hashtagOnly = extractedEvidence !== null
    && /\(hashtag in description\)$/.test(extractedEvidence);

  // Real paid-deal tiers require paid language and non-hashtag evidence.
  if (extractedEvidence !== null && hasPaidLanguage && !hashtagOnly) {
    if (flag) return { type: "Verified + YT disclosure", rank: 0, evidence: extractedEvidence };
    return { type: "Verified sponsor evidence", rank: 1, evidence: extractedEvidence };
  }

  if (flag && hasPaidLanguage && mention) {
    var start = Math.max(0, mention.index - 40);
    var snip = fullText.substring(start, mention.index + mention[0].length + 60)
      .replace(/\s+/g, " ").trim();
    return {
      type: "YT disclosure + paid mention", rank: 2,
      evidence: "Flagged paid promotion; brand named: “…" + snip + "…”",
    };
  }

  // Everything left with a brand connection is seeding/UGC territory.
  if (extractedEvidence !== null || (flag && mention)) {
    var seedEv = extractedEvidence
      || "Flagged paid promotion; brand mentioned (no paid language)";
    if (hasSeedLanguage || hashtagOnly || !hasPaidLanguage) {
      return { type: "Gifted / seeding / UGC", rank: 3, evidence: seedEv };
    }
  }

  return null; // organic mention or unrelated search hit — dropped
}

/**
 * True when the video's brand-looking domains conflict with the pinned one.
 * "Brand-looking" = any domain in the text whose compacted form contains
 * one of the target keys. If such domains exist and NONE of them is the
 * pinned domain, this video belongs to a homonym company. Pure function.
 */
function hasConflictingBrandDomain_(fullText, targetKeys, pinnedDomain) {
  var pinned = (pinnedDomain || "").toLowerCase();
  var pinnedCompact = compactBrandKey_(pinned);
  var domRe = /([a-z0-9][a-z0-9-]{1,40}\.(?:com|co|io|org|net|shop|store|us|ca|uk|de))\b/gi;
  var found = false;
  var m;
  while ((m = domRe.exec(fullText)) !== null) {
    var dom = m[1].toLowerCase().replace(/^www\./, "");
    var domCompact = compactBrandKey_(dom);
    var brandish = false;
    for (var t = 0; t < targetKeys.length; t++) {
      if (targetKeys[t].length >= 5 && domCompact.indexOf(targetKeys[t]) > -1) {
        brandish = true;
        break;
      }
    }
    if (!brandish) continue;
    if (dom === pinned || domCompact === pinnedCompact
      || dom.slice(-(pinned.length + 1)) === "." + pinned) {
      return false; // the pinned domain itself appears — it's our brand
    }
    found = true; // a brand-ish domain that is NOT the pinned one
  }
  return found;
}


// ── SEARCH (own cache + own lookback, separate from Discovery) ──

function brandSearchVideosCached_(config, query, paidOnly) {
  var cache = CacheService.getScriptCache();
  var key = "bps2_" + (paidOnly ? "pp_" : "") + BRAND_SEARCH.pagesPerSearch + "_"
    + query.toLowerCase().replace(/\s+/g, "_").substring(0, 80);
  var cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - BRAND_SEARCH.monthsBack);

  var slim = [];
  var pageToken = null;

  for (var page = 0; page < BRAND_SEARCH.pagesPerSearch; page++) {
    var url = "https://www.googleapis.com/youtube/v3/search"
      + "?key=" + config.ytApiKey
      + "&part=snippet"
      + "&type=video"
      + "&order=relevance"
      + "&maxResults=" + BRAND_SEARCH.resultsPerSearch
      + "&publishedAfter=" + encodeURIComponent(cutoff.toISOString())
      + (paidOnly ? "&videoPaidProductPlacement=true" : "")
      + "&q=" + encodeURIComponent(query);
    if (pageToken) url += "&pageToken=" + pageToken;

    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) {
      if (page === 0) {
        throw new Error("search.list " + resp.getResponseCode() + ": "
          + resp.getContentText().substring(0, 150));
      }
      break; // deeper pages failing (e.g. budget) — keep what we have
    }
    brandSearchCalls_++;
    var json = JSON.parse(resp.getContentText());
    var items = json.items || [];
    for (var i = 0; i < items.length; i++) slim.push({ id: items[i].id });

    pageToken = json.nextPageToken || null;
    if (!pageToken) break;
    Utilities.sleep(120);
  }

  try { cache.put(key, JSON.stringify(slim), BRAND_SEARCH.cacheHours * 3600); } catch (e) {}
  return slim;
}

/** channels.list in batches of 50 -> { channelId: {handle, subs, hidden} } */
function getChannelProfilesBatch_(config, ids) {
  var out = {};
  for (var i = 0; i < ids.length; i += 50) {
    var batch = ids.slice(i, i + 50);
    if (!batch.length) break;
    var url = "https://www.googleapis.com/youtube/v3/channels"
      + "?key=" + config.ytApiKey
      + "&id=" + batch.join(",")
      + "&part=snippet,statistics";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) continue;
    var items = JSON.parse(resp.getContentText()).items || [];
    for (var c = 0; c < items.length; c++) {
      var ch = items[c];
      var stats = ch.statistics || {};
      out[ch.id] = {
        handle: (ch.snippet.customUrl || "").replace(/^@?/, "@"),
        subs: Number(stats.subscriberCount || 0),
        hidden: String(stats.hiddenSubscriberCount) === "true",
      };
    }
  }
  return out;
}


// ── WRITE THE DETAIL TAB (replace per brand, keep other brands) ──

function writeBrandPartnershipsTab_(config, searchedBrands, newRows) {
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName(BRAND_SEARCH.tabName);
  var headers = BRAND_SEARCH_HEADERS;

  var scannedIds = getScanRegistryIds(ss);
  var scannedNames = getScannedCreatorNames(config);

  var searched = {};
  for (var b = 0; b < searchedBrands.length; b++) {
    searched[searchedBrands[b].toLowerCase()] = true;
  }
  var kept = [];
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    for (var e = 0; e < data.length; e++) {
      var rowBrand = (data[e][0] || "").toString().toLowerCase();
      if (rowBrand && !searched[rowBrand]) kept.push(data[e]);
    }
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  newRows.sort(function(a, b) {
    return a.matchRank - b.matchRank || (b.views || 0) - (a.views || 0);
  });

  var fresh = newRows.map(function(r) {
    var alreadyScanned = scannedIds[r.channelId] ? "Yes"
      : (scannedNames[normalizeCreatorKey(r.creator)] ? "Yes" : "");
    return [
      r.brand, r.creator, r.handle, r.channelUrl, r.subs,
      r.matchType, r.evidence, r.videoTitle, r.videoUrl, r.published,
      r.views, r.flag ? "YES" : "", alreadyScanned, today,
    ];
  });

  if (!sheet) sheet = ss.insertSheet(BRAND_SEARCH.tabName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#7C3AED").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);

  var all = fresh.concat(kept);
  if (all.length > 0) {
    sheet.getRange(2, 1, all.length, headers.length).setValues(all);

    var typeRange = sheet.getRange("F2:F" + (all.length + 1));
    sheet.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Verified + YT disclosure").setBackground("#D1FAE5").setFontColor("#059669").setBold(true).setRanges([typeRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Verified sponsor evidence").setBackground("#FEF3C7").setFontColor("#92400E").setRanges([typeRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("YT disclosure + paid mention").setBackground("#DBEAFE").setFontColor("#1D4ED8").setRanges([typeRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Gifted / seeding / UGC").setBackground("#F3F4F6").setFontColor("#9CA3AF").setRanges([typeRange]).build(),
    ]);
  }

  var widths = [150, 180, 140, 220, 100, 200, 300, 260, 200, 100, 90, 100, 110, 110];
  for (var w = 0; w < widths.length; w++) sheet.setColumnWidth(w + 1, widths[w]);

  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).createFilter();

  Logger.log("Brand Partnerships tab: " + fresh.length + " new rows, "
    + kept.length + " kept from previous searches.");
}


// ── REBOOK RADAR (brand x creator rollup) ───────────────────

/**
 * Pure aggregation: detail-row objects -> rollup rows.
 * Rebooked = rebookMinVideos+ videos spanning rebookMinSpanDays+.
 * Exported separately so it's unit-testable.
 */
function computeRebookStats_(detailRows) {
  var groups = {};

  for (var i = 0; i < detailRows.length; i++) {
    var r = detailRows[i];
    if (!r.brand || !r.creator) continue;
    var key = r.brand.toLowerCase() + "|" + (r.channelUrl || r.creator.toLowerCase());

    if (!groups[key]) {
      groups[key] = {
        brand: r.brand, creator: r.creator, handle: r.handle || "",
        channelUrl: r.channelUrl || "", subs: r.subs,
        videos: 0, first: null, last: null,
        bestRank: 99, bestType: "", example: "", exampleViews: -1,
        alreadyScanned: r.alreadyScanned || "",
      };
    }
    var g = groups[key];
    g.videos++;
    if (r.matchRank < g.bestRank) { g.bestRank = r.matchRank; g.bestType = r.matchType; }
    if ((r.views || 0) > g.exampleViews) { g.exampleViews = r.views || 0; g.example = r.videoUrl || ""; }
    if (r.alreadyScanned === "Yes") g.alreadyScanned = "Yes";

    var d = r.published ? new Date(r.published) : null;
    if (d && !isNaN(d)) {
      if (!g.first || d < g.first) g.first = d;
      if (!g.last || d > g.last) g.last = d;
    }
  }

  var out = [];
  for (var k in groups) {
    var g = groups[k];
    var span = (g.first && g.last)
      ? Math.round((g.last - g.first) / (24 * 3600 * 1000)) : 0;
    g.spanDays = span;
    g.rebooked = (g.videos >= BRAND_SEARCH.rebookMinVideos
      && span >= BRAND_SEARCH.rebookMinSpanDays) ? "Yes" : "";
    out.push(g);
  }

  out.sort(function(a, b) {
    var ra = a.rebooked === "Yes" ? 0 : 1;
    var rb = b.rebooked === "Yes" ? 0 : 1;
    return ra - rb || a.bestRank - b.bestRank || b.videos - a.videos;
  });
  return out;
}

/** Reads the whole Brand Partnerships tab (accumulated across runs)
 *  and rebuilds the Rebook Radar tab. */
function buildRebookRadar_(config) {
  var ss = SpreadsheetApp.openById(config.sheetId);
  var detail = ss.getSheetByName(BRAND_SEARCH.tabName);
  if (!detail || detail.getLastRow() <= 1) return;

  var data = detail.getRange(2, 1, detail.getLastRow() - 1, BRAND_SEARCH_HEADERS.length).getValues();
  var rankByType = {
    "Verified + YT disclosure": 0,
    "Verified sponsor evidence": 1,
    "YT disclosure + paid mention": 2,
    "YT disclosure + mentioned": 2,   // v1.0 rows
    "Gifted / seeding / UGC": 3,
  };

  var detailRows = data.map(function(row) {
    return {
      brand: (row[0] || "").toString(),
      creator: (row[1] || "").toString(),
      handle: (row[2] || "").toString(),
      channelUrl: (row[3] || "").toString(),
      subs: row[4],
      matchType: (row[5] || "").toString(),
      matchRank: rankByType.hasOwnProperty(row[5]) ? rankByType[row[5]] : 2,
      videoUrl: (row[8] || "").toString(),
      published: (row[9] || "").toString(),
      views: Number(row[10]) || 0,
      alreadyScanned: (row[12] || "").toString(),
    };
  });

  var rollup = computeRebookStats_(detailRows);

  var sheet = ss.getSheetByName(BRAND_SEARCH.rebookTabName);
  if (!sheet) sheet = ss.insertSheet(BRAND_SEARCH.rebookTabName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, REBOOK_HEADERS.length).setValues([REBOOK_HEADERS]);
  sheet.getRange(1, 1, 1, REBOOK_HEADERS.length)
    .setBackground("#1B3A5C").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);

  if (rollup.length > 0) {
    var rows = rollup.map(function(g) {
      return [
        g.brand, g.creator, g.handle, g.channelUrl, g.subs,
        g.videos,
        g.first ? Utilities.formatDate(g.first, Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
        g.last ? Utilities.formatDate(g.last, Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
        g.spanDays, g.rebooked, g.bestType, g.example, g.alreadyScanned,
      ];
    });
    sheet.getRange(2, 1, rows.length, REBOOK_HEADERS.length).setValues(rows);

    var rebookRange = sheet.getRange("J2:J" + (rows.length + 1));
    sheet.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Yes")
        .setBackground("#D1FAE5").setFontColor("#059669").setBold(true)
        .setRanges([rebookRange]).build(),
    ]);
  }

  var widths = [150, 180, 140, 220, 100, 70, 100, 100, 90, 90, 200, 200, 110];
  for (var w = 0; w < widths.length; w++) sheet.setColumnWidth(w + 1, widths[w]);

  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), REBOOK_HEADERS.length).createFilter();

  Logger.log("Rebook Radar: " + rollup.length + " brand x creator pairs.");
}