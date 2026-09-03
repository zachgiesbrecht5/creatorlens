/**
 * ============================================================
 * ROOTFOR — Scanner Auto-Pilot (v1.0)
 * ============================================================
 * NEW FILE — add alongside Code.gs / Discovery.gs / BrandSearch.gs /
 * Pipeline.gs (Files > + > Script, name it "AutoPilot", paste, save).
 *
 * Makes the system run without you:
 *   - A "Tracked Brands" tab holds the brands you're watching, using the
 *     same syntax as brand search ("Waterdrop = waterdrop.com",
 *     "Liquid IV | Liquid I.V. = liquidiv.com").
 *   - A DAILY trigger refreshes the stalest few brands (default 2/day —
 *     ~12 search calls, leaving your ~100/day budget mostly free for
 *     manual work) and rebuilds the detail tab + Rebook Radar.
 *   - The FIRST refresh of a brand baselines silently. After that, any
 *     brand x creator pair never seen before = a NEW SPONSORSHIP, and you
 *     get an email digest the same day it's spotted. That's the edge:
 *     knowing a category brand started paying a new creator this week.
 *
 * Recipients: REPORT_RECIPIENTS Script Property if set (comma-separated),
 * otherwise the account running the trigger.
 *
 * MENU: add TWO lines to onOpen() in Discovery.gs:
 *     .addItem("Auto-pilot: setup daily scan", "autoPilotSetup")
 *     .addItem("Auto-pilot: run now", "autoPilotRunNow")
 *
 * Depends on: Code.gs (getConfig, validateConfig), BrandSearch.gs v1.2+
 * (parseBrandEntries_, runBrandPartnershipSearch_, writeBrandPartnershipsTab_,
 * buildRebookRadar_, BRAND_SEARCH).
 * ============================================================
 */

var AUTOPILOT = {
  trackedTabName: "Tracked Brands",
  knownTabName: "Known Sponsor Pairs",   // hidden baseline ledger
  brandsPerDay: 2,                       // brands refreshed per daily run
  runHour: 7,                            // local hour for the daily trigger
  alertMaxRowsPerBrand: 12,              // cap creators listed per brand in the email
};

var TRACKED_HEADERS = ["Brand Entry", "Active", "Last Refreshed", "Notes"];
var KNOWN_HEADERS = ["Key", "Brand", "Creator", "Channel URL", "Match Type", "First Seen"];


// ── MENU: SETUP ─────────────────────────────────────────────

function autoPilotSetup() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();
  validateConfig(config);
  var ss = SpreadsheetApp.openById(config.sheetId);

  // 1. Ensure the Tracked Brands tab, seeding from existing searches.
  var tracked = ss.getSheetByName(AUTOPILOT.trackedTabName);
  if (!tracked) {
    tracked = ss.insertSheet(AUTOPILOT.trackedTabName);
    tracked.getRange(1, 1, 1, TRACKED_HEADERS.length).setValues([TRACKED_HEADERS]);
    tracked.getRange(1, 1, 1, TRACKED_HEADERS.length)
      .setBackground("#1B3A5C").setFontColor("#FFFFFF").setFontWeight("bold");
    tracked.setFrozenRows(1);
    tracked.setColumnWidth(1, 320);
    tracked.setColumnWidth(2, 80);
    tracked.setColumnWidth(3, 120);
    tracked.setColumnWidth(4, 300);

    var seeds = autoPilotSeedBrands_(ss);
    if (seeds.length) {
      var rows = seeds.map(function(b) { return [b, "Yes", "", "seeded from Brand Partnerships"]; });
      tracked.getRange(2, 1, rows.length, TRACKED_HEADERS.length).setValues(rows);
    }
  }
  var activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Yes", "No"]).setAllowInvalid(true).build();
  tracked.getRange(2, 2, Math.max(tracked.getMaxRows() - 1, 1), 1).setDataValidation(activeRule);

  // 2. (Re)create the daily trigger — never duplicates.
  var triggers = ScriptApp.getProjectTriggers();
  for (var t = 0; t < triggers.length; t++) {
    if (triggers[t].getHandlerFunction() === "autoPilotDaily") {
      ScriptApp.deleteTrigger(triggers[t]);
    }
  }
  ScriptApp.newTrigger("autoPilotDaily")
    .timeBased().everyDays(1).atHour(AUTOPILOT.runHour)
    .create();

  ui.alert("Auto-pilot is on.\n\n"
    + "Daily run ~" + AUTOPILOT.runHour + ":00, refreshing the "
    + AUTOPILOT.brandsPerDay + " stalest active brands in \""
    + AUTOPILOT.trackedTabName + "\" (~" + (AUTOPILOT.brandsPerDay * 6)
    + " search calls/day).\n\n"
    + "Edit that tab to add/remove brands — same syntax as brand search, "
    + "e.g.  Waterdrop = waterdrop.com\n\n"
    + "First refresh of each brand baselines quietly; after that you'll "
    + "get an email whenever a brand starts paying a NEW creator.");
}

/** Distinct brand names already in the detail tab, as plain entries. */
function autoPilotSeedBrands_(ss) {
  var out = [];
  var seen = {};
  var detail = ss.getSheetByName(BRAND_SEARCH.tabName);
  if (!detail || detail.getLastRow() <= 1) return out;
  var brands = detail.getRange(2, 1, detail.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < brands.length; i++) {
    var b = (brands[i][0] || "").toString().trim();
    if (b && !seen[b.toLowerCase()]) { seen[b.toLowerCase()] = true; out.push(b); }
  }
  return out;
}


// ── MENU: RUN NOW ───────────────────────────────────────────

function autoPilotRunNow() {
  var summary = autoPilotDaily();
  SpreadsheetApp.getUi().alert("Auto-pilot run complete.\n\n" + summary);
}


// ── THE DAILY RUN (trigger target — no UI calls allowed) ────

function autoPilotDaily() {
  var config = getConfig();
  validateConfig(config);
  var ss = SpreadsheetApp.openById(config.sheetId);

  var tracked = ss.getSheetByName(AUTOPILOT.trackedTabName);
  if (!tracked || tracked.getLastRow() <= 1) {
    Logger.log("Auto-pilot: no Tracked Brands tab / no brands. Run autoPilotSetup.");
    return "No tracked brands. Run 'Auto-pilot: setup daily scan' first.";
  }

  var data = tracked.getRange(2, 1, tracked.getLastRow() - 1, TRACKED_HEADERS.length).getValues();
  var entries = [];
  for (var i = 0; i < data.length; i++) {
    var entryStr = (data[i][0] || "").toString().trim();
    var active = (data[i][1] || "").toString() !== "No";
    if (!entryStr || !active) continue;
    entries.push({ row: i + 2, entryStr: entryStr, lastRefreshed: (data[i][2] || "").toString() });
  }
  if (!entries.length) return "All tracked brands are inactive.";

  var todays = autoPilotPickStale_(entries, AUTOPILOT.brandsPerDay);
  var known = autoPilotReadKnown_(ss);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  var allRows = [];
  var refreshedNames = [];
  var newByBrand = {};
  var baselined = [];

  for (var j = 0; j < todays.length; j++) {
    var parsed = parseBrandEntries_(todays[j].entryStr);
    if (!parsed.length) continue;
    var entry = parsed[0];
    try {
      var r = runBrandPartnershipSearch_(config, entry);
      allRows = allRows.concat(r.rows);
      refreshedNames.push(entry.brand);

      var diff = autoPilotDiff_(known, entry.brand, r.rows);
      if (diff.baseline) {
        baselined.push(entry.brand);
      } else if (diff.newPairs.length) {
        newByBrand[entry.brand] = diff.newPairs;
      }
      // Record every pair (baseline or not) in the ledger.
      for (var p = 0; p < diff.allPairs.length; p++) {
        var pair = diff.allPairs[p];
        if (!known[pair.key]) {
          known[pair.key] = { brand: pair.brand, creator: pair.creator,
            channelUrl: pair.channelUrl, matchType: pair.matchType, firstSeen: today };
        }
      }
      tracked.getRange(todays[j].row, 3).setValue(today);
    } catch (e) {
      Logger.log("Auto-pilot: refresh failed for '" + todays[j].entryStr + "': " + e.message);
    }
  }

  if (refreshedNames.length) {
    writeBrandPartnershipsTab_(config, refreshedNames, allRows);
    buildRebookRadar_(config);
  }
  autoPilotWriteKnown_(ss, known);

  var newCount = 0;
  for (var b in newByBrand) newCount += newByBrand[b].length;
  if (newCount > 0) {
    autoPilotSendAlert_(config, ss, newByBrand, today);
  }

  var summary = "Refreshed: " + (refreshedNames.join(", ") || "none")
    + (baselined.length ? "\nBaselined (first scan, no alerts): " + baselined.join(", ") : "")
    + "\nNew sponsorships spotted: " + newCount
    + (newCount ? " — alert email sent" : "");
  Logger.log("Auto-pilot: " + summary.replace(/\n/g, " | "));
  return summary;
}

/** Stalest-first pick: never-refreshed brands first, then oldest date. Pure. */
function autoPilotPickStale_(entries, n) {
  var sorted = entries.slice().sort(function(a, b) {
    var da = a.lastRefreshed || "0000";
    var db = b.lastRefreshed || "0000";
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return sorted.slice(0, n);
}

/**
 * Diff fresh search rows against the known-pairs ledger. Pure.
 * Returns { baseline, newPairs, allPairs }.
 * baseline = this brand has NO ledger entries yet -> record silently.
 */
function autoPilotDiff_(known, brand, freshRows) {
  var brandLower = brand.toLowerCase();
  var hasBaseline = false;
  for (var k in known) {
    if (known[k].brand.toLowerCase() === brandLower) { hasBaseline = true; break; }
  }

  var allPairs = [];
  var newPairs = [];
  var seen = {};
  for (var i = 0; i < freshRows.length; i++) {
    var r = freshRows[i];
    var key = brandLower + "|" + (r.channelId || r.creator.toLowerCase());
    if (seen[key]) continue;
    seen[key] = true;
    var pair = {
      key: key, brand: brand, creator: r.creator, channelUrl: r.channelUrl || "",
      handle: r.handle || "", subs: r.subs, matchType: r.matchType,
      videoUrl: r.videoUrl || "", email: r.email || "", views: r.views || 0,
    };
    allPairs.push(pair);
    if (hasBaseline && !known[key]) newPairs.push(pair);
  }
  return { baseline: !hasBaseline, newPairs: newPairs, allPairs: allPairs };
}


// ── KNOWN-PAIRS LEDGER (hidden tab) ─────────────────────────

function autoPilotReadKnown_(ss) {
  var out = {};
  var sheet = ss.getSheetByName(AUTOPILOT.knownTabName);
  if (!sheet || sheet.getLastRow() <= 1) return out;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, KNOWN_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var key = (data[i][0] || "").toString();
    if (!key) continue;
    out[key] = {
      brand: (data[i][1] || "").toString(), creator: (data[i][2] || "").toString(),
      channelUrl: (data[i][3] || "").toString(), matchType: (data[i][4] || "").toString(),
      firstSeen: (data[i][5] || "").toString(),
    };
  }
  return out;
}

function autoPilotWriteKnown_(ss, known) {
  var sheet = ss.getSheetByName(AUTOPILOT.knownTabName);
  if (!sheet) {
    sheet = ss.insertSheet(AUTOPILOT.knownTabName);
    sheet.hideSheet();
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 1, KNOWN_HEADERS.length).setValues([KNOWN_HEADERS]);
  var keys = Object.keys(known);
  if (keys.length) {
    var rows = keys.map(function(k) {
      var p = known[k];
      return [k, p.brand, p.creator, p.channelUrl, p.matchType, p.firstSeen];
    });
    sheet.getRange(2, 1, rows.length, KNOWN_HEADERS.length).setValues(rows);
  }
}


// ── ALERT EMAIL ─────────────────────────────────────────────

function autoPilotSendAlert_(config, ss, newByBrand, dateStr) {
  var recipients = config.reportRecipients
    || Session.getEffectiveUser().getEmail();
  var total = 0;
  for (var b in newByBrand) total += newByBrand[b].length;

  var html = autoPilotEmailHtml_(newByBrand, dateStr, ss.getUrl());
  GmailApp.sendEmail(
    recipients,
    "New sponsorships spotted — " + total + " new creator deal(s) (" + dateStr + ")",
    "This email requires HTML to view.",
    { htmlBody: html }
  );
  Logger.log("Auto-pilot: alert sent to " + recipients + " (" + total + " new pairs).");
}

/** Pure HTML builder — unit-testable. */
function autoPilotEmailHtml_(newByBrand, dateStr, sheetUrl) {
  var html = '<div style="font-family: Inter, Arial, sans-serif; max-width: 680px; margin: 0 auto;">';
  html += '<div style="background: #1B3A5C; padding: 22px 28px; border-radius: 12px 12px 0 0;">';
  html += '<h1 style="color: white; margin: 0; font-size: 20px;">Rootfor Scanner — New Sponsorships Spotted</h1>';
  html += '<p style="color: rgba(255,255,255,0.6); margin: 6px 0 0; font-size: 13px;">' + dateStr + '</p>';
  html += '</div><div style="background: #F8FAFC; padding: 22px 28px;">';

  for (var brand in newByBrand) {
    var pairs = newByBrand[brand];
    html += '<h2 style="font-size: 15px; color: #1F2937; margin: 14px 0 8px;">' + brand
      + ' <span style="color: #6B7280; font-weight: 400;">— ' + pairs.length
      + ' new creator(s)</span></h2>';
    var shown = pairs.slice(0, AUTOPILOT.alertMaxRowsPerBrand);
    for (var i = 0; i < shown.length; i++) {
      var p = shown[i];
      var verified = /Verified/.test(p.matchType);
      html += '<div style="background: white; border-radius: 8px; padding: 10px 14px; margin-bottom: 6px; border-left: 3px solid '
        + (verified ? '#059669' : '#1D4ED8') + ';">';
      html += '<div style="font-size: 14px; font-weight: 600; color: #1F2937;">'
        + p.creator + ' <span style="font-weight: 400; color: #6B7280;">'
        + (p.handle ? p.handle + ' · ' : '') + (p.subs ? p.subs + ' subs' : '') + '</span></div>';
      html += '<div style="font-size: 12px; color: #6B7280; margin-top: 2px;">' + p.matchType
        + (p.email ? ' · ' + p.email : '') + '</div>';
      if (p.videoUrl) {
        html += '<div style="font-size: 12px; margin-top: 2px;"><a href="' + p.videoUrl
          + '" style="color: #1a73e8;">Watch the video</a></div>';
      }
      html += '</div>';
    }
    if (pairs.length > shown.length) {
      html += '<div style="font-size: 12px; color: #9CA3AF; margin: 4px 0 0;">+ '
        + (pairs.length - shown.length) + ' more in the sheet</div>';
    }
  }

  html += '<div style="margin-top: 18px; padding: 12px 16px; background: #FFFBEB; border-radius: 8px; font-size: 13px; color: #92400E;">';
  html += '<strong>Move fast:</strong> a brand that just started paying a new creator is actively '
    + 'buying in your category. Full detail in <a href="' + sheetUrl
    + '" style="color: #92400E;">the scanner sheet</a> — Rebook Radar + Brand Partnerships tabs.';
  html += '</div></div>';
  html += '<div style="background: #1B3A5C; padding: 12px 28px; border-radius: 0 0 12px 12px; text-align: center;">';
  html += '<p style="color: rgba(255,255,255,0.5); margin: 0; font-size: 11px;">Rootfor Scanner Auto-Pilot</p>';
  html += '</div></div>';
  return html;
}