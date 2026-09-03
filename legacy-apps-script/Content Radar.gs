/**
 * =========================================================
 * ROOTFOR - Content Radar (v1.0)
 * =========================================================
 * "What content, titles and thumbnails actually perform?"
 *
 * Content Radar : one channel, recent uploads ranked by view multiple
 *                 against that channel OWN median. Thumbnails render in
 *                 the sheet. Title-pattern lift, best publish days, best
 *                 lengths, and sponsored-vs-organic marked per video.
 *                 Costs NO search quota (playlistItems + videos.list).
 *
 * Category Radar: top-performing videos across a niche in the last 90
 *                 days, normalized by channel size so small-channel
 *                 breakouts surface. Costs 2 search calls per topic.
 * =========================================================
 */

var CRADAR = {
  contentSuffix: " - Content",
  categoryTab: "Category Radar",
  defaultVideos: 60,
  maxVideos: 200,
  freshDays: 10,        // newer than this = still accumulating, kept out of the median
  shortMaxSec: 65,      // <= this = treated as a Short and judged against Shorts
  minSide: 3,           // a title pattern needs this many videos each side to report
  categoryDays: 90,
  categoryWanted: 100
};

// ---------------------------------------------------------------- API helpers

function crChannel_(config, channelId) {
  var url = "https://www.googleapis.com/youtube/v3/channels?key=" + config.ytApiKey +
    "&id=" + encodeURIComponent(channelId) + "&part=snippet,statistics,contentDetails";
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 400) throw new Error("Channel lookup failed: " + resp.getContentText().substring(0, 160));
  var items = JSON.parse(resp.getContentText()).items || [];
  if (!items.length) throw new Error("Channel not found.");
  var it = items[0];
  return {
    id: channelId,
    title: String(it.snippet.title || channelId),
    subs: Number((it.statistics || {}).subscriberCount || 0),
    uploads: ((it.contentDetails || {}).relatedPlaylists || {}).uploads || ""
  };
}

/** Newest N upload IDs, cheapest possible (1 unit per 50). */
function crUploadIds_(config, playlistId, maxVideos) {
  var ids = [], pageToken = null, pages = 0;
  do {
    var url = "https://www.googleapis.com/youtube/v3/playlistItems?key=" + config.ytApiKey +
      "&playlistId=" + encodeURIComponent(playlistId) + "&part=contentDetails&maxResults=50" +
      (pageToken ? "&pageToken=" + pageToken : "");
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) break;
    var json = JSON.parse(resp.getContentText());
    var items = json.items || [];
    for (var i = 0; i < items.length; i++) {
      var vid = (items[i].contentDetails || {}).videoId;
      if (vid && ids.length < maxVideos) ids.push(vid);
    }
    pageToken = json.nextPageToken || null;
    pages++;
  } while (pageToken && ids.length < maxVideos && pages < 6);
  return ids;
}

/** Full video records incl. duration + thumbnails (1 unit per 50). */
function crVideos_(config, ids) {
  var out = [];
  for (var i = 0; i < ids.length; i += 50) {
    var chunk = ids.slice(i, i + 50);
    var url = "https://www.googleapis.com/youtube/v3/videos?key=" + config.ytApiKey +
      "&id=" + chunk.join(",") + "&part=snippet,statistics,contentDetails";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) continue;
    out = out.concat(JSON.parse(resp.getContentText()).items || []);
  }
  return out;
}

function crDurSec_(iso) {
  var m = String(iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function crMedian_(arr) {
  var a = arr.filter(function (x) { return isFinite(x); }).sort(function (x, y) { return x - y; });
  if (!a.length) return 0;
  var mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function crMins_(sec) {
  var m = Math.floor(sec / 60), s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function crNum_(n) { return Number(n || 0); }

// ---------------------------------------------------------------- Title patterns

/** Boolean features of a title. Order here = order in the report. */
function crFeatures_(title) {
  var t = String(title || "");
  return {
    "Has a number": /[0-9]/.test(t),
    "Question hook (?)": /\?/.test(t),
    "ALL-CAPS word": /\b[A-Z]{2,}\b/.test(t),
    "Brackets / parentheses": /[\[\(]/.test(t),
    "First person (I / My / We)": /\b(I|My|We|Our)\b/.test(t),
    "How / Why / What": /\b(how|why|what)\b/i.test(t),
    "Superlative (best / worst / ever)": /\b(best|worst|ever|never|most|ultimate)\b/i.test(t),
    "Emoji": /[\uD800-\uDBFF]/.test(t),
    "Short title (under 40 chars)": t.length < 40,
    "Long title (60+ chars)": t.length >= 60
  };
}

/** For each feature: median multiple with vs without, and the lift between. */
function crLiftTable_(rows) {
  if (!rows.length) return [];
  var keys = Object.keys(crFeatures_(rows[0].title));
  var out = [];
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k], withV = [], without = [];
    for (var i = 0; i < rows.length; i++) {
      if (!isFinite(rows[i].mult) || rows[i].fresh) continue;
      (crFeatures_(rows[i].title)[key] ? withV : without).push(rows[i].mult);
    }
    if (withV.length < CRADAR.minSide || without.length < CRADAR.minSide) continue;
    var a = crMedian_(withV), b = crMedian_(without);
    if (!b) continue;
    out.push({ key: key, n: withV.length, withM: a, withoutM: b, lift: (a / b) - 1 });
  }
  out.sort(function (x, y) { return Math.abs(y.lift) - Math.abs(x.lift); });
  return out;
}

/** Video IDs this creator was already detected as sponsored on. */
function crSponsoredIds_(ss, channelTitle) {
  var want = sanitizeTabName(channelTitle) + " - Raw";
  var sh = ss.getSheetByName(want);
  if (!sh) {
    var key = String(channelTitle).toLowerCase().replace(/[^a-z0-9]/g, "");
    var all = ss.getSheets();
    for (var s = 0; s < all.length; s++) {
      var nm = all[s].getName();
      var mm = nm.match(/^(.*) - Raw$/);
      if (mm && mm[1].toLowerCase().replace(/[^a-z0-9]/g, "") === key) { sh = all[s]; break; }
    }
  }
  var map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  var lc = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h || "").toLowerCase(); });
  var urlCol = -1, brandCol = -1;
  for (var h = 0; h < head.length; h++) {
    if (urlCol < 0 && /url|link/.test(head[h])) urlCol = h;
    if (brandCol < 0 && /brand/.test(head[h])) brandCol = h;
  }
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getValues();
  // header lookup failed? find any column that actually holds watch links
  if (urlCol < 0) {
    for (var c = 0; c < lc && urlCol < 0; c++) {
      for (var probe = 0; probe < Math.min(vals.length, 8); probe++) {
        if (/[?&]v=[\w-]{6,}/.test(String(vals[probe][c]))) { urlCol = c; break; }
      }
    }
  }
  if (urlCol < 0) return map;
  if (brandCol < 0) brandCol = 1;
  for (var r = 0; r < vals.length; r++) {
    var mu = String(vals[r][urlCol] || "").match(/[?&]v=([\w-]{6,})/);
    if (!mu) continue;
    var brand = String(vals[r][brandCol] || "").trim();
    if (!map[mu[1]]) map[mu[1]] = brand;
    else if (brand && map[mu[1]].indexOf(brand) < 0) map[mu[1]] += ", " + brand;
  }
  return map;
}

// ---------------------------------------------------------------- Content Radar

function contentRadar() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt("Content Radar",
    "Channel handle, URL or ID (e.g. @kylehateshiking).\n\n" +
    "Ranks their recent uploads by how each performed against THEIR OWN median, " +
    "shows the thumbnails in the sheet, and pulls out the title patterns, publish days " +
    "and video lengths that actually win for them.\n\n" +
    "Costs no search quota.",
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var input = r1.getResponseText().trim();
  if (!input) return;
  var r2 = ui.prompt("How many videos?",
    "Recent uploads to analyze. Default " + CRADAR.defaultVideos + ", max " + CRADAR.maxVideos + ". Blank = default.",
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var n = parseInt(String(r2.getResponseText()).replace(/[^0-9]/g, ""), 10);
  if (!isFinite(n) || n <= 0) n = CRADAR.defaultVideos;
  var res = contentRadarCore_(input, Math.min(n, CRADAR.maxVideos));
  ui.alert("Content Radar", res.msg, ui.ButtonSet.OK);
}

function contentRadarCore_(input, maxVideos) {
  var config = getConfig();
  validateConfig(config);
  var raw = String(input).trim();
  var channelId = /^UC[\w-]{10,}$/.test(raw) ? raw : resolveChannelIdFromHandle(config, raw);
  if (!channelId) throw new Error("Could not resolve that channel. Try the @handle or the channel URL.");
  var ch = crChannel_(config, channelId);
  if (!ch.uploads) throw new Error("No uploads playlist for that channel.");
  var ids = crUploadIds_(config, ch.uploads, maxVideos);
  if (!ids.length) throw new Error("No videos found on that channel.");
  var vids = crVideos_(config, ids);
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sponsored = crSponsoredIds_(ss, ch.title);
  var now = Date.now();
  var rows = [];
  for (var i = 0; i < vids.length; i++) {
    var v = vids[i];
    var sn = v.snippet || {}, st = v.statistics || {}, cd = v.contentDetails || {};
    var sec = crDurSec_(cd.duration);
    var pub = new Date(sn.publishedAt);
    var ageDays = (now - pub.getTime()) / 86400000;
    var th = ((sn.thumbnails || {}).medium || (sn.thumbnails || {}).default || {}).url || "";
    rows.push({
      id: v.id,
      title: String(sn.title || ""),
      views: crNum_(st.viewCount),
      likes: crNum_(st.likeCount),
      comments: crNum_(st.commentCount),
      sec: sec,
      isShort: sec > 0 && sec <= CRADAR.shortMaxSec,
      pub: pub,
      ageDays: ageDays,
      fresh: ageDays < CRADAR.freshDays,
      thumb: th,
      brand: sponsored[v.id] || "",
      mult: 0
    });
  }
  // Medians: mature videos only, Shorts judged against Shorts
  var longMature = rows.filter(function (r) { return !r.isShort && !r.fresh; }).map(function (r) { return r.views; });
  var shortMature = rows.filter(function (r) { return r.isShort && !r.fresh; }).map(function (r) { return r.views; });
  if (longMature.length < 5) longMature = rows.filter(function (r) { return !r.isShort; }).map(function (r) { return r.views; });
  var medLong = crMedian_(longMature) || 1;
  var medShort = crMedian_(shortMature) || 0;
  for (var r2 = 0; r2 < rows.length; r2++) {
    var base = (rows[r2].isShort && medShort) ? medShort : medLong;
    rows[r2].mult = base ? rows[r2].views / base : 0;
  }
  rows.sort(function (a, b) { return b.mult - a.mult; });
  var written = crWriteContentTab_(ss, ch, rows, medLong, medShort);
  var top = rows.filter(function (r) { return !r.fresh; })[0];
  var spCount = rows.filter(function (r) { return r.brand; }).length;
  var msg = ch.title + " - " + rows.length + " videos analyzed.\n\n" +
    "Median long-form views: " + Math.round(medLong).toLocaleString() +
    (medShort ? "\nMedian Shorts views: " + Math.round(medShort).toLocaleString() : "") +
    (top ? "\n\nTop performer: " + (Math.round(top.mult * 10) / 10) + "x - " + top.title.slice(0, 70) : "") +
    (spCount ? "\n\nSponsored videos matched from your scans: " + spCount : "") +
    "\n\nSee the \"" + written + "\" tab: patterns at the top, every video ranked below with thumbnails.";
  return { msg: msg, tab: written, rows: rows.length, medLong: medLong };
}

// ---------------------------------------------------------------- Content Radar tab

function crWriteContentTab_(ss, ch, rows, medLong, medShort) {
  var W = 14;
  var name = sanitizeTabName(ch.title) + CRADAR.contentSuffix;
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  try { sh.getFilter() && sh.getFilter().remove(); } catch (eF) {}
  function blank() { var a = []; for (var i = 0; i < W; i++) a.push(""); return a; }
  function row(vals) { var a = blank(); for (var i = 0; i < vals.length && i < W; i++) a[i] = vals[i]; return a; }
  var g = [];
  var bolds = [];
  g.push(row(["CONTENT RADAR - " + ch.title]));  bolds.push(g.length);
  g.push(row([ch.subs ? ch.subs.toLocaleString() + " subscribers" : "",
    rows.length + " videos analyzed",
    "Median long-form: " + Math.round(medLong).toLocaleString() + " views",
    medShort ? "Median Shorts: " + Math.round(medShort).toLocaleString() + " views" : ""]));
  g.push(row(["Multiple = views divided by this channel median. 2.0x means double their normal. Videos under " +
    CRADAR.freshDays + " days old are still climbing and are excluded from the median. " +
    "If the thumbnails do not appear, click Allow access on the yellow banner at the top of the sheet - one time, per sheet."]));
  g.push(blank());

  // ---- title patterns
  var lift = crLiftTable_(rows);
  g.push(row(["TITLE PATTERNS - what lifts this channel"])); bolds.push(g.length);
  g.push(row(["Pattern", "Videos with it", "Median multiple WITH", "Median multiple WITHOUT", "Lift"])); bolds.push(g.length);
  if (!lift.length) {
    g.push(row(["Not enough videos yet for a reliable read - scan more uploads."]));
  } else {
    for (var i = 0; i < Math.min(lift.length, 10); i++) {
      var lf = lift[i];
      g.push(row([lf.key, lf.n,
        Math.round(lf.withM * 100) / 100 + "x",
        Math.round(lf.withoutM * 100) / 100 + "x",
        (lf.lift >= 0 ? "+" : "") + Math.round(lf.lift * 100) + "%"]));
    }
  }
  g.push(blank());

  // ---- publish day
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var byDay = {};
  for (var d = 0; d < rows.length; d++) {
    if (rows[d].fresh || !isFinite(rows[d].mult)) continue;
    var k = DAYS[rows[d].pub.getDay()];
    (byDay[k] = byDay[k] || []).push(rows[d].mult);
  }
  g.push(row(["PUBLISH DAY"])); bolds.push(g.length);
  g.push(row(["Day", "Videos", "Median multiple"])); bolds.push(g.length);
  var dayRows = [];
  for (var dk in byDay) if (byDay[dk].length >= 2) dayRows.push([dk, byDay[dk].length, crMedian_(byDay[dk])]);
  dayRows.sort(function (a, b) { return b[2] - a[2]; });
  if (!dayRows.length) g.push(row(["Not enough data yet."]));
  for (var dr = 0; dr < dayRows.length; dr++) {
    g.push(row([dayRows[dr][0], dayRows[dr][1], Math.round(dayRows[dr][2] * 100) / 100 + "x"]));
  }
  g.push(blank());

  // ---- length buckets (long-form only)
  var BUCKETS = [[0, 480, "Under 8 min"], [480, 900, "8 - 15 min"], [900, 1800, "15 - 30 min"], [1800, 999999, "30 min +"]];
  g.push(row(["VIDEO LENGTH (long-form)"])); bolds.push(g.length);
  g.push(row(["Length", "Videos", "Median multiple"])); bolds.push(g.length);
  var anyBucket = false;
  for (var b = 0; b < BUCKETS.length; b++) {
    var vals = [];
    for (var q = 0; q < rows.length; q++) {
      var rr = rows[q];
      if (rr.isShort || rr.fresh) continue;
      if (rr.sec >= BUCKETS[b][0] && rr.sec < BUCKETS[b][1]) vals.push(rr.mult);
    }
    if (vals.length >= 2) {
      anyBucket = true;
      g.push(row([BUCKETS[b][2], vals.length, Math.round(crMedian_(vals) * 100) / 100 + "x"]));
    }
  }
  if (!anyBucket) g.push(row(["Not enough data yet."]));
  g.push(blank());

  // ---- every video
  g.push(row(["EVERY VIDEO - BEST TO WORST"])); bolds.push(g.length);
  var headRow = g.length + 1;
  g.push(row(["#", "Multiple", "Thumbnail", "Title", "Views", "Type", "Length",
    "Published", "Day", "Likes", "Comments", "Eng / 1k views", "Sponsored (from your scans)", "Link"]));
  bolds.push(g.length);
  var firstVideoRow = g.length + 1;
  for (var v = 0; v < rows.length; v++) {
    var r = rows[v];
    var eng = r.views ? Math.round((r.likes + r.comments) / r.views * 1000 * 10) / 10 : "";
    g.push([
      v + 1,
      Math.round(r.mult * 100) / 100,
      r.thumb ? '=IMAGE("' + r.thumb + '",4,45,80)' : "",
      r.title,
      r.views,
      (r.isShort ? "Short" : "Long") + (r.fresh ? " (still climbing)" : ""),
      crMins_(r.sec),
      Utilities.formatDate(r.pub, Session.getScriptTimeZone(), "yyyy-MM-dd"),
      DAYS[r.pub.getDay()].slice(0, 3),
      r.likes,
      r.comments,
      eng,
      r.brand,
      "https://www.youtube.com/watch?v=" + r.id
    ]);
  }
  sh.getRange(1, 1, g.length, W).setValues(g);
  // formatting
  sh.getRange(1, 1, 1, 1).setFontSize(14);
  for (var bi = 0; bi < bolds.length; bi++) sh.getRange(bolds[bi], 1, 1, W).setFontWeight("bold");
  sh.setFrozenRows(headRow);
  if (rows.length) {
    sh.setRowHeights(firstVideoRow, rows.length, 52);
    sh.getRange(firstVideoRow, 2, rows.length, 1).setNumberFormat('0.00"x"');
    sh.getRange(firstVideoRow, 5, rows.length, 1).setNumberFormat("#,##0");
    sh.getRange(firstVideoRow, 10, rows.length, 2).setNumberFormat("#,##0");
    // colour the multiple column
    var bg = [];
    for (var c = 0; c < rows.length; c++) {
      var mu = rows[c].mult;
      bg.push([mu >= 1.5 ? "#d9ead3" : (mu <= 0.6 ? "#f4cccc" : "#ffffff")]);
    }
    sh.getRange(firstVideoRow, 2, rows.length, 1).setBackgrounds(bg);
    sh.getRange(headRow, 1, rows.length + 1, W).createFilter();
  }
  sh.setColumnWidth(3, 92);
  sh.setColumnWidth(4, 380);
  sh.setColumnWidth(1, 40);
  try { sh.setTabColor("#ff6d01"); } catch (eT) {}
  return name;
}

// ---------------------------------------------------------------- Category Radar

function crSearchTop_(config, q, publishedAfter, pageToken) {
  var url = "https://www.googleapis.com/youtube/v3/search?key=" + config.ytApiKey +
    "&part=snippet&type=video&order=viewCount&maxResults=50" +
    "&publishedAfter=" + publishedAfter +
    "&q=" + encodeURIComponent(q) +
    (pageToken ? "&pageToken=" + pageToken : "");
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 400) {
    throw new Error("YouTube search failed: " + resp.getContentText().substring(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

function crSubsFor_(config, channelIds) {
  var map = {};
  for (var i = 0; i < channelIds.length; i += 50) {
    var chunk = channelIds.slice(i, i + 50);
    var url = "https://www.googleapis.com/youtube/v3/channels?key=" + config.ytApiKey +
      "&id=" + chunk.join(",") + "&part=statistics";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) continue;
    var items = JSON.parse(resp.getContentText()).items || [];
    for (var j = 0; j < items.length; j++) {
      map[items[j].id] = Number((items[j].statistics || {}).subscriberCount || 0);
    }
  }
  return map;
}

function categoryRadar() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt("Category Radar",
    "Topic or niche keywords - e.g. \"electrolyte hydration\", \"home renovation\", \"gaming laptop review\".\n\n" +
    "Pulls the best-performing videos in that niche from the last " + CRADAR.categoryDays + " days, " +
    "normalizes by channel size so small-channel breakouts surface, shows thumbnails, and " +
    "extracts the title formulas that win in the category.\n\n" +
    "Costs 2 of your ~100 daily search calls. Shorts excluded.",
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var topic = r.getResponseText().trim();
  if (!topic) return;
  var res = categoryRadarCore_(topic);
  ui.alert("Category Radar", res.msg, ui.ButtonSet.OK);
}

function categoryRadarCore_(topic) {
  var config = getConfig();
  validateConfig(config);
  var after = new Date(Date.now() - CRADAR.categoryDays * 86400000).toISOString();
  var ids = [], token = null, calls = 0;
  do {
    var page = crSearchTop_(config, topic, after, token);
    calls++;
    var items = page.items || [];
    for (var i = 0; i < items.length; i++) {
      var vid = (items[i].id || {}).videoId;
      if (vid && ids.indexOf(vid) < 0) ids.push(vid);
    }
    token = page.nextPageToken || null;
  } while (token && ids.length < CRADAR.categoryWanted && calls < 2);
  if (!ids.length) throw new Error("No videos found for that topic in the last " + CRADAR.categoryDays + " days.");
  var vids = crVideos_(config, ids);
  var chIds = [];
  for (var v = 0; v < vids.length; v++) {
    var cid = (vids[v].snippet || {}).channelId;
    if (cid && chIds.indexOf(cid) < 0) chIds.push(cid);
  }
  var subs = crSubsFor_(config, chIds);
  var rows = [];
  for (var k = 0; k < vids.length; k++) {
    var vv = vids[k];
    var sn = vv.snippet || {}, st = vv.statistics || {}, cd = vv.contentDetails || {};
    var sec = crDurSec_(cd.duration);
    if (sec > 0 && sec <= CRADAR.shortMaxSec) continue;  // skip Shorts
    var s = subs[sn.channelId] || 0;
    var views = crNum_(st.viewCount);
    rows.push({
      id: vv.id,
      title: String(sn.title || ""),
      channel: String(sn.channelTitle || ""),
      channelId: sn.channelId,
      subs: s,
      views: views,
      likes: crNum_(st.likeCount),
      comments: crNum_(st.commentCount),
      sec: sec,
      pub: new Date(sn.publishedAt),
      thumb: ((sn.thumbnails || {}).medium || (sn.thumbnails || {}).default || {}).url || "",
      vps: s ? views / s : 0,
      fresh: false,
      mult: 0
    });
  }
  if (!rows.length) throw new Error("Only Shorts came back for that topic - try more specific keywords.");
  // performance metric for the pattern analysis = views per subscriber
  for (var q = 0; q < rows.length; q++) rows[q].mult = rows[q].vps;
  rows.sort(function (a, b) { return b.views - a.views; });
  var tab = crWriteCategoryTab_(SpreadsheetApp.openById(config.sheetId), topic, rows, calls);
  var breakouts = rows.filter(function (x) { return x.subs && x.views > x.subs * 2; }).length;
  var msg = "Topic: " + topic + "\n" +
    rows.length + " long-form videos from the last " + CRADAR.categoryDays + " days.\n" +
    calls + " search call(s) used.\n\n" +
    "Breakouts (views over 2x the channel subscriber count): " + breakouts +
    "\n\nSee the \"" + tab + "\" tab - winning title formulas at the top, every video with thumbnails below.";
  return { msg: msg, tab: tab, rows: rows.length };
}

function crWriteCategoryTab_(ss, topic, rows, calls) {
  var W = 12;
  var sh = ss.getSheetByName(CRADAR.categoryTab);
  if (!sh) sh = ss.insertSheet(CRADAR.categoryTab);
  sh.clear();
  try { sh.getFilter() && sh.getFilter().remove(); } catch (eF) {}
  function blank() { var a = []; for (var i = 0; i < W; i++) a.push(""); return a; }
  function row(vals) { var a = blank(); for (var i = 0; i < vals.length && i < W; i++) a[i] = vals[i]; return a; }
  var g = [], bolds = [];
  g.push(row(["CATEGORY RADAR - " + topic])); bolds.push(g.length);
  g.push(row([rows.length + " long-form videos", "Last " + CRADAR.categoryDays + " days",
    "Ranked by views", calls + " search call(s) used",
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")]));
  g.push(row(["Views/Sub over 1.0 means the video reached beyond the channel own audience - that is the algorithm pushing it. " +
    "If the thumbnails do not appear, click Allow access on the yellow banner at the top of the sheet - one time, per sheet."]));
  g.push(blank());
  var lift = crLiftTable_(rows);
  g.push(row(["WINNING TITLE FORMULAS IN THIS CATEGORY"])); bolds.push(g.length);
  g.push(row(["Pattern", "Videos with it", "Median views/sub WITH", "Median views/sub WITHOUT", "Lift"])); bolds.push(g.length);
  if (!lift.length) g.push(row(["Not enough spread for a reliable read."]));
  for (var i = 0; i < Math.min(lift.length, 10); i++) {
    var lf = lift[i];
    g.push(row([lf.key, lf.n,
      Math.round(lf.withM * 100) / 100,
      Math.round(lf.withoutM * 100) / 100,
      (lf.lift >= 0 ? "+" : "") + Math.round(lf.lift * 100) + "%"]));
  }
  g.push(blank());
  g.push(row(["TOP VIDEOS IN THE CATEGORY"])); bolds.push(g.length);
  var headRow = g.length + 1;
  g.push(row(["#", "Views", "Views/Sub", "Thumbnail", "Title", "Channel", "Subs",
    "Published", "Length", "Likes", "Comments", "Link"])); bolds.push(g.length);
  var first = g.length + 1;
  for (var v = 0; v < rows.length; v++) {
    var r = rows[v];
    g.push([
      v + 1, r.views, r.subs ? Math.round(r.vps * 100) / 100 : "",
      r.thumb ? '=IMAGE("' + r.thumb + '",4,45,80)' : "",
      r.title, r.channel, r.subs,
      Utilities.formatDate(r.pub, Session.getScriptTimeZone(), "yyyy-MM-dd"),
      crMins_(r.sec), r.likes, r.comments,
      "https://www.youtube.com/watch?v=" + r.id
    ]);
  }
  sh.getRange(1, 1, g.length, W).setValues(g);
  sh.getRange(1, 1, 1, 1).setFontSize(14);
  for (var bi = 0; bi < bolds.length; bi++) sh.getRange(bolds[bi], 1, 1, W).setFontWeight("bold");
  sh.setFrozenRows(headRow);
  if (rows.length) {
    sh.setRowHeights(first, rows.length, 52);
    sh.getRange(first, 2, rows.length, 1).setNumberFormat("#,##0");
    sh.getRange(first, 7, rows.length, 1).setNumberFormat("#,##0");
    sh.getRange(first, 10, rows.length, 2).setNumberFormat("#,##0");
    var bg = [];
    for (var c = 0; c < rows.length; c++) bg.push([rows[c].vps >= 1 ? "#d9ead3" : "#ffffff"]);
    sh.getRange(first, 3, rows.length, 1).setBackgrounds(bg);
    sh.getRange(headRow, 1, rows.length + 1, W).createFilter();
  }
  sh.setColumnWidth(1, 40);
  sh.setColumnWidth(4, 92);
  sh.setColumnWidth(5, 360);
  try { sh.setTabColor("#ff6d01"); } catch (eT) {}
  return CRADAR.categoryTab;
}
