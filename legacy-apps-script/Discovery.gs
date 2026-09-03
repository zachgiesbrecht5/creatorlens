/**
 * ============================================================
 * ROOTFOR — Creator Discovery Add-on (v1.3)
 * ============================================================
 * FULL REPLACEMENT for the Discovery file. Select-all, paste over, save.
 * Same project as the main Scanner (depends on getConfig, validateConfig,
 * resolveChannelIdFromHandle, getUploadsPlaylistId, scanAdHoc,
 * sanitizeTabName, matchCategory, CATEGORIES, BRAND_ALIASES,
 * extractBrands, normalizeBrandName).
 *
 * MIGRATION: DELETE the "Creator Discovery" tab before the first v1.3 run
 * (layout went 18 -> 19 columns). Schema is locked after this.
 *
 * v1.3 CHANGES (from v1.2):
 * - SPONSOR VERIFICATION: sponsor-overlap results are now verified.
 *   Each candidate video's FULL description is fetched and run through the
 *   main scanner's extractBrands(); a video only counts if the searched
 *   brand is actually extracted as sponsor/seeding evidence. The evidence
 *   phrase is written to the sheet with a checkmark. "Search Overlap" on
 *   this path = number of DISTINCT verified brands paying that channel.
 * - ACCUMULATING MERGES: when a channel is rediscovered, Discovery Path,
 *   Seed, and Evidence now union instead of keeping only the first value.
 *   A row showing two paths + two seeds is inherently a stronger lead.
 * - MEDIAN LONG-FORM VIEWS: "Recent Avg Views" replaced by
 *   "Median Views (LF)" — median of the last 15 uploads >= 3.5 min
 *   (excludes Shorts and isn't distorted by one viral video) — plus a new
 *   "Uploads (90d)" column.
 * - SCAN REGISTRY: scanned channels are now tracked by permanent channel ID
 *   in a "Scan Registry" tab (written by scanSelectedCreators). Tab-name
 *   matching remains as fallback for scans run through the main dialog.
 * - Brand-channel first-word rule softened: needs a corporate second word
 *   ("Newegg Studios" flags; "Fellow Carter" / "Steam Powered Matt" don't).
 * - QUOTA WORDING CORRECTED: since June 1, 2026, search.list bills 1 call
 *   against a dedicated ~100 searches/day budget (separate from the
 *   10,000-unit pool used by scans/hydration). Prompts now say so.
 * ============================================================
 */

var DISCOVERY = {
  tabName: "Creator Discovery",
  registryTabName: "Scan Registry",
  maxSearchesPerRun: 8,        // of ~100 search calls/day (dedicated budget)
  resultsPerSearch: 25,
  recentVideosToSample: 30,
  publishedWithinDays: 90,
  minSubs: 25000,
  collabMinSubs: 1000,
  maxSubs: 5000000,
  bigramMinTitles: 3,
  relevanceLanguage: "en",     // "" to disable
  regionCode: "US",            // "" for global, "CA" for Canada-biased
  confirmTermsBeforeSearch: true,
  enrichTopN: 30,
  uploadsSampledForViews: 15,  // uploads pulled per channel for the median
  shortsMaxSeconds: 210,       // videos under 3.5 min treated as Shorts
  maxHandleResolutions: 25,
  maxScansPerBatch: 5,
  usePaidPlacementFlag: true,
  cacheHours: 72,
};

var DISCOVERY_STATUSES = [
  "New", "Worth Scanning", "Not Relevant", "Already Represented",
  "Brand Channel", "Scanned"
];

// Column layout (0-based). Merge logic is position-based — don't reorder.
var DCOL = {
  select: 0, date: 1, path: 2, seed: 3, creator: 4, handle: 5, url: 6,
  id: 7, subs: 8, videos: 9, medianLF: 10, uploads90: 11, lastUpload: 12,
  overlap: 13, terms: 14, example: 15, scanned: 16, status: 17, notes: 18,
};

var DISCOVERY_HEADERS = [
  "Select", "Date Discovered", "Discovery Path", "Seed", "Creator",
  "Handle", "Channel URL", "Channel ID", "Subscribers", "Videos",
  "Median Views (LF)", "Uploads (90d)", "Last Upload", "Search Overlap",
  "Evidence / Matched Terms", "Example Video",
  "Already Scanned", "Review Status", "Notes"
];

var CORPORATE_CHANNEL_KEYS = [
  "valve", "intel", "amd", "nvidia", "nvidiageforce", "microsoft", "sony",
  "playstation", "xbox", "samsung", "dell", "hp", "lenovo", "asus",
  "asusrog", "msi", "gigabyte", "corsair", "newegg", "neweggstudios",
  "bestbuy", "amazon", "steam", "razer", "logitech", "logitechg",
  "alienware", "seagate", "westerndigital", "crucial", "kingston",
];

var BRAND_SECOND_WORD_SIGNALS = [
  "official", "studios", "studio", "gaming", "support", "global",
  "channel", "usa", "uk", "canada", "america", "north", "india",
  "deutschland", "france", "latam", "esports",
];


// ── ENTRY POINT 1: TOPIC-OVERLAP DISCOVERY ──────────────────

function discoverSimilarCreators() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();
  validateConfig(config);

  var resp = ui.prompt(
    "Discover similar creators",
    "Seed channel — paste a channel ID (UC...) or @handle:",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var seedId = resolveSeedInput(config, resp.getResponseText());
  if (!seedId) { ui.alert("Couldn't resolve that channel. Check the ID/handle."); return; }

  var seedVideos = getRecentSeedVideos(config, seedId, DISCOVERY.recentVideosToSample);
  if (seedVideos.length === 0) { ui.alert("No recent videos found on the seed channel."); return; }
  var seedName = seedVideos[0].channelTitle || "Seed";

  var terms = generateSearchTerms(seedVideos, DISCOVERY.maxSearchesPerRun);
  if (terms.length === 0) {
    ui.alert("Couldn't generate usable search terms from " + seedName
      + "'s recent titles/tags (too much promo noise). Try sponsor-overlap "
      + "or collab-network discovery instead.");
    return;
  }

  terms = confirmSearchTerms(ui, terms,
    "Search terms generated from " + seedName + "'s recent titles/tags.\n"
    + "Kill anything that's a news event or promo, not the channel's identity.");
  if (!terms) return;

  Logger.log("Discovery terms for " + seedName + ": " + terms.join(" | "));

  var found = runDiscoverySearches(config, terms, seedId, false);
  var rows = hydrateAndFilterDiscovered(config, found, seedName, "Topic overlap", null);
  enrichRecentViews(config, rows, DISCOVERY.enrichTopN);
  writeDiscoveryTab(config, rows);

  ui.alert("Discovery complete for " + seedName + ".\n\n"
    + terms.length + " searches run, " + rows.length + " channels passed filters.\n"
    + "Tip: filter Search Overlap >= 2 for the strongest matches.\n\n"
    + "Open \"" + DISCOVERY.tabName + "\", check the ones worth scanning, "
    + "then run \"Scan selected creators\".");
}

function confirmSearchTerms(ui, terms, contextLine) {
  if (!DISCOVERY.confirmTermsBeforeSearch) return terms;

  var resp = ui.prompt(
    "Confirm searches (" + terms.length + " of your ~100/day search budget)",
    contextLine + "\n\nPlanned searches:\n  - " + terms.join("\n  - ")
      + "\n\nPress OK to run these, or type a replacement list "
      + "(comma-separated) to override:",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;

  var txt = resp.getResponseText().trim();
  if (!txt) return terms;

  var edited = txt.split(",")
    .map(function(t) { return t.trim(); })
    .filter(function(t) { return t.length > 1; })
    .slice(0, DISCOVERY.maxSearchesPerRun);
  return edited.length > 0 ? edited : terms;
}


// ── ENTRY POINT 2: SPONSOR-OVERLAP DISCOVERY (VERIFIED) ─────
// Seeds from top non-mass Brand Leaderboard brands, then VERIFIES every
// candidate video: its full description/title/tags are run through the main
// scanner's extractBrands(), and the video only counts when the searched
// brand appears as extracted sponsor/seeding evidence. This closes the
// "video mentions ASUS but NordVPN paid for it" false-positive.

function discoverBySponsorOverlap() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();
  validateConfig(config);
  var ss = SpreadsheetApp.openById(config.sheetId);

  var lb = ss.getSheetByName("Brand Leaderboard");
  if (!lb || lb.getLastRow() <= 1) {
    ui.alert("No Brand Leaderboard found. Run \"Rebuild Brand Leaderboard\" first.");
    return;
  }

  var headers = lb.getRange(1, 1, 1, lb.getLastColumn()).getValues()[0];
  var brandCol = headers.indexOf("Brand");
  var massCol = headers.indexOf("Mass Sponsor");
  var data = lb.getRange(2, 1, lb.getLastRow() - 1, lb.getLastColumn()).getValues();

  var brands = [];
  for (var i = 0; i < data.length && brands.length < DISCOVERY.maxSearchesPerRun; i++) {
    var b = (data[i][brandCol] || "").toString().trim();
    var isMass = massCol > -1 && (data[i][massCol] || "").toString() === "Yes";
    if (b && !isMass) brands.push(b);
  }
  if (brands.length === 0) { ui.alert("No non-mass brands found on the leaderboard."); return; }

  brands = confirmSearchTerms(ui, brands,
    "Brands to hunt sponsored creators for (from your leaderboard).\n"
    + "You can replace this list with any brands you want, e.g. Gap "
    + "Analysis targets.");
  if (!brands) return;

  Logger.log("Verified sponsor-overlap brands: " + brands.join(" | "));

  var result = runVerifiedSponsorSearches(config, brands, DISCOVERY.usePaidPlacementFlag);
  var rows = hydrateAndFilterDiscovered(config, result.found, "Brand Leaderboard", "Sponsor overlap", null);
  enrichRecentViews(config, rows, DISCOVERY.enrichTopN);
  writeDiscoveryTab(config, rows);

  ui.alert("Verified sponsor-overlap complete.\n\n"
    + brands.length + " brand searches -> " + result.videosChecked
    + " candidate videos checked -> " + result.videosVerified
    + " verified sponsorships -> " + rows.length + " channels passed filters.\n\n"
    + "Search Overlap = number of your brands VERIFIED paying that channel.\n"
    + "Evidence column shows the actual disclosure phrase for each.");
}

/**
 * Search each brand (paid-placement-flagged when enabled), then batch the
 * candidate videos through videos.list (1 unit / 50 videos, from the shared
 * pool — NOT the search budget) to get full descriptions, and keep only
 * videos where extractBrands() finds the searched brand.
 */
function runVerifiedSponsorSearches(config, brands, paidOnly) {
  var videoHits = {}; // videoId -> { channelId, channelTitle, brands:{} }

  for (var i = 0; i < brands.length; i++) {
    var q = paidOnly ? ('"' + brands[i] + '"') : ('"' + brands[i] + '" sponsored');
    var items;
    try {
      items = searchVideosCached(config, q, paidOnly);
    } catch (e) {
      Logger.log("Search failed for '" + q + "': " + e.message);
      continue;
    }
    for (var j = 0; j < items.length; j++) {
      var vid = items[j].id && items[j].id.videoId;
      var sn = items[j].snippet || {};
      if (!vid || !sn.channelId) continue;
      if (!videoHits[vid]) {
        videoHits[vid] = { channelId: sn.channelId, channelTitle: sn.channelTitle || "", brands: {} };
      }
      videoHits[vid].brands[brands[i]] = true;
    }
    Utilities.sleep(100);
  }

  var vids = Object.keys(videoHits);
  var found = {};
  var verified = 0;

  for (var v = 0; v < vids.length; v += 50) {
    var batch = vids.slice(v, v + 50);
    var url = "https://www.googleapis.com/youtube/v3/videos"
      + "?key=" + config.ytApiKey
      + "&id=" + batch.join(",")
      + "&part=snippet";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) continue;
    var items = JSON.parse(resp.getContentText()).items || [];

    for (var k = 0; k < items.length; k++) {
      var video = items[k];
      var hit = videoHits[video.id];
      if (!hit) continue;

      var sn = video.snippet || {};
      var desc = sn.description || "";
      var fullText = (sn.title || "") + "\n" + desc + "\n" + (sn.tags || []).join(" ");

      // Reuse the main scanner's extractor + normalizer
      var extracted = {};
      var brandsInVideo = extractBrands(fullText, desc);
      for (var e = 0; e < brandsInVideo.length; e++) {
        var norm = normalizeBrandName(brandsInVideo[e].name);
        if (!norm) continue;
        var keyL = norm.toLowerCase();
        if (!extracted[keyL]) extracted[keyL] = brandsInVideo[e].evidence || "";
      }

      for (var candidate in hit.brands) {
        var target = normalizeBrandName(candidate).toLowerCase();
        if (!extracted.hasOwnProperty(target)) continue; // not verified -> drop

        verified++;
        if (!found[hit.channelId]) {
          found[hit.channelId] = {
            channelId: hit.channelId,
            title: hit.channelTitle || hit.channelId,
            count: 0,
            brandSet: {},
            terms: [],
            exampleVideoId: "",
          };
        }
        var f = found[hit.channelId];
        if (!f.brandSet[target]) {
          f.brandSet[target] = true;
          f.count++; // overlap = distinct verified brands
        }
        var ev = "\u2713 " + candidate + ": " + extracted[target].substring(0, 90);
        if (f.terms.length < 4 && f.terms.indexOf(ev) === -1) f.terms.push(ev);
        if (!f.exampleVideoId) f.exampleVideoId = video.id;
      }
    }
    Utilities.sleep(80);
  }

  Logger.log("Sponsor verification: " + vids.length + " candidate videos, "
    + verified + " verified brand-sponsorships, "
    + Object.keys(found).length + " channels.");

  return { found: found, videosChecked: vids.length, videosVerified: verified };
}


// ── ENTRY POINT 3: COLLAB NETWORK ───────────────────────────

function discoverCollabNetwork() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();
  validateConfig(config);

  var resp = ui.prompt(
    "Discover collab network",
    "Seed channel — paste a channel ID (UC...) or @handle:",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var seedId = resolveSeedInput(config, resp.getResponseText());
  if (!seedId) { ui.alert("Couldn't resolve that channel."); return; }

  var seedVideos = getRecentSeedVideos(config, seedId, DISCOVERY.recentVideosToSample);
  if (seedVideos.length === 0) { ui.alert("No recent videos found on the seed channel."); return; }
  var seedName = seedVideos[0].channelTitle || "Seed";

  var mentions = extractChannelMentions(seedVideos);

  var found = {};
  var resolved = 0;
  var keys = Object.keys(mentions);
  keys.sort(function(a, b) { return mentions[b].count - mentions[a].count; });

  for (var k = 0; k < keys.length; k++) {
    var m = mentions[keys[k]];
    var cid = m.id;
    if (!cid && m.handle) {
      if (resolved >= DISCOVERY.maxHandleResolutions) continue;
      cid = resolveChannelIdFromHandle(config, m.handle);
      resolved++;
      Utilities.sleep(60);
    }
    if (!cid || cid === seedId) continue;

    if (!found[cid]) {
      found[cid] = {
        channelId: cid,
        title: m.handle ? ("@" + m.handle) : cid,
        count: 0,
        terms: [],
        exampleVideoId: "",
      };
    }
    found[cid].count += m.count;
    for (var e = 0; e < m.examples.length && found[cid].terms.length < 3; e++) {
      var ev = "mentioned in: " + m.examples[e];
      if (found[cid].terms.indexOf(ev) === -1) found[cid].terms.push(ev);
    }
  }

  var rows = hydrateAndFilterDiscovered(config, found, seedName, "Collab network",
    { minSubs: DISCOVERY.collabMinSubs });
  enrichRecentViews(config, rows, DISCOVERY.enrichTopN);
  writeDiscoveryTab(config, rows);

  ui.alert("Collab network for " + seedName + ": " + rows.length
    + " linked/mentioned channels found.\nReview the \"" + DISCOVERY.tabName + "\" tab.");
}

function extractChannelMentions(videos) {
  var mentions = {};

  function bump(key, id, handle, videoTitle) {
    if (!mentions[key]) mentions[key] = { id: id || null, handle: handle || null, count: 0, examples: [] };
    mentions[key].count++;
    if (mentions[key].examples.length < 3 && mentions[key].examples.indexOf(videoTitle) === -1) {
      mentions[key].examples.push(videoTitle);
    }
  }

  for (var v = 0; v < videos.length; v++) {
    var desc = videos[v].description || "";
    var title = (videos[v].title || "").substring(0, 60);
    var m;

    var reId = /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{20,})/gi;
    while ((m = reId.exec(desc)) !== null) bump("id:" + m[1], m[1], null, title);

    var reHandle = /youtube\.com\/@([A-Za-z0-9._\-]{3,30})/gi;
    while ((m = reHandle.exec(desc)) !== null) bump("h:" + m[1].toLowerCase(), null, m[1], title);

    var lines = desc.split("\n");
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      if (/twitter|instagram|tiktok|twitch|threads|x\.com|discord/i.test(line)) continue;
      var reBare = /(^|\s)@([A-Za-z0-9._\-]{3,30})\b/g;
      while ((m = reBare.exec(line)) !== null) {
        bump("h:" + m[2].toLowerCase(), null, m[2], title);
      }
    }
  }
  return mentions;
}


// ── SHARED HELPERS ──────────────────────────────────────────

function resolveSeedInput(config, raw) {
  var val = (raw || "").toString().trim().replace(/^@/, "");
  if (!val) return null;
  return /^UC[A-Za-z0-9_-]{20,}$/.test(val)
    ? val
    : resolveChannelIdFromHandle(config, val);
}

function getRecentSeedVideos(config, channelId, n) {
  var uploads = getUploadsPlaylistId(config, channelId);
  if (!uploads) return [];

  var url = "https://www.googleapis.com/youtube/v3/playlistItems"
    + "?key=" + config.ytApiKey
    + "&playlistId=" + uploads
    + "&part=contentDetails"
    + "&maxResults=" + Math.min(n, 50);

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 400) return [];
  var json = JSON.parse(resp.getContentText());
  var ids = (json.items || []).map(function(it) {
    return it.contentDetails ? it.contentDetails.videoId : null;
  }).filter(Boolean);
  if (ids.length === 0) return [];

  var vUrl = "https://www.googleapis.com/youtube/v3/videos"
    + "?key=" + config.ytApiKey
    + "&id=" + ids.join(",")
    + "&part=snippet";
  var vResp = UrlFetchApp.fetch(vUrl, { muteHttpExceptions: true });
  if (vResp.getResponseCode() >= 400) return [];
  var vJson = JSON.parse(vResp.getContentText());

  return (vJson.items || []).map(function(v) {
    return {
      title: v.snippet.title || "",
      tags: v.snippet.tags || [],
      description: v.snippet.description || "",
      channelTitle: v.snippet.channelTitle || "",
    };
  });
}


// ── SEARCH TERM GENERATION ──────────────────────────────────

var DISCOVERY_STOPWORDS = [
  "the", "a", "an", "and", "or", "but", "for", "with", "this", "that",
  "these", "those", "is", "are", "was", "were", "be", "been", "it", "its",
  "i", "we", "you", "my", "your", "our", "of", "in", "on", "at", "to",
  "from", "by", "vs", "how", "why", "what", "when", "new", "best", "top",
  "review", "unboxing", "video", "episode", "ep", "part", "2024", "2025",
  "2026", "official", "full", "just", "not", "no", "yes", "all", "one",
  "first", "ever", "really", "actually", "finally", "here", "now", "get",
  "got", "make", "made", "should", "can", "cant", "dont", "did", "will",
  "giveaway", "giveaways", "win", "winner", "winners", "winning", "enter",
  "contest", "prize", "prizes", "free", "deal", "deals", "sale", "sales",
  "discount", "code", "sponsor", "sponsored", "live", "livestream",
  "stream", "streaming", "podcast", "shorts", "short", "reaction",
  "reacts", "subscribe", "subscribers", "ft", "feat", "featuring",
  "announcement", "update", "q&a", "qa", "asmr",
];

function generateSearchTerms(videos, maxTerms) {
  var bigramCounts = {};
  var tagCounts = {};

  function tokenize(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(function(w) {
        return w.length > 2 && DISCOVERY_STOPWORDS.indexOf(w) === -1 && !/^\d+$/.test(w);
      });
  }

  for (var i = 0; i < videos.length; i++) {
    var words = tokenize(videos[i].title);
    for (var w = 0; w < words.length - 1; w++) {
      var bg = words[w] + " " + words[w + 1];
      bigramCounts[bg] = (bigramCounts[bg] || 0) + 1;
    }
    var tags = videos[i].tags || [];
    for (var t = 0; t < tags.length; t++) {
      var tag = tags[t].toLowerCase().trim();
      if (tag.length > 3 && tag.split(" ").length <= 3 && !containsStopword(tag)) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  var bigramList = Object.keys(bigramCounts)
    .filter(function(k) { return bigramCounts[k] >= DISCOVERY.bigramMinTitles; })
    .sort(function(a, b) { return bigramCounts[b] - bigramCounts[a]; });

  var tagList = Object.keys(tagCounts)
    .filter(function(k) { return tagCounts[k] >= 3; })
    .sort(function(a, b) { return tagCounts[b] - tagCounts[a]; });

  var terms = [];
  var usedWords = {};

  function wordsOf(term) { return term.split(" "); }
  function sharesWord(term) {
    var ws = wordsOf(term);
    for (var x = 0; x < ws.length; x++) if (usedWords[ws[x]]) return true;
    return false;
  }
  function take(term) {
    terms.push(term);
    var ws = wordsOf(term);
    for (var x = 0; x < ws.length; x++) usedWords[ws[x]] = true;
  }

  for (var b1 = 0; b1 < bigramList.length && terms.length < maxTerms; b1++) {
    if (!sharesWord(bigramList[b1])) take(bigramList[b1]);
  }
  for (var g = 0; g < tagList.length && terms.length < maxTerms; g++) {
    if (terms.indexOf(tagList[g]) === -1 && !sharesWord(tagList[g])) take(tagList[g]);
  }
  for (var b2 = 0; b2 < bigramList.length && terms.length < maxTerms; b2++) {
    if (terms.indexOf(bigramList[b2]) === -1) terms.push(bigramList[b2]);
  }

  return terms.slice(0, maxTerms);
}

function containsStopword(phrase) {
  var ws = phrase.split(/\s+/);
  for (var i = 0; i < ws.length; i++) {
    if (DISCOVERY_STOPWORDS.indexOf(ws[i]) > -1) return true;
  }
  return false;
}


// ── SEARCH + AGGREGATION (topic path) ───────────────────────

function runDiscoverySearches(config, terms, excludeChannelId, paidOnly) {
  var found = {};

  for (var i = 0; i < terms.length; i++) {
    var items;
    try {
      items = searchVideosCached(config, terms[i], paidOnly);
    } catch (e) {
      Logger.log("Search failed for '" + terms[i] + "': " + e.message);
      continue;
    }

    for (var j = 0; j < items.length; j++) {
      var sn = items[j].snippet || {};
      var cid = sn.channelId;
      if (!cid || cid === excludeChannelId) continue;

      if (!found[cid]) {
        found[cid] = {
          channelId: cid,
          title: sn.channelTitle || cid,
          count: 0,
          terms: [],
          exampleTitle: sn.title || "",
          exampleVideoId: (items[j].id && items[j].id.videoId) || "",
        };
      }
      var f = found[cid];
      if (f.terms.indexOf(terms[i]) === -1) {
        f.terms.push(terms[i]);
        f.count++;
      }
    }
    Utilities.sleep(100);
  }
  return found;
}

function searchVideosCached(config, query, paidOnly) {
  var cache = CacheService.getScriptCache();
  var key = "disc3_" + (paidOnly ? "pp_" : "")
    + query.toLowerCase().replace(/\s+/g, "_").substring(0, 85);
  var cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DISCOVERY.publishedWithinDays);

  var url = "https://www.googleapis.com/youtube/v3/search"
    + "?key=" + config.ytApiKey
    + "&part=snippet"
    + "&type=video"
    + "&order=relevance"
    + "&maxResults=" + DISCOVERY.resultsPerSearch
    + "&publishedAfter=" + encodeURIComponent(cutoff.toISOString())
    + (DISCOVERY.relevanceLanguage ? "&relevanceLanguage=" + DISCOVERY.relevanceLanguage : "")
    + (DISCOVERY.regionCode ? "&regionCode=" + DISCOVERY.regionCode : "")
    + (paidOnly ? "&videoPaidProductPlacement=true" : "")
    + "&q=" + encodeURIComponent(query);

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 400) {
    throw new Error("search.list " + resp.getResponseCode() + ": "
      + resp.getContentText().substring(0, 150));
  }
  var items = JSON.parse(resp.getContentText()).items || [];

  var slim = items.map(function(it) {
    return { id: it.id, snippet: {
      channelId: it.snippet.channelId,
      channelTitle: it.snippet.channelTitle,
      title: it.snippet.title,
    }};
  });
  try { cache.put(key, JSON.stringify(slim), DISCOVERY.cacheHours * 3600); } catch (e) {}
  return slim;
}


// ── HYDRATE + FILTER ────────────────────────────────────────

function hydrateAndFilterDiscovered(config, found, seedName, path, opts) {
  var ids = Object.keys(found);
  if (ids.length === 0) return [];

  var minSubs = (opts && opts.minSubs) || DISCOVERY.minSubs;
  var ss = SpreadsheetApp.openById(config.sheetId);
  var scannedIds = getScanRegistryIds(ss);
  var scannedNames = getScannedCreatorNames(config);
  var brandKeys = getKnownBrandKeys(config);
  var rows = [];

  for (var i = 0; i < ids.length; i += 50) {
    var batch = ids.slice(i, i + 50);
    var url = "https://www.googleapis.com/youtube/v3/channels"
      + "?key=" + config.ytApiKey
      + "&id=" + batch.join(",")
      + "&part=snippet,statistics";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) continue;
    var items = JSON.parse(resp.getContentText()).items || [];

    for (var c = 0; c < items.length; c++) {
      var ch = items[c];
      var f = found[ch.id];
      if (!f) continue;

      var stats = ch.statistics || {};
      var hidden = String(stats.hiddenSubscriberCount) === "true";
      var subs = Number(stats.subscriberCount || 0);
      if (!hidden && (subs < minSubs || subs > DISCOVERY.maxSubs)) continue;

      var title = ch.snippet.title || ch.id;
      var handle = (ch.snippet.customUrl || "").replace(/^@?/, "@");
      var alreadyScanned = scannedIds[ch.id] ? "Yes"
        : (scannedNames[normalizeCreatorKey(title)] ? "Yes" : "");
      var isBrandChannel = looksLikeBrandChannel(title, ch.snippet.description || "", brandKeys);

      rows.push({
        channelId: ch.id,
        name: title,
        handle: handle,
        url: "https://www.youtube.com/channel/" + ch.id,
        subs: subs,
        subsDisplay: hidden ? "hidden" : subs,
        videoCount: Number(stats.videoCount || 0),
        medianLF: "",
        uploads90: "",
        lastUpload: "",
        overlap: f.count,
        terms: f.terms.join(" | "),
        example: f.exampleVideoId
          ? "https://www.youtube.com/watch?v=" + f.exampleVideoId
          : "",
        seed: seedName,
        path: path,
        alreadyScanned: alreadyScanned,
        brandChannel: isBrandChannel,
      });
    }
  }

  rows.sort(function(a, b) { return b.overlap - a.overlap || b.subs - a.subs; });
  return rows;
}

function getKnownBrandKeys(config) {
  var keys = {};

  try {
    for (var alias in BRAND_ALIASES) {
      keys[normalizeCreatorKey(alias)] = true;
      keys[normalizeCreatorKey(BRAND_ALIASES[alias])] = true;
    }
  } catch (e) {}

  try {
    var ss = SpreadsheetApp.openById(config.sheetId);
    var lb = ss.getSheetByName("Brand Leaderboard");
    if (lb && lb.getLastRow() > 1) {
      var names = lb.getRange(2, 1, lb.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < names.length; i++) {
        var nk = normalizeCreatorKey(names[i][0]);
        if (nk) keys[nk] = true;
      }
    }
  } catch (e) {}

  for (var c = 0; c < CORPORATE_CHANNEL_KEYS.length; c++) {
    keys[CORPORATE_CHANNEL_KEYS[c]] = true;
  }
  return keys;
}

/**
 * Brand-channel detection, v1.3 (softened):
 * - full channel-name match against known brands -> flag
 * - first-word match ONLY counts when the second word is a corporate
 *   signal ("Newegg Studios" flags; "Fellow Carter", "Steam Powered Matt",
 *   "Aura Photography" do not)
 * - "official ... channel" in the description -> flag
 */
function looksLikeBrandChannel(title, description, brandKeys) {
  var full = normalizeCreatorKey(title);
  if (brandKeys[full]) return true;

  var words = title.trim().split(/\s+/);
  if (words.length >= 2) {
    var first = normalizeCreatorKey(words[0]);
    var second = (words[1] || "").toLowerCase().replace(/[^a-z]/g, "");
    if (first && brandKeys[first] && BRAND_SECOND_WORD_SIGNALS.indexOf(second) > -1) {
      return true;
    }
  }

  if (/\bofficial\b[^.\n]{0,40}\bchannel\b/i.test(description)) return true;
  return false;
}

/**
 * Median long-form views for the top N rows (by overlap).
 * Pulls the last 15 uploads (UC->UU swap: 2 one-unit calls per channel from
 * the shared 10,000-unit pool), excludes Shorts (< shortsMaxSeconds), and
 * writes the MEDIAN of the remaining views plus an Uploads (90d) count.
 * Median is used instead of mean so one viral video can't distort the number.
 */
function enrichRecentViews(config, rows, topN) {
  var n = Math.min(topN, rows.length);
  var cutoff90 = new Date();
  cutoff90.setDate(cutoff90.getDate() - 90);

  for (var i = 0; i < n; i++) {
    var r = rows[i];
    try {
      var uu = "UU" + r.channelId.substring(2);
      var pUrl = "https://www.googleapis.com/youtube/v3/playlistItems"
        + "?key=" + config.ytApiKey
        + "&playlistId=" + uu
        + "&part=contentDetails"
        + "&maxResults=" + DISCOVERY.uploadsSampledForViews;
      var pResp = UrlFetchApp.fetch(pUrl, { muteHttpExceptions: true });
      if (pResp.getResponseCode() >= 400) continue;
      var pItems = JSON.parse(pResp.getContentText()).items || [];

      var vids = [];
      var newest = "";
      var within90 = 0;
      for (var p = 0; p < pItems.length; p++) {
        var cd = pItems[p].contentDetails || {};
        if (cd.videoId) vids.push(cd.videoId);
        if (cd.videoPublishedAt) {
          if (!newest || cd.videoPublishedAt > newest) newest = cd.videoPublishedAt;
          if (new Date(cd.videoPublishedAt) >= cutoff90) within90++;
        }
      }
      if (vids.length === 0) continue;

      var vUrl = "https://www.googleapis.com/youtube/v3/videos"
        + "?key=" + config.ytApiKey
        + "&id=" + vids.join(",")
        + "&part=statistics,contentDetails";
      var vResp = UrlFetchApp.fetch(vUrl, { muteHttpExceptions: true });
      if (vResp.getResponseCode() >= 400) continue;
      var vItems = JSON.parse(vResp.getContentText()).items || [];

      var longformViews = [];
      var allViews = [];
      for (var v = 0; v < vItems.length; v++) {
        var views = Number((vItems[v].statistics || {}).viewCount || 0);
        if (views <= 0) continue;
        allViews.push(views);
        var secs = parseISODurationSeconds((vItems[v].contentDetails || {}).duration || "");
        if (secs >= DISCOVERY.shortsMaxSeconds) longformViews.push(views);
      }

      // Prefer long-form median; fall back to all-video median if the
      // channel barely has long-form uploads.
      var pool = longformViews.length >= 3 ? longformViews : allViews;
      if (pool.length > 0) r.medianLF = medianOf(pool);
      if (newest) r.lastUpload = newest.substring(0, 10);
      r.uploads90 = (within90 >= DISCOVERY.uploadsSampledForViews)
        ? (DISCOVERY.uploadsSampledForViews + "+")
        : within90;

      Utilities.sleep(50);
    } catch (e) {
      Logger.log("View enrichment failed for " + r.name + ": " + e.message);
    }
  }
}

function parseISODurationSeconds(iso) {
  var m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

function medianOf(arr) {
  var s = arr.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}


// ── SCAN REGISTRY (channel-ID based scan tracking) ──────────

function getScanRegistryIds(ss) {
  var ids = {};
  var sheet = ss.getSheetByName(DISCOVERY.registryTabName);
  if (!sheet || sheet.getLastRow() <= 1) return ids;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var id = (data[i][0] || "").toString().trim();
    if (id) ids[id] = true;
  }
  return ids;
}

function registerScannedChannel(ss, channelId, name, rawTab) {
  if (!channelId) return;
  var sheet = ss.getSheetByName(DISCOVERY.registryTabName);
  if (!sheet) {
    sheet = ss.insertSheet(DISCOVERY.registryTabName);
    var h = ["Channel ID", "Creator", "Raw Tab", "Last Scanned"];
    sheet.getRange(1, 1, 1, h.length).setValues([h]);
    sheet.getRange(1, 1, 1, h.length)
      .setBackground("#1B3A5C").setFontColor("#FFFFFF").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(4, 120);
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if ((ids[i][0] || "").toString() === channelId) {
        sheet.getRange(i + 2, 4).setValue(today); // refresh Last Scanned
        return;
      }
    }
  }
  sheet.appendRow([channelId, name, rawTab, today]);
}

function getScannedCreatorNames(config) {
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheets = ss.getSheets();
  var names = {};
  for (var i = 0; i < sheets.length; i++) {
    var t = sheets[i].getName();
    if (t.slice(-6) === " - Raw" && t !== "YT Scan - Raw") {
      names[normalizeCreatorKey(t.slice(0, -6))] = true;
    }
  }
  return names;
}

function normalizeCreatorKey(name) {
  return (name || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function unionJoin(existingStr, incomingStr, sep, maxLen) {
  var out = [];
  var seen = {};
  function addAll(s) {
    var parts = (s || "").toString().split(sep);
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    }
  }
  addAll(existingStr);
  addAll(incomingStr);
  var joined = out.join(sep);
  if (maxLen && joined.length > maxLen) {
    joined = joined.substring(0, maxLen - 1) + "\u2026";
  }
  return joined;
}


// ── WRITE / MERGE THE DISCOVERY TAB ─────────────────────────
// Merge by channel ID. On rediscovery: Path, Seed, and Evidence ACCUMULATE
// (union), stats refresh, overlap keeps the max, and Select/Status/Notes
// are preserved. Checkboxes inserted BEFORE values (insertCheckboxes resets
// values). Brand channels auto-statused and sorted last (above Scanned).

function writeDiscoveryTab(config, newRows) {
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName(DISCOVERY.tabName);
  var headers = DISCOVERY_HEADERS;

  var existing = {};
  var order = [];
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    for (var e = 0; e < data.length; e++) {
      var cid = (data[e][DCOL.id] || "").toString();
      if (!cid) continue;
      existing[cid] = data[e];
      order.push(cid);
    }
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  for (var i = 0; i < newRows.length; i++) {
    var r = newRows[i];
    if (existing[r.channelId]) {
      var row = existing[r.channelId];
      row[DCOL.path] = unionJoin(row[DCOL.path], r.path, ", ", 120);
      row[DCOL.seed] = unionJoin(row[DCOL.seed], r.seed, ", ", 160);
      row[DCOL.terms] = unionJoin(row[DCOL.terms], r.terms, " | ", 500);
      row[DCOL.subs] = r.subsDisplay;
      row[DCOL.videos] = r.videoCount;
      if (r.medianLF !== "") row[DCOL.medianLF] = r.medianLF;
      if (r.uploads90 !== "") row[DCOL.uploads90] = r.uploads90;
      if (r.lastUpload !== "") row[DCOL.lastUpload] = r.lastUpload;
      row[DCOL.overlap] = Math.max(Number(row[DCOL.overlap]) || 0, r.overlap);
      if (!row[DCOL.example] && r.example) row[DCOL.example] = r.example;
      if (row[DCOL.scanned] !== "Yes") row[DCOL.scanned] = r.alreadyScanned;
      if (r.brandChannel && (row[DCOL.status] === "New" || row[DCOL.status] === "")) {
        row[DCOL.status] = "Brand Channel";
      }
    } else {
      var status = "New";
      if (r.alreadyScanned === "Yes") status = "Scanned";
      else if (r.brandChannel) status = "Brand Channel";

      var newRow = [];
      newRow[DCOL.select] = false;
      newRow[DCOL.date] = today;
      newRow[DCOL.path] = r.path;
      newRow[DCOL.seed] = r.seed;
      newRow[DCOL.creator] = r.name;
      newRow[DCOL.handle] = r.handle;
      newRow[DCOL.url] = r.url;
      newRow[DCOL.id] = r.channelId;
      newRow[DCOL.subs] = r.subsDisplay;
      newRow[DCOL.videos] = r.videoCount;
      newRow[DCOL.medianLF] = r.medianLF;
      newRow[DCOL.uploads90] = r.uploads90;
      newRow[DCOL.lastUpload] = r.lastUpload;
      newRow[DCOL.overlap] = r.overlap;
      newRow[DCOL.terms] = r.terms;
      newRow[DCOL.example] = r.example;
      newRow[DCOL.scanned] = r.alreadyScanned;
      newRow[DCOL.status] = status;
      newRow[DCOL.notes] = "";
      existing[r.channelId] = newRow;
      order.push(r.channelId);
    }
  }

  if (!sheet) sheet = ss.insertSheet(DISCOVERY.tabName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#1B3A5C").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);

  if (order.length > 0) {
    var values = order.map(function(cid) { return existing[cid]; });

    function rowRank(row) {
      if (row[DCOL.scanned] === "Yes") return 2;
      if (row[DCOL.status] === "Brand Channel") return 1;
      return 0;
    }
    values.sort(function(a, b) {
      return rowRank(a) - rowRank(b)
        || (Number(b[DCOL.overlap]) || 0) - (Number(a[DCOL.overlap]) || 0);
    });

    // Checkboxes first (resets values), THEN write preserved values.
    sheet.getRange(2, 1, values.length, 1).insertCheckboxes();
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);

    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(DISCOVERY_STATUSES).setAllowInvalid(true).build();
    sheet.getRange(2, DCOL.status + 1, values.length, 1).setDataValidation(statusRule);

    // Grey out brand-channel rows (Status is column R in the 19-col layout)
    var creatorRange = sheet.getRange(2, DCOL.creator + 1, values.length, 1);
    sheet.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$R2="Brand Channel"')
        .setBackground("#F3F4F6").setFontColor("#9CA3AF")
        .setRanges([creatorRange]).build(),
    ]);
  }

  var widths = [60, 110, 150, 160, 180, 140, 220, 200, 100, 70, 130, 100, 100, 110, 300, 220, 110, 130, 220];
  for (var w = 0; w < widths.length; w++) sheet.setColumnWidth(w + 1, widths[w]);

  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).createFilter();

  Logger.log("Discovery tab updated: " + order.length + " total channels.");
}


// ── SCAN SELECTED CREATORS ──────────────────────────────────

function scanSelectedCreators() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();
  validateConfig(config);
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName(DISCOVERY.tabName);
  if (!sheet || sheet.getLastRow() <= 1) { ui.alert("No Creator Discovery tab yet."); return; }

  var catResp = ui.prompt(
    "Scan selected creators",
    "Category for this batch — type one of:\n" + CATEGORIES.join(", "),
    ui.ButtonSet.OK_CANCEL);
  if (catResp.getSelectedButton() !== ui.Button.OK) return;
  var category = matchCategory(catResp.getResponseText());

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, DISCOVERY_HEADERS.length).getValues();
  var scanned = 0, skippedScanned = 0;

  for (var i = 0; i < data.length && scanned < DISCOVERY.maxScansPerBatch; i++) {
    if (data[i][DCOL.select] !== true) continue;
    var name = (data[i][DCOL.creator] || "").toString();
    var channelId = (data[i][DCOL.id] || "").toString();
    if (!name || !channelId) continue;
    if (data[i][DCOL.scanned] === "Yes") { skippedScanned++; continue; }

    try {
      var tabBase = sanitizeTabName(name);
      scanAdHoc(tabBase, channelId, category);
      registerScannedChannel(ss, channelId, name, tabBase + " - Raw");
      sheet.getRange(i + 2, DCOL.select + 1).setValue(false);
      sheet.getRange(i + 2, DCOL.scanned + 1).setValue("Yes");
      sheet.getRange(i + 2, DCOL.status + 1).setValue("Scanned");
      scanned++;
    } catch (e) {
      Logger.log("Scan failed for " + name + ": " + e.message);
      sheet.getRange(i + 2, DCOL.notes + 1).setValue("Scan error: " + e.message.substring(0, 80));
    }
  }

  ui.alert("Batch done: " + scanned + " scanned"
    + (skippedScanned ? ", " + skippedScanned + " skipped (already scanned)" : "")
    + ".\n\nCheck more rows and re-run for the next batch (cap: "
    + DISCOVERY.maxScansPerBatch + "/run).");
}


// ── SALES NAVIGATOR QUEUE (Tristan's checklist) ─────────────

function generateSalesNavQueue() {
  var config = getConfig();
  validateConfig(config);
  var ss = SpreadsheetApp.openById(config.sheetId);
  var gap = ss.getSheetByName("Gap Analysis");
  if (!gap || gap.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert("No Gap Analysis data yet.");
    return;
  }

  var headers = gap.getRange(1, 1, 1, gap.getLastColumn()).getValues()[0];
  var brandCol = headers.indexOf("Brand");
  var emailCol = headers.indexOf("Contact Email");
  var massCol = headers.indexOf("Mass Sponsor");
  var confCol = headers.indexOf("Confidence");
  var data = gap.getRange(2, 1, gap.getLastRow() - 1, gap.getLastColumn()).getValues();

  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var brand = (data[i][brandCol] || "").toString().trim();
    var email = (data[i][emailCol] || "").toString().trim();
    var isMass = massCol > -1 && (data[i][massCol] || "").toString() === "Yes";
    var conf = confCol > -1 ? (data[i][confCol] || "").toString() : "";
    if (!brand || email || isMass) continue;

    var kw = '"' + brand + '" ("influencer marketing" OR "creator partnerships" OR "brand partnerships" OR "sponsorships")';
    var navUrl = "https://www.linkedin.com/sales/search/people?keywords=" + encodeURIComponent(kw);
    rows.push([brand, conf, navUrl, "Queued", ""]);
  }

  var tabName = "Sales Nav Queue";
  var sheet = ss.getSheetByName(tabName);
  var qHeaders = ["Brand", "Confidence", "Sales Nav Search", "Status", "Notes"];

  var existing = {};
  if (sheet && sheet.getLastRow() > 1) {
    var ex = sheet.getRange(2, 1, sheet.getLastRow() - 1, qHeaders.length).getValues();
    for (var e = 0; e < ex.length; e++) {
      existing[(ex[e][0] || "").toString().toLowerCase()] = { status: ex[e][3], notes: ex[e][4] };
    }
  }
  for (var r = 0; r < rows.length; r++) {
    var prev = existing[rows[r][0].toLowerCase()];
    if (prev) { rows[r][3] = prev.status || "Queued"; rows[r][4] = prev.notes || ""; }
  }

  if (!sheet) sheet = ss.insertSheet(tabName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, qHeaders.length).setValues([qHeaders]);
  sheet.getRange(1, 1, 1, qHeaders.length)
    .setBackground("#7C3AED").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, qHeaders.length).setValues(rows);
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Queued", "Searching", "Contact Found", "No Contact", "Skip"])
      .setAllowInvalid(true).build();
    sheet.getRange(2, 4, rows.length, 1).setDataValidation(statusRule);
  }

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 420);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 240);

  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), qHeaders.length).createFilter();

  Logger.log("Sales Nav Queue: " + rows.length + " contact-less gap brands queued.");
}


// ── REPLACEMENT onOpen() ────────────────────────────────────

function onOpen() {

  var ui = SpreadsheetApp.getUi();
  ui.createMenu("\uD83D\uDD0D YouTube Scanner")
    .addItem("Scan a creator's channel", "showScanDialog")
    .addItem("Search brand partnerships", "searchBrandPartnerships")
    .addItem("Content Radar (what is working)", "contentRadar")
    .addItem("Category Radar (niche research)", "categoryRadar")
    .addItem("Rebuild Brand Leaderboard", "buildBrandLeaderboard")
    .addSubMenu(ui.createMenu("Discovery")
      .addItem("Discover similar creators", "discoverSimilarCreators")
      .addItem("Discover by sponsor overlap", "discoverBySponsorOverlap")
      .addItem("Discover collab network", "discoverCollabNetwork")
      .addItem("Scan selected creators", "scanSelectedCreators"))
    .addSubMenu(ui.createMenu("More tools")
      .addItem("Scan by ID / @handle (manual)", "scanByPrompt")
      .addItem("Auto-pilot: setup daily scan", "autoPilotSetup")
      .addItem("Auto-pilot: run now", "autoPilotRunNow")
      .addItem("Generate Sales Nav queue", "generateSalesNavQueue"))
    .addToUi();
  try { igOnOpen_(); } catch (e) {}
}