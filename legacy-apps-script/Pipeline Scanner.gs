/**
 * ============================================================
 * ROOTFOR — Campaign Pipeline (v1.0)
 * ============================================================
 * NEW FILE — add alongside Code.gs / Discovery.gs / BrandSearch.gs
 * (Files > + > Script, name it "Pipeline", paste, save).
 *
 * One menu action does the whole flow:
 *   1. Reads the Rebook Radar shortlist (Rebooked = Yes / Recurring).
 *   2. For creators not yet enriched: pulls their last 90 DAYS of uploads,
 *      computes founder-grade metrics (median long-form views, upload
 *      cadence, how often they run sponsors), writes their "<Name> - Raw"
 *      tab, and registers them in the Scan Registry. Capped per run
 *      (Apps Script 6-min limit) — just re-run to continue; already-
 *      enriched creators are skipped for free.
 *   3. Creates/updates a SEPARATE client-facing spreadsheet
 *      ("<Campaign> — Creator Pipeline") that a founder can be given
 *      directly: key metrics per creator + an engagement-stage dropdown
 *      (Shortlisted → Contacted → Negotiating Rates → Contract Sent →
 *      Contract Signed → In Production → Video Approval → Scheduled →
 *      Live → Complete / Passed).
 *      Founder-editable columns (Status, Rate, Owner, Next Step, Notes)
 *      are PRESERVED on every refresh — refreshes only update metrics.
 *
 * MENU: add ONE line to onOpen() in Discovery.gs, e.g. after the
 * brand-partnerships item:
 *
 *     .addItem("Build client pipeline", "buildClientPipeline")
 *
 * Depends on: Code.gs (getConfig, validateConfig, scoreSignals,
 * extractBrands, normalizeBrandName, isJunkBrand, writeAdHocRawTab,
 * sanitizeTabName, buildSelfRefKeys, isSelfRefDynamic, MASS_SPONSOR_BRANDS),
 * Discovery.gs (getScanRegistryIds, registerScannedChannel),
 * BrandSearch.gs (BRAND_SEARCH tab names, BRAND_PAID_RE).
 * ============================================================
 */

var PIPELINE = {
  lookbackDays: 90,          // channel-scan window for shortlisted creators
  maxEnrichPerRun: 6,        // creators enriched per run (re-run to continue)
  uploadsToSample: 50,       // most-recent uploads examined (max 50)
  shortsMaxSeconds: 210,     // < 3.5 min counts as a Short
  includeRecurring: true,    // include Rebooked = "Recurring" creators
  metricsTabName: "Pipeline Metrics",   // internal cache tab (main sheet)
  clientTabName: "Creator Pipeline",    // tab inside the client spreadsheet
};

// Extend the shared alias map (Code.gs) with hydration/beverage brands so
// client-facing sheets spell them correctly. Runs at load; guarded in case
// of file-order changes (worst case: cosmetic capitalization only).
if (typeof BRAND_ALIASES !== "undefined") {
  (function() {
    var extra = {
      "lmnt": "LMNT", "drinklmnt": "LMNT",
      "olipop": "OLIPOP", "drinkolipop": "OLIPOP",
      "poppi": "poppi", "drinkpoppi": "poppi",
      "cirkul": "Cirkul", "drinkcirkul": "Cirkul",
      "air up": "air up", "airup": "air up",
      "waterdrop": "Waterdrop",
      "liquid iv": "Liquid I.V.", "liquidiv": "Liquid I.V.", "liquid i v": "Liquid I.V.",
      "sodastream": "SodaStream", "spindrift": "Spindrift",
      "owala": "Owala", "owalalife": "Owala",
      "larq": "LARQ", "livelarq": "LARQ",
      "lifestraw": "LifeStraw", "grayl": "GRAYL",
      "hydrant": "Hydrant", "drinkhydrant": "Hydrant",
      "waterboy": "Waterboy", "nuun": "Nuun", "dripdrop": "DripDrop",
      "stanley1913": "Stanley", "brumate": "BruMate",
      "hydroflask": "Hydro Flask", "hydro flask": "Hydro Flask",
      "yeti": "YETI",
    };
    for (var k in extra) {
      if (!BRAND_ALIASES[k]) BRAND_ALIASES[k] = extra[k];
    }
  })();
}

var PIPELINE_STAGES = [
  "Shortlisted", "Contacted", "Negotiating Rates", "Contract Sent",
  "Contract Signed", "In Production", "Video Approval", "Scheduled",
  "Live", "Complete", "Passed / No Fit"
];

var PIPELINE_HEADERS = [
  "Creator", "Handle", "Channel", "Subscribers",
  "Median Views (LF, 90d)", "Uploads (90d)", "Sponsored Uploads (90d)",
  "Category Proof", "Best Evidence Video", "Contact Email",
  "Status", "Rate", "Owner", "Next Step", "Notes", "Last Refreshed"
];
// Founder-editable columns preserved across refreshes (0-based):
var PIPELINE_KEEP_COLS = [10, 11, 12, 13, 14]; // Status, Rate, Owner, Next Step, Notes

var METRICS_HEADERS = [
  "Channel ID", "Creator", "Median LF Views", "Uploads 90d",
  "Sponsored 90d", "Last Upload", "Computed"
];


// ── ENTRY POINT (menu: "Build client pipeline") ─────────────

function buildClientPipeline() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();
  validateConfig(config);
  var ss = SpreadsheetApp.openById(config.sheetId);

  var radar = ss.getSheetByName(BRAND_SEARCH.rebookTabName);
  if (!radar || radar.getLastRow() <= 1) {
    ui.alert("No Rebook Radar data yet. Run \"Search brand partnerships\" first.");
    return;
  }

  var props = PropertiesService.getScriptProperties();
  var lastName = props.getProperty("PIPELINE_LAST_CAMPAIGN") || "Roam Water";
  var resp = ui.prompt(
    "Build client pipeline",
    "Campaign / brand name (one pipeline spreadsheet per campaign):\n"
      + "e.g.  " + lastName,
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var campaign = resp.getResponseText().trim() || lastName;
  props.setProperty("PIPELINE_LAST_CAMPAIGN", campaign);

  // 1. Shortlist from Rebook Radar (dedupe by channel, best row wins).
  var shortlist = readRadarShortlist_(radar);
  if (shortlist.length === 0) {
    ui.alert("No shortlist rows found (Rebooked = Yes"
      + (PIPELINE.includeRecurring ? " or Recurring" : "") + ").");
    return;
  }

  // 2. Enrich up to maxEnrichPerRun creators with a 90-day channel scan.
  var metrics = readMetricsCache_(ss);
  var registry = getScanRegistryIds(ss);
  var enriched = 0;
  for (var i = 0; i < shortlist.length && enriched < PIPELINE.maxEnrichPerRun; i++) {
    var c = shortlist[i];
    if (!c.channelId || metrics[c.channelId]) continue;
    try {
      var m = enrichCreator90d_(config, ss, c, registry);
      if (m) { metrics[c.channelId] = m; enriched++; }
    } catch (e) {
      Logger.log("Enrichment failed for " + c.creator + ": " + e.message);
    }
  }
  writeMetricsCache_(ss, metrics);

  var pending = shortlist.filter(function(c) {
    return c.channelId && !metrics[c.channelId];
  }).length;

  // 3. Create/update the client spreadsheet.
  var clientSS = getOrCreateClientSheet_(props, campaign);
  var written = writeClientPipeline_(clientSS, campaign, shortlist, metrics);

  ui.alert("Pipeline updated for \"" + campaign + "\".\n\n"
    + shortlist.length + " shortlisted creators (" + written + " rows written)\n"
    + enriched + " enriched with 90-day scans this run"
    + (pending > 0 ? ("; " + pending + " still pending — run this again to continue")
                   : "; all creators enriched") + "\n\n"
    + "Client sheet (share this one with the founder):\n"
    + clientSS.getUrl());
}


// ── SHORTLIST FROM REBOOK RADAR ─────────────────────────────

function readRadarShortlist_(radar) {
  var lastCol = radar.getLastColumn();
  var headers = radar.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = {};
  for (var h = 0; h < headers.length; h++) col[headers[h]] = h;
  var data = radar.getRange(2, 1, radar.getLastRow() - 1, lastCol).getValues();

  var byChannel = {};
  var order = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rebooked = (row[col["Rebooked"]] || "").toString();
    var keep = rebooked === "Yes" || (PIPELINE.includeRecurring && rebooked === "Recurring");
    if (!keep) continue;

    var url = (row[col["Channel URL"]] || "").toString();
    var channelId = "";
    var m = url.match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/);
    if (m) channelId = m[1];
    var key = channelId || url || (row[col["Creator"]] || "").toString().toLowerCase();
    if (!key) continue;

    var brand = (row[col["Brand"]] || "").toString();
    var videos = Number(row[col["Videos"]]) || 0;
    var proofBit = brand + " x" + videos + (rebooked === "Yes" ? " (rebooked)" : " (recurring)");

    if (!byChannel[key]) {
      byChannel[key] = {
        channelId: channelId,
        creator: (row[col["Creator"]] || "").toString(),
        handle: (row[col["Handle"]] || "").toString(),
        channelUrl: url,
        subs: row[col["Subscribers"]],
        proof: [proofBit],
        rebookedAny: rebooked === "Yes",
        example: (row[col["Example Video"]] || "").toString(),
        email: col["Contact Email"] !== undefined
          ? (row[col["Contact Email"]] || "").toString() : "",
        brandCount: col["Category Brands"] !== undefined
          ? (Number(row[col["Category Brands"]]) || 1) : 1,
      };
      order.push(key);
    } else {
      var c = byChannel[key];
      if (c.proof.indexOf(proofBit) === -1) c.proof.push(proofBit);
      if (rebooked === "Yes") c.rebookedAny = true;
      if (!c.email && col["Contact Email"] !== undefined && row[col["Contact Email"]]) {
        c.email = row[col["Contact Email"]].toString();
      }
    }
  }

  var out = order.map(function(k) { return byChannel[k]; });
  out.sort(function(a, b) {
    var ra = a.rebookedAny ? 0 : 1, rb = b.rebookedAny ? 0 : 1;
    return ra - rb || b.brandCount - a.brandCount;
  });
  return out;
}


// ── 90-DAY ENRICHMENT (metrics + Raw tab + registry) ────────

function enrichCreator90d_(config, ss, creator, registry) {
  var channelId = creator.channelId;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PIPELINE.lookbackDays);

  // Last N uploads via UC->UU swap (1 call).
  var uu = "UU" + channelId.substring(2);
  var pUrl = "https://www.googleapis.com/youtube/v3/playlistItems"
    + "?key=" + config.ytApiKey
    + "&playlistId=" + uu
    + "&part=contentDetails"
    + "&maxResults=" + PIPELINE.uploadsToSample;
  var pResp = UrlFetchApp.fetch(pUrl, { muteHttpExceptions: true });
  if (pResp.getResponseCode() >= 400) return null;
  var pItems = JSON.parse(pResp.getContentText()).items || [];

  var ids = [];
  var lastUpload = "";
  for (var i = 0; i < pItems.length; i++) {
    var cd = pItems[i].contentDetails || {};
    if (!cd.videoId) continue;
    if (cd.videoPublishedAt) {
      if (!lastUpload || cd.videoPublishedAt > lastUpload) lastUpload = cd.videoPublishedAt;
      if (new Date(cd.videoPublishedAt) < cutoff) continue; // outside 90d
    }
    ids.push(cd.videoId);
  }

  var videos = [];
  for (var b = 0; b < ids.length; b += 50) {
    var vUrl = "https://www.googleapis.com/youtube/v3/videos"
      + "?key=" + config.ytApiKey
      + "&id=" + ids.slice(b, b + 50).join(",")
      + "&part=snippet,statistics,contentDetails";
    var vResp = UrlFetchApp.fetch(vUrl, { muteHttpExceptions: true });
    if (vResp.getResponseCode() >= 400) continue;
    videos = videos.concat(JSON.parse(vResp.getContentText()).items || []);
  }

  var stats = computePipelineMetrics_(videos);

  // Write the "<Name> - Raw" tab (90-day window) + register the scan.
  var selfKeys = buildSelfRefKeys(creator.creator, creator.handle);
  var results = extractSponsorRows_(videos, selfKeys);
  var tabBase = sanitizeTabName(creator.creator);
  try {
    writeAdHocRawTab(config, tabBase, "Pipeline", results);
    registerScannedChannel(ss, channelId, creator.creator, tabBase + " - Raw");
    registry[channelId] = true;
  } catch (e) {
    Logger.log("Raw tab write failed for " + creator.creator + ": " + e.message);
  }

  return {
    channelId: channelId,
    creator: creator.creator,
    medianLF: stats.medianLF,
    uploads90: stats.uploads,
    sponsored90: stats.sponsored + " of " + stats.uploads,
    lastUpload: lastUpload ? lastUpload.substring(0, 10) : "",
    computed: new Date().toISOString().substring(0, 10),
  };
}

/**
 * Founder metrics from a set of <=90-day videos. Pure — unit-testable.
 * medianLF = median views of long-form uploads (>= shortsMaxSeconds);
 * falls back to all uploads when the channel is Shorts-heavy.
 * sponsored = uploads whose title/description/tags carry paid language.
 */
function computePipelineMetrics_(videos) {
  var lfViews = [];
  var allViews = [];
  var sponsored = 0;

  for (var i = 0; i < videos.length; i++) {
    var v = videos[i];
    var sn = v.snippet || {};
    var views = Number((v.statistics || {}).viewCount || 0);
    var fullText = (sn.title || "") + "\n" + (sn.description || "") + "\n"
      + (sn.tags || []).join(" ");
    if (BRAND_PAID_RE.test(fullText)) sponsored++;

    if (views > 0) {
      allViews.push(views);
      var secs = pipelineDurationSecs_((v.contentDetails || {}).duration || "");
      if (secs >= PIPELINE.shortsMaxSeconds) lfViews.push(views);
    }
  }

  var pool = lfViews.length >= 3 ? lfViews : allViews;
  return {
    uploads: videos.length,
    sponsored: sponsored,
    medianLF: pool.length ? pipelineMedian_(pool) : "",
  };
}

function pipelineDurationSecs_(iso) {
  var m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

function pipelineMedian_(arr) {
  var s = arr.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Same row shape scanAdHoc produces, so writeAdHocRawTab can write it. */
function extractSponsorRows_(videos, selfKeys) {
  var results = [];
  for (var v = 0; v < videos.length; v++) {
    var sn = videos[v].snippet || {};
    var fullText = (sn.title || "") + "\n" + (sn.description || "") + "\n"
      + (sn.tags || []).join(" ");
    var signals = scoreSignals(fullText);
    var brands = extractBrands(fullText, sn.description || "");
    var seen = {};

    for (var b = 0; b < brands.length; b++) {
      var normalized = normalizeBrandName(brands[b].name);
      if (!normalized || normalized.length < 2) continue;
      var lower = normalized.toLowerCase();
      if (isJunkBrand(lower)) continue;
      if (isSelfRefDynamic(lower, selfKeys)) continue;
      if (seen[lower]) continue;
      seen[lower] = true;

      var confidence = signals.score + brands[b].score;
      results.push({
        normalizedBrand: normalized,
        confidenceScore: confidence,
        confidenceLabel: confidence >= 5 ? "High" : confidence >= 3 ? "Medium" : "Low",
        videoTitle: sn.title || "",
        videoUrl: "https://www.youtube.com/watch?v=" + videos[v].id,
        publishedAt: sn.publishedAt || "",
        views: (videos[v].statistics || {}).viewCount || "0",
        signals: signals.reasons.join(", "),
        evidence: brands[b].evidence,
        isMassSponsor: MASS_SPONSOR_BRANDS.indexOf(lower) > -1,
      });
    }
  }
  return results;
}


// ── METRICS CACHE (internal tab in the main sheet) ──────────

function readMetricsCache_(ss) {
  var out = {};
  var sheet = ss.getSheetByName(PIPELINE.metricsTabName);
  if (!sheet || sheet.getLastRow() <= 1) return out;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, METRICS_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var id = (data[i][0] || "").toString();
    if (!id) continue;
    out[id] = {
      channelId: id, creator: (data[i][1] || "").toString(),
      medianLF: data[i][2], uploads90: data[i][3], sponsored90: data[i][4],
      lastUpload: (data[i][5] || "").toString(), computed: (data[i][6] || "").toString(),
    };
  }
  return out;
}

function writeMetricsCache_(ss, metrics) {
  var sheet = ss.getSheetByName(PIPELINE.metricsTabName);
  if (!sheet) {
    sheet = ss.insertSheet(PIPELINE.metricsTabName);
    sheet.hideSheet();
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 1, METRICS_HEADERS.length).setValues([METRICS_HEADERS]);
  var keys = Object.keys(metrics);
  if (keys.length) {
    var rows = keys.map(function(k) {
      var m = metrics[k];
      return [m.channelId, m.creator, m.medianLF, m.uploads90, m.sponsored90,
        m.lastUpload, m.computed];
    });
    sheet.getRange(2, 1, rows.length, METRICS_HEADERS.length).setValues(rows);
  }
}


// ── CLIENT SPREADSHEET ──────────────────────────────────────

function pipelineSlug_(name) {
  return (name || "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "").substring(0, 40);
}

function getOrCreateClientSheet_(props, campaign) {
  var key = "PIPELINE_SHEET_" + pipelineSlug_(campaign);
  var id = props.getProperty(key);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* deleted — recreate */ }
  }
  var created = SpreadsheetApp.create(campaign + " — Creator Pipeline");
  props.setProperty(key, created.getId());
  return created;
}

/**
 * Merge logic (pure, testable): existing sheet rows + fresh rows keyed by
 * Channel URL. Fresh metrics overwrite; PIPELINE_KEEP_COLS survive.
 * existingRows/freshRows are arrays matching PIPELINE_HEADERS.
 */
function mergePipelineRows_(existingRows, freshRows) {
  var keepByUrl = {};
  for (var e = 0; e < existingRows.length; e++) {
    var url = (existingRows[e][2] || "").toString();
    if (url) keepByUrl[url] = existingRows[e];
  }
  var out = [];
  var seenUrl = {};
  for (var f = 0; f < freshRows.length; f++) {
    var row = freshRows[f].slice();
    var u = (row[2] || "").toString();
    seenUrl[u] = true;
    var old = keepByUrl[u];
    if (old) {
      for (var k = 0; k < PIPELINE_KEEP_COLS.length; k++) {
        var c = PIPELINE_KEEP_COLS[k];
        if (old[c] !== "" && old[c] !== null && old[c] !== undefined) row[c] = old[c];
      }
    }
    out.push(row);
  }
  // Rows the founder is working that dropped off the shortlist stay put.
  for (var e2 = 0; e2 < existingRows.length; e2++) {
    var u2 = (existingRows[e2][2] || "").toString();
    if (u2 && !seenUrl[u2]) out.push(existingRows[e2]);
  }
  return out;
}

function writeClientPipeline_(clientSS, campaign, shortlist, metrics) {
  var sheet = clientSS.getSheetByName(PIPELINE.clientTabName);
  if (!sheet) {
    sheet = clientSS.getSheets()[0];
    sheet.setName(PIPELINE.clientTabName);
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  var freshRows = shortlist.map(function(c) {
    var m = metrics[c.channelId] || {};
    return [
      c.creator,
      c.handle,
      c.channelUrl,
      c.subs,
      m.medianLF !== undefined ? m.medianLF : "",
      m.uploads90 !== undefined ? m.uploads90 : "",
      m.sponsored90 || "",
      c.proof.join(", "),
      c.example,
      c.email,
      "Shortlisted",   // Status default; preserved once edited
      "",              // Rate
      "",              // Owner
      "",              // Next Step
      "",              // Notes
      today,
    ];
  });

  var existingRows = [];
  if (sheet.getLastRow() > 1) {
    existingRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PIPELINE_HEADERS.length).getValues();
  }
  var merged = mergePipelineRows_(existingRows, freshRows);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, PIPELINE_HEADERS.length).setValues([PIPELINE_HEADERS]);
  sheet.getRange(1, 1, 1, PIPELINE_HEADERS.length)
    .setBackground("#1B3A5C").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  if (merged.length > 0) {
    sheet.getRange(2, 1, merged.length, PIPELINE_HEADERS.length).setValues(merged);

    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(PIPELINE_STAGES).setAllowInvalid(true).build();
    sheet.getRange(2, 11, merged.length, 1).setDataValidation(statusRule);

    var statusRange = sheet.getRange(2, 11, merged.length, 1);
    sheet.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Shortlisted").setBackground("#F3F4F6").setFontColor("#374151").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Contacted").setBackground("#DBEAFE").setFontColor("#1D4ED8").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Negotiating Rates").setBackground("#E0E7FF").setFontColor("#4338CA").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Contract Sent").setBackground("#EDE9FE").setFontColor("#6D28D9").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Contract Signed").setBackground("#F5F3FF").setFontColor("#7C3AED").setBold(true).setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("In Production").setBackground("#FEF3C7").setFontColor("#92400E").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Video Approval").setBackground("#FFEDD5").setFontColor("#C2410C").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Scheduled").setBackground("#CFFAFE").setFontColor("#0E7490").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Live").setBackground("#D1FAE5").setFontColor("#059669").setBold(true).setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Complete").setBackground("#A7F3D0").setFontColor("#065F46").setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Passed / No Fit").setBackground("#FEE2E2").setFontColor("#B91C1C").setRanges([statusRange]).build(),
    ]);

    // Number formatting for the metric columns.
    sheet.getRange(2, 4, merged.length, 2).setNumberFormat("#,##0");
  }

  var widths = [190, 140, 220, 110, 150, 90, 150, 260, 220, 200, 150, 100, 110, 200, 260, 110];
  for (var w = 0; w < widths.length; w++) sheet.setColumnWidth(w + 1, widths[w]);

  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), PIPELINE_HEADERS.length).createFilter();

  Logger.log("Client pipeline '" + campaign + "': " + merged.length + " rows.");
  return merged.length;
}