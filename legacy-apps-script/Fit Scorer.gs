/**
 * ============================================================
 * ROOTFOR - Fit Scorer (peer lookalike sourcing + fit scoring)
 * ============================================================
 * Built Sep 2 2026. Replaces category-guessed brand sourcing with
 * evidence: a brand is a candidate for a creator when it has PAID
 * that creator's peers (same niche, similar size). Every candidate
 * is scored, cross-checked against the team outreach tracker, and
 * written to "<creator> - Candidates" for Zach to approve before
 * any draft is written.
 *
 * Tabs
 *   Peer Sets                Creator | Peer handle | Platform | Weight | Notes
 *   <creator> - Candidates   scored, sorted, with an Approve column
 *
 * Entry points (Run from the editor or the Fit Scorer menu)
 *   fitBuildForCreatorPrompt()  - prompt for a creator handle, build
 *   fitRefreshAll()             - rebuild every creator in Peer Sets
 *   fitQueueUnscannedPeers()    - add unscanned IG peers to IG Scan List and scan them
 *   fitInstallNightly()         - 3am daily refresh trigger
 *   fitEnsureTrackerColumn()    - adds "Fit Score" to the tracker's Outreach Log header
 *
 * Score (0-100)
 *   paid peers      1 peer 25 / 2 peers 40 / 3+ peers 50 (Medium-confidence peers count half)
 *   recency         last peer deal <=90d +15, <=180d +10, <=365d +5
 *   repeat partner  brand is a REPEAT PARTNER in IG Rebook Radar +10
 *   breadth         Engine sees 3+ creators booked +10, 6+ +15; ACTIVE WAVE +5
 *   warm            brand has replied to Rootfor before +20
 *   mass sponsor    -10 (Temu/Amazon style; they ghost)
 * Status
 *   OK        draftable once Approved
 *   WARM      replied before; route says whose thread to revive
 *   RECENT    pitched for THIS creator inside the dedupe window; not draftable
 *   EXCLUDED  on the tracker's EXCLUSIONS tab
 *   NEVER     Zach marked Never in the Approve column
 */

var FIT = {
  peerTab: "Peer Sets",
  candSuffix: " - Candidates",
  trackerId: (typeof OPP !== "undefined" && OPP.trackerId) ? OPP.trackerId : "16zwA7EvNqDQPo5XAoh-nRgsiHqSmdJm_7poES-rxuOg",
  dedupeDays: 60,          // Zach, Jul 29 2026
  collisionDays: 7,        // teammate same-domain inside a week = flag
  lookbackDays: 365,       // peer deals older than this are ignored
  minBrandLen: 3,
  approveOptions: ["Approve", "Skip", "Never"],
  // tracker "Creator" cells are free text ("Jimmy", "@Andy Yen", "@thelawyerangela"); map them to handles
  creatorAliases: {
    jimmyeverydayy: ["jimmy", "jimmyjohnson"], andyyyen: ["andy", "andyyen"], thelawyerangela: ["angela"],
    theleadlady: ["chelsea"], yoojinslife: ["yoojin"], cafeandy_: ["cafeandy"], cafebychris: ["chris"],
    okayainsley: ["ainsley", "ainsleybo"], mariianarangel: ["mariana"], bytianamichele: ["tiana"],
    vicccromero: ["vic"], briangoeslive: ["brian"], treydrechsel: ["trey"], lizziebowker: ["lizzie"]
  },
  massBrands: ["amazon", "temu", "shein", "aliexpress", "tiktokshop", "ebay"],
  headers: [
    "Rank", "Brand", "Fit score", "Status", "Route", "Paid peers", "Peers",
    "Peer deals", "Last peer deal", "Repeat partner", "Creators booked (Engine)",
    "Tracker history", "Score notes", "Peer example", "Evidence URL", "Approve", "Notes"
  ]
};

// ---- helpers ------------------------------------------------------------

function fitNorm_(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/^@/, "").replace(/\b(the|inc|llc|co|official|brand|usa|us)\b/g, "").replace(/[^a-z0-9]/g, "");
}

/** True when a tracker Creator cell refers to the same person as a handle. */
function fitSameCreator_(cell, handle) {
  var a = fitNorm_(cell), b = fitNorm_(handle);
  if (!a || !b) return false;
  if (a === b) return true;
  var al = FIT.creatorAliases[String(handle).replace(/^@/, "").toLowerCase()] || [];
  for (var i = 0; i < al.length; i++) if (fitNorm_(al[i]) === a) return true;
  if (a.length >= 4 && b.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true;
  return false;
}

function fitDays_(d) {
  if (!d) return 99999;
  var t = (d instanceof Date) ? d.getTime() : Date.parse(String(d));
  if (isNaN(t)) return 99999;
  return Math.floor((Date.now() - t) / 86400000);
}

function fitFmt_(d) {
  if (!d) return "";
  var t = (d instanceof Date) ? d : new Date(d);
  if (isNaN(t.getTime())) return String(d);
  return Utilities.formatDate(t, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function fitSheet_() {
  return SpreadsheetApp.openById(getConfig().sheetId);
}

function fitHeaderIdx_(header, re) {
  for (var i = 0; i < header.length; i++) if (re.test(String(header[i]))) return i;
  return -1;
}

function fitIsJunk_(brand) {
  if (!brand || brand.length < FIT.minBrandLen) return true;
  if (/unknown|check post|\(\?\)/i.test(brand)) return true;
  if (typeof isJunkBrand === "function") { try { if (isJunkBrand(brand)) return true; } catch (e) {} }
  if (/^(ad|sponsored|partner|gifted|collab|link|shop|sale|giveaway|new|love|today)$/i.test(brand)) return true;
  return false;
}

// ---- Peer Sets ------------------------------------------------------------

function fitEnsurePeerTab_() {
  var ss = fitSheet_();
  var sh = ss.getSheetByName(FIT.peerTab);
  if (!sh) {
    sh = ss.insertSheet(FIT.peerTab);
    sh.getRange(1, 1, 1, 5).setValues([["Creator", "Peer handle", "Platform", "Weight", "Notes"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.setTabColor("#6aa84f");
  }
  return sh;
}

function fitPeersFor_(creator) {
  var sh = fitEnsurePeerTab_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, 5).getValues();
  var want = fitNorm_(creator), out = [];
  rows.forEach(function (r) {
    if (fitNorm_(r[0]) !== want) return;
    var h = String(r[1] || "").trim().replace(/^@/, "");
    if (!h) return;
    out.push({ handle: h, platform: /yt|youtube/i.test(String(r[2])) ? "YT" : "IG", weight: Number(r[3]) || 1, notes: String(r[4] || "") });
  });
  return out;
}

function fitCreatorsInPeerTab_() {
  var sh = fitEnsurePeerTab_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var seen = {}, out = [];
  sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
    var c = String(r[0] || "").trim().replace(/^@/, "");
    if (c && !seen[fitNorm_(c)]) { seen[fitNorm_(c)] = 1; out.push(c); }
  });
  return out;
}

// ---- Peer raw tabs -----------------------------------------------------------

function fitRawTabFor_(ss, peer) {
  var base = sanitizeTabName(peer.handle);
  var names = peer.platform === "YT" ? [base + " - Raw"] : [base + " IG - Raw", base + " - Raw"];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}

/** Reads one peer's raw tab. Header-driven: raw tabs differ by scanner generation. */
function fitReadPeerDeals_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var h = vals[0];
  var iBrand = fitHeaderIdx_(h, /^brand$/i);
  var iConf = fitHeaderIdx_(h, /confidence/i);
  var iScore = fitHeaderIdx_(h, /^score$/i);
  var iTitle = fitHeaderIdx_(h, /title|caption/i);
  var iUrl = fitHeaderIdx_(h, /url|link/i);
  var iPub = fitHeaderIdx_(h, /published|posted/i);
  var iSig = fitHeaderIdx_(h, /signal/i);
  var iMass = fitHeaderIdx_(h, /mass/i);
  var iCat = fitHeaderIdx_(h, /category/i);
  var out = [];
  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    var brand = String(row[iBrand] || "").trim();
    if (fitIsJunk_(brand)) continue;
    var conf = iConf > -1 ? String(row[iConf] || "") : "";
    var score = iScore > -1 ? Number(row[iScore]) || 0 : 0;
    var paid = /high/i.test(conf) || score >= 6 || (iSig > -1 && /paid/i.test(String(row[iSig])));
    var medium = !paid && (/medium/i.test(conf) || score >= 4);
    if (!paid && !medium) continue;
    var pub = iPub > -1 ? row[iPub] : "";
    if (fitDays_(pub) > FIT.lookbackDays) continue;
    out.push({
      brand: brand, paid: paid, medium: medium, published: pub,
      title: iTitle > -1 ? String(row[iTitle] || "").replace(/\s+/g, " ").slice(0, 110) : "",
      url: iUrl > -1 ? String(row[iUrl] || "") : "",
      mass: iMass > -1 && String(row[iMass] || "").trim() !== "" && String(row[iMass]).toLowerCase() !== "false",
      category: iCat > -1 ? String(row[iCat] || "") : ""
    });
  }
  return out;
}

// ---- Engine rollups -------------------------------------------------------------

function fitOpportunityMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName("Opportunities");
  if (!sh || sh.getLastRow() < 2) return map;
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var h = vals[0];
  var iB = fitHeaderIdx_(h, /^brand$/i), iU = fitHeaderIdx_(h, /unique creators/i), iD = fitHeaderIdx_(h, /^deals$/i), iT = fitHeaderIdx_(h, /timing/i);
  for (var r = 1; r < vals.length; r++) {
    var k = fitNorm_(vals[r][iB]);
    if (!k) continue;
    map[k] = { unique: Number(vals[r][iU]) || 0, deals: Number(vals[r][iD]) || 0, timing: String(vals[r][iT] || "") };
  }
  return map;
}

function fitRepeatMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName("IG Rebook Radar");
  if (!sh || sh.getLastRow() < 2) return map;
  var vals = sh.getRange(1, 1, sh.getLastRow(), 3).getValues();
  for (var r = 1; r < vals.length; r++) {
    if (/repeat/i.test(String(vals[r][2]))) map[fitNorm_(vals[r][0])] = 1;
  }
  return map;
}

// ---- Team outreach tracker -----------------------------------------------------------

/**
 * Reads the whole Outreach Log once. Returns { byBrand: {norm: [rows]}, byDomain: {domain: [rows]}, excluded: {norm:1} }.
 * Outreach Log columns: Brand (unnamed) | Date Sent | Sent By | Creator | Contact Email | Contact Name | Subject | Status | FU1 | FU2 | Response Date | Notes | Link
 */
function fitTracker_() {
  var res = { byBrand: {}, byDomain: {}, excluded: {}, ok: false, rows: 0 };
  try {
    var tr = SpreadsheetApp.openById(FIT.trackerId);
    var lg = tr.getSheetByName("Outreach Log");
    if (lg && lg.getLastRow() > 1) {
      var vals = lg.getRange(2, 1, lg.getLastRow() - 1, 13).getValues();
      res.rows = vals.length;
      vals.forEach(function (v) {
        var brand = String(v[0] || "").trim();
        var email = String(v[4] || "").trim().toLowerCase();
        var dom = email.indexOf("@") > -1 ? email.split("@")[1] : "";
        var subj = String(v[6] || "");
        // brand column is often blank; recover it from the subject "@handle x Brand"
        if (!brand) { var m = subj.match(/\bx\s+(.+)$/i); if (m) brand = m[1].trim(); }
        var row = {
          brand: brand, date: v[1], sender: String(v[2] || ""), creator: String(v[3] || "").replace(/^@/, ""),
          email: email, domain: dom, status: String(v[7] || ""), responded: !!v[10],
          days: fitDays_(v[1])
        };
        row.no = /declin|not interested|no budget|pass|unsubscribe|do not contact|polite no|gifting only|gifted only/i.test(row.status);
        row.warm = !row.no && (row.responded || /interest|replied|reply|meeting|call|negotiat|closed|paid|deal|booked|contract/i.test(row.status));
        var k = fitNorm_(brand);
        if (k) (res.byBrand[k] = res.byBrand[k] || []).push(row);
        if (dom) (res.byDomain[dom] = res.byDomain[dom] || []).push(row);
      });
    }
    var ex = tr.getSheetByName("EXCLUSIONS");
    if (ex && ex.getLastRow() > 1) {
      ex.getRange(2, 1, ex.getLastRow() - 1, 4).getValues().forEach(function (v) {
        if (!/exclude/i.test(String(v[3] || "EXCLUDE"))) return;
        var k1 = fitNorm_(v[1]), k2 = fitNorm_(v[0]);
        if (k1) res.excluded[k1] = 1;
        if (k2) res.excluded[k2] = 1;
        var d = String(v[2] || "").toLowerCase().trim();
        if (d) res.excluded["dom:" + d] = 1;
      });
    }
    res.ok = res.rows > 1000; // sanity: a truncated read is worse than none
  } catch (e) {
    res.error = String(e);
  }
  return res;
}

function fitTrackerVerdict_(norm, creator, tr) {
  var rows = tr.byBrand[norm] || [];
  var v = { status: "OK", route: "", history: "", warm: false, recentDays: null };
  if (tr.excluded[norm]) { v.status = "EXCLUDED"; v.history = "On EXCLUSIONS list"; return v; }
  if (!rows.length) { v.history = "Never pitched"; return v; }
  var mine = rows.filter(function (r) { return fitSameCreator_(r.creator, creator); });
  var theirs = rows.filter(function (r) { return !fitSameCreator_(r.creator, creator); });
  var warmRows = rows.filter(function (r) { return r.warm; });
  var noRows = rows.filter(function (r) { return r.no; });
  var newest = rows.slice().sort(function (a, b) { return a.days - b.days; })[0];
  var bits = [rows.length + " row" + (rows.length > 1 ? "s" : "") + ", last " + fitFmt_(newest.date) + " by " + newest.sender + " for @" + newest.creator];
  if (warmRows.length) {
    v.warm = true;
    var w = warmRows.sort(function (a, b) { return a.days - b.days; })[0];
    bits.push("REPLIED: " + w.status + " (" + fitFmt_(w.date) + ", " + w.sender + " for @" + w.creator + (w.email ? ", " + w.email : "") + ")");
  }
  if (noRows.length) bits.push("said no once: " + noRows[0].status);
  var recentMine = mine.filter(function (r) { return r.days <= FIT.dedupeDays; });
  if (recentMine.length) {
    v.status = "RECENT";
    v.recentDays = Math.min.apply(null, recentMine.map(function (r) { return r.days; }));
    v.route = "Pitched for this creator " + v.recentDays + "d ago; wait until " + (FIT.dedupeDays - v.recentDays) + "d pass or follow up the existing thread";
  } else if (warmRows.length) {
    v.status = "WARM";
    var w2 = warmRows[0];
    v.route = fitSameCreator_(w2.creator, creator)
      ? "REVIVE existing thread (" + w2.sender + ", " + w2.email + ")"
      : "Warm via " + w2.sender + "'s @" + w2.creator + " thread; pitch this creator through a DIFFERENT contact or ask " + w2.sender + " to intro";
  } else {
    var recentTheirs = theirs.filter(function (r) { return r.days <= FIT.collisionDays; });
    if (recentTheirs.length) v.route = "FLAG: " + recentTheirs[0].sender + " pitched " + recentTheirs[0].days + "d ago for @" + recentTheirs[0].creator + "; use a different contact";
    else if (mine.length) v.route = "Cold again OK (last pitch for this creator " + Math.min.apply(null, mine.map(function (r) { return r.days; })) + "d ago); use a different contact";
    else v.route = "Pitched for other creators only; different contact";
  }
  v.history = bits.join(" | ");
  return v;
}

// ---- Scoring ---------------------------------------------------------------------

function fitScore_(c, opp, repeat, verdict) {
  var s = 0, notes = [];
  var paidPeers = Object.keys(c.paidPeers).length;
  var softPeers = Object.keys(c.softPeers).filter(function (p) { return !c.paidPeers[p]; }).length;
  var eff = paidPeers + softPeers * 0.5;
  var peerPts = eff >= 3 ? 50 : eff >= 2 ? 40 : eff >= 1 ? 25 : eff > 0 ? 12 : 0;
  s += peerPts; notes.push("peers " + peerPts);
  var d = fitDays_(c.lastDeal);
  var rec = d <= 90 ? 15 : d <= 180 ? 10 : d <= 365 ? 5 : 0;
  s += rec; notes.push("recency " + rec);
  if (repeat) { s += 10; notes.push("repeat +10"); }
  if (opp) {
    var b = opp.unique >= 6 ? 15 : opp.unique >= 3 ? 10 : 0;
    if (b) { s += b; notes.push("breadth +" + b + " (" + opp.unique + " creators)"); }
    if (/active wave/i.test(opp.timing)) { s += 5; notes.push("active wave +5"); }
  }
  if (verdict.warm) { s += 20; notes.push("warm +20"); }
  if (c.mass || FIT.massBrands.indexOf(fitNorm_(c.brand)) > -1) { s -= 10; notes.push("mass sponsor -10"); }
  s = Math.max(0, Math.min(100, s));
  return { score: s, notes: notes.join(", ") };
}

// ---- Build --------------------------------------------------------------------------

function fitBuildCandidates(creator) {
  creator = String(creator || "").trim().replace(/^@/, "");
  if (!creator) throw new Error("creator handle required");
  var ss = fitSheet_();
  var peers = fitPeersFor_(creator);
  if (!peers.length) throw new Error("No peers listed for @" + creator + " in " + FIT.peerTab);

  var agg = {}, missing = [];
  peers.forEach(function (p) {
    var sh = fitRawTabFor_(ss, p);
    if (!sh) { missing.push(p.handle); return; }
    fitReadPeerDeals_(sh).forEach(function (dl) {
      var k = fitNorm_(dl.brand);
      if (!k) return;
      var c = agg[k] || (agg[k] = { brand: dl.brand, paidPeers: {}, softPeers: {}, deals: 0, lastDeal: null, mass: false, example: "", url: "", category: "" });
      if (dl.paid) c.paidPeers[p.handle] = 1; else c.softPeers[p.handle] = 1;
      c.deals++;
      if (dl.mass) c.mass = true;
      if (!c.category && dl.category) c.category = dl.category;
      var t = dl.published ? new Date(dl.published).getTime() : 0;
      if (t && (!c.lastDeal || t > new Date(c.lastDeal).getTime())) {
        c.lastDeal = dl.published;
        c.example = "@" + p.handle + ": " + dl.title;
        c.url = dl.url;
      } else if (!c.example) { c.example = "@" + p.handle + ": " + dl.title; c.url = dl.url; }
    });
  });

  var opp = fitOpportunityMap_(ss), repeat = fitRepeatMap_(ss), tr = fitTracker_();
  var tabName = sanitizeTabName(creator) + FIT.candSuffix;
  var prior = fitReadPrior_(ss, tabName);

  var rows = [];
  Object.keys(agg).forEach(function (k) {
    var c = agg[k];
    var verdict = fitTrackerVerdict_(k, creator, tr);
    var p = prior[k] || {};
    if (/^never$/i.test(p.approve || "")) verdict.status = "NEVER";
    var sc = fitScore_(c, opp[k], repeat[k], verdict);
    rows.push({
      k: k, brand: c.brand, score: sc.score, status: verdict.status, route: verdict.route,
      paidPeers: Object.keys(c.paidPeers).length,
      peers: Object.keys(c.paidPeers).concat(Object.keys(c.softPeers).filter(function (x) { return !c.paidPeers[x]; }).map(function (x) { return x + " (med)"; })).join(", "),
      deals: c.deals, lastDeal: fitFmt_(c.lastDeal), repeat: repeat[k] ? "REPEAT PARTNER" : "",
      booked: opp[k] ? opp[k].unique : "", history: verdict.history, notes: sc.notes,
      example: c.example, url: c.url, approve: p.approve || "", userNotes: p.notes || ""
    });
  });

  var order = { OK: 0, WARM: 0, RECENT: 2, EXCLUDED: 3, NEVER: 4 };
  rows.sort(function (a, b) {
    var oa = order[a.status], ob = order[b.status];
    if (oa !== ob) return oa - ob;
    return b.score - a.score || a.brand.localeCompare(b.brand);
  });

  fitWriteTab_(ss, tabName, rows, { creator: creator, peers: peers, missing: missing, tracker: tr });
  return { creator: creator, tab: tabName, candidates: rows.length, draftable: rows.filter(function (r) { return r.status === "OK" || r.status === "WARM"; }).length, missingPeers: missing, trackerRows: tr.rows, trackerOk: tr.ok };
}

function fitReadPrior_(ss, tabName) {
  var out = {};
  var sh = ss.getSheetByName(tabName);
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var h = vals[0];
  var iB = fitHeaderIdx_(h, /^brand$/i), iA = fitHeaderIdx_(h, /^approve$/i), iN = fitHeaderIdx_(h, /^notes$/i);
  if (iB < 0 || iA < 0) return out;
  for (var r = 1; r < vals.length; r++) {
    var k = fitNorm_(vals[r][iB]);
    if (!k) continue;
    var a = String(vals[r][iA] || "").trim(), n = iN > -1 ? String(vals[r][iN] || "") : "";
    if (a || n) out[k] = { approve: a, notes: n };
  }
  return out;
}

function fitWriteTab_(ss, tabName, rows, meta) {
  var sh = ss.getSheetByName(tabName);
  if (!sh) { sh = ss.insertSheet(tabName); sh.setTabColor("#3c78d8"); }
  sh.clear();
  sh.clearConditionalFormatRules();
  var H = FIT.headers;
  var data = rows.map(function (r, i) {
    return [i + 1, r.brand, r.score, r.status, r.route, r.paidPeers, r.peers, r.deals, r.lastDeal, r.repeat,
      r.booked, r.history, r.notes, r.example, r.url, r.approve, r.userNotes];
  });
  sh.getRange(1, 1, 1, H.length).setValues([H]).setFontWeight("bold").setBackground("#d9ead3");
  if (data.length) sh.getRange(2, 1, data.length, H.length).setValues(data);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  var iApprove = H.indexOf("Approve") + 1;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(FIT.approveOptions, true).setAllowInvalid(true).build();
  sh.getRange(2, iApprove, Math.max(data.length, 1), 1).setDataValidation(rule);
  // status colours
  var iStatus = H.indexOf("Status") + 1;
  var rng = sh.getRange(2, 1, Math.max(data.length, 1), H.length);
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$D2="WARM"').setBackground("#fff2cc").setRanges([rng]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR($D2="RECENT",$D2="EXCLUDED",$D2="NEVER")').setFontColor("#999999").setRanges([rng]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$P2="Approve"').setBackground("#d9ead3").setRanges([rng]).build()
  ];
  sh.setConditionalFormatRules(rules);
  var widths = { 1: 45, 2: 160, 3: 60, 4: 80, 5: 320, 6: 60, 7: 200, 8: 60, 9: 95, 10: 110, 11: 90, 12: 380, 13: 240, 14: 320, 15: 220, 16: 90, 17: 200 };
  Object.keys(widths).forEach(function (c) { sh.setColumnWidth(Number(c), widths[c]); });
  // summary note on the header cell
  var note = "Built " + fitFmt_(new Date()) + " for @" + meta.creator + "\nPeers: " + meta.peers.map(function (p) { return "@" + p.handle; }).join(", ") +
    (meta.missing.length ? "\nNOT SCANNED YET (run fitQueueUnscannedPeers): " + meta.missing.join(", ") : "") +
    "\nTracker rows read: " + meta.tracker.rows + (meta.tracker.ok ? "" : "  (WARNING: tracker read looks truncated or failed" + (meta.tracker.error ? ": " + meta.tracker.error : "") + ")") +
    "\nSet Approve = Approve on the rows you want drafted. Never = hide forever. Drafts are logged to the tracker and drop to RECENT on the next refresh.";
  sh.getRange(1, 1).setNote(note);
}

// ---- Entry points -----------------------------------------------------------------

function fitBuildForCreatorPrompt() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt("Fit Scorer", "Creator handle (as listed in Peer Sets):", ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var r = fitBuildCandidates(resp.getResponseText());
  ui.alert("Built " + r.tab + ": " + r.candidates + " candidates, " + r.draftable + " draftable (OK or WARM)." +
    (r.missingPeers.length ? "\nPeers not scanned yet: " + r.missingPeers.join(", ") + "\nRun Fit Scorer > Scan unscanned peers, then rebuild." : "") +
    (r.trackerOk ? "" : "\nWARNING: tracker read returned only " + r.trackerRows + " rows."));
}

function fitRefreshAll() {
  var creators = fitCreatorsInPeerTab_();
  var out = [];
  creators.forEach(function (c) {
    try { var r = fitBuildCandidates(c); out.push("@" + c + ": " + r.candidates + " cand / " + r.draftable + " draftable" + (r.missingPeers.length ? " (unscanned: " + r.missingPeers.join(", ") + ")" : "")); }
    catch (e) { out.push("@" + c + ": ERROR " + e); }
  });
  Logger.log(out.join("\n"));
  return out;
}

/** Adds any IG peer without a raw tab to IG Scan List and scans up to 10 now. */
function fitQueueUnscannedPeers() {
  var ss = fitSheet_();
  var sl = ss.getSheetByName("IG Scan List");
  if (!sl) throw new Error("IG Scan List tab missing");
  var existing = {};
  if (sl.getLastRow() > 1) sl.getRange(2, 1, sl.getLastRow() - 1, 1).getValues().forEach(function (r) { existing[fitNorm_(r[0])] = 1; });
  var added = [];
  fitCreatorsInPeerTab_().forEach(function (c) {
    fitPeersFor_(c).forEach(function (p) {
      if (p.platform !== "IG") return;
      if (fitRawTabFor_(ss, p)) return;
      if (existing[fitNorm_(p.handle)]) return;
      sl.appendRow([p.handle, p.notes && matchCategory(p.notes) ? matchCategory(p.notes) : "Lifestyle", ""]);
      existing[fitNorm_(p.handle)] = 1;
      added.push(p.handle);
    });
  });
  Logger.log("Queued: " + (added.join(", ") || "none"));
  // Scan the peers DIRECTLY (the shared batch runner works top-down and the snowball queue sits ahead of us).
  var scanned = [], failed = [], budget = 8;
  var listRows = sl.getLastRow() > 1 ? sl.getRange(2, 1, sl.getLastRow() - 1, 3).getValues() : [];
  fitCreatorsInPeerTab_().forEach(function (c) {
    fitPeersFor_(c).forEach(function (p) {
      if (p.platform !== "IG" || fitRawTabFor_(ss, p) || budget <= 0) return;
      var rowIdx = -1;
      for (var i = 0; i < listRows.length; i++) if (fitNorm_(listRows[i][0]) === fitNorm_(p.handle)) { rowIdx = i + 2; break; }
      try {
        if (rowIdx > 0) sl.getRange(rowIdx, 3).setValue("Scanning...");
        var res = igScanCore_(p.handle, matchCategory(p.notes || "") || "Lifestyle");
        if (rowIdx > 0) sl.getRange(rowIdx, 3).setValue("OK - " + res.findings + " findings / " + res.posts + " posts");
        scanned.push(p.handle + " (" + res.findings + ")");
        budget--;
      } catch (e) {
        var msg = String(e);
        if (rowIdx > 0) sl.getRange(rowIdx, 3).setValue("ERROR - " + msg.slice(0, 80));
        failed.push(p.handle + ": " + msg.slice(0, 60));
        if (/rate|limit|wait/i.test(msg)) budget = 0; // stop hammering Meta
      }
    });
  });
  Logger.log("Scanned: " + (scanned.join(", ") || "none") + (failed.length ? " | Failed: " + failed.join("; ") : ""));
  return { queued: added, scanned: scanned, failed: failed };
}

function fitNightly() {
  try { fitQueueUnscannedPeers(); } catch (e) { Logger.log("peer scan: " + e); }
  fitRefreshAll();
}

function fitInstallNightly() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "fitNightly") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("fitNightly").timeBased().everyDays(1).atHour(3).create();
  Logger.log("fitNightly trigger installed (daily ~3am " + Session.getScriptTimeZone() + ")");
}

/** Adds a "Fit Score" header to the tracker's Outreach Log (first empty header column) if missing. */
function fitEnsureTrackerColumn() {
  var tr = SpreadsheetApp.openById(FIT.trackerId);
  var lg = tr.getSheetByName("Outreach Log");
  var h = lg.getRange(1, 1, 1, lg.getMaxColumns()).getValues()[0];
  for (var i = 0; i < h.length; i++) if (/fit score/i.test(String(h[i]))) { Logger.log("Fit Score already at column " + (i + 1)); return i + 1; }
  var col = h.length;
  while (col > 0 && String(h[col - 1] || "").trim() === "") col--;
  col = col + 1;
  if (col > lg.getMaxColumns()) lg.insertColumnAfter(lg.getMaxColumns());
  lg.getRange(1, col).setValue("Fit Score").setFontWeight("bold");
  Logger.log("Fit Score header added at column " + col);
  return col;
}

function fitAddMenu_() {
  SpreadsheetApp.getUi().createMenu("Fit Scorer")
    .addItem("Build candidates for a creator", "fitBuildForCreatorPrompt")
    .addItem("Rebuild all creators", "fitRefreshAll")
    .addItem("Scan unscanned peers", "fitQueueUnscannedPeers")
    .addSeparator()
    .addItem("Install nightly refresh", "fitInstallNightly")
    .addItem("Add Fit Score column to tracker", "fitEnsureTrackerColumn")
    .addToUi();
}


// ---- Peer set helpers ------------------------------------------------------------

/** Adds peers for a creator (skips handles already listed). handles: array of {h, platform, notes} or strings. */
function fitAddPeers(creator, handles) {
  var sh = fitEnsurePeerTab_();
  var have = {};
  fitPeersFor_(creator).forEach(function (p) { have[fitNorm_(p.handle)] = 1; });
  var rows = [];
  handles.forEach(function (x) {
    var o = typeof x === "string" ? { h: x } : x;
    var h = String(o.h || "").replace(/^@/, "").trim();
    if (!h || have[fitNorm_(h)]) return;
    have[fitNorm_(h)] = 1;
    rows.push([creator.replace(/^@/, ""), h, o.platform || "IG", o.weight || 1, o.notes || ""]);
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  Logger.log("Added " + rows.length + " peers for @" + creator);
  return rows.length;
}

/** One-off seed: Jimmy's peer set (Sep 2 2026). Safe to re-run; duplicates are skipped. */
function fitSeedJimmy() {
  return fitAddPeers("jimmyeverydayy", [
    { h: "dadsocial", notes: "Dad lifestyle; Jimmy follows" },
    { h: "drewpow", notes: "Dad x3 lifestyle, 1.3M" },
    { h: "dadlifemichael", notes: "Single dad life, Dallas, 169K; Jimmy follows" },
    { h: "theeverythingdad", notes: "Single dad life, 1.5M; Jimmy follows" },
    { h: "dadadvicefrombo", notes: "Dad advice, 5.3M; Jimmy follows" },
    { h: "daddygotcoffee", notes: "Coffee + dad life, 104K; Jimmy follows" },
    { h: "koohry", notes: "Semi-crunchy dad of 2 under 2, 52K; Jimmy follows" },
    { h: "brentrichard_", notes: "Fitness coach for dads, 239K; Jimmy follows" },
    { h: "thewaltonadventure", notes: "Outdoor family adventures, 921K; Jimmy follows" },
    { h: "dudedad", notes: "Taylor Calmus, dad comedy/lifestyle, 1.5M" },
    { h: "dadlifejason", notes: "Jason Linton, family lifestyle, 1.9M" },
    { h: "dad_vlog", notes: "D'Anthony, husband and father, 133K" },
    { h: "humphreytalks", notes: "Finance lane peer (Jimmy's budgeting pillar), 905K" },
    { h: "budgetdog", notes: "Finance lane peer (family budgeting), 1M" }
  ]);
}

function fitBuildJimmy() { var r = fitBuildCandidates("jimmyeverydayy"); Logger.log(JSON.stringify(r)); return r; }


// ---- Peer scouting (size + bio for a list of handles, via Business Discovery) ----------------

/** Profiles handles through Meta Business Discovery and appends to a "Peer Scout" tab. Personal accounts error out, which is a useful filter. */
function fitScoutHandles(creator, handles) {
  var ss = fitSheet_();
  var sh = ss.getSheetByName("Peer Scout");
  if (!sh) { sh = ss.insertSheet("Peer Scout"); sh.getRange(1, 1, 1, 7).setValues([["For creator", "Handle", "Followers", "Media", "Name", "Bio", "Result"]]).setFontWeight("bold"); sh.setFrozenRows(1); }
  var c = igGetCreds_();
  var rows = [], stop = false;
  handles.forEach(function (h) {
    h = String(h).replace(/^@/, "").trim();
    if (!h || stop) return;
    try {
      var d = igGraph_(c.igId + "?fields=" + encodeURIComponent("business_discovery.username(" + h + "){username,name,followers_count,media_count,biography}") + "&access_token=" + encodeURIComponent(c.token));
      var b = d.business_discovery || {};
      rows.push([creator, h, b.followers_count || "", b.media_count || "", b.name || "", String(b.biography || "").replace(/\n/g, " ").slice(0, 120), "OK"]);
    } catch (e) {
      var msg = String(e);
      rows.push([creator, h, "", "", "", "", msg.slice(0, 90)]);
      if (/limit|rate|wait/i.test(msg)) stop = true;
    }
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  Logger.log("Scouted " + rows.length + " handles for @" + creator + (stop ? " (stopped on rate limit)" : ""));
  return rows;
}

function fitScoutYooJin() {
  return fitScoutHandles("yoojinslife", ["yoojoonkang","fromjoyboy","andrewpolo_","lisaxphan","jinho_rhee_jr","lifewithtuyen","journalbymoon","daingosaur","oliviadeano","roxnfong","lifeofriza","kaerukeki","janice.journal","tim_park","kaitiyoo","cindydoinstuff","rachishangry","sarang.hoe","patripinedaa","oksarahpan","motokimaxted","withlovelinh","jung.garments","im_ericwang","hailey.ra","groovyfoodiess","angelicasong","caitshouse","charlizeechiu","filmwcolleen","jasminele","chrsfranz","shanonthestreet","coltkirwan","michellechoii","elliotchoy","kylajackson15","irene.y.kim","itskatherinelee","sashaxtang","lisahwangg","jjakepark","benji_plant","jeffery.dang","emilyaeyoung","_alliechen","amywang.online","rebeccaxko","shirleypunn","kennylsong","alysialoo","iamjuliahuynh","andrewrafaelkim","al.chenny","delvinyau","rachel.huh","christineee.lee","chungeats","jaewonparkk","kellywakasa","yayayayoung","amandarachlee","madebymusashi","krystalohh","twirlingpages","daisypyo","yoorajung","rowenatsai","noahjshin","isaasung","hanasim","candyce_ha","itsgracetran","helenpenggg","stxph.h","chrisolsen","helloitsoap","rubylyn_","thesamlitv","kirstentitus","erica.syl","jordann_nguyen","ericaandko","jessicaluuser","best.dressed","sarahhroh","camillelayen","thehavenkim","tiffanycchau","jeffreychang","aaashleyk","jenevieveheo","weylie","thecalvinhu","juliama","ashleybchoi","charlottejcho","hjevelyn","aliceekim","ghleee","becomingben","eyecharlene","kathrynjcross","lilychee","vuongdustin","aamy.pham","hannahhbahng","winestoner","vanessanagoya","jillian_rei","mrjeffreywang","erica.ha","maggieee.cai","monica_kimm","yoojinscatslife","leahsfieldnotes"]);
}


// ---- Workbook hygiene: the Engine sits near Google's 10M-cell ceiling ----------------------

/** Deletes EMPTY trailing rows/columns on every sheet (keeps a 20-row / 2-col buffer). Approved by Zach Sep 2 2026. */
function fitTrimWorkbook() {
  var ss = fitSheet_();
  var before = 0, after = 0, touched = 0;
  ss.getSheets().forEach(function (sh) {
    var mr = sh.getMaxRows(), mc = sh.getMaxColumns();
    before += mr * mc;
    var lr = Math.max(sh.getLastRow(), 1), lc = Math.max(sh.getLastColumn(), 1);
    var keepR = Math.min(mr, lr + 20), keepC = Math.min(mc, lc + 2);
    try {
      if (mr > keepR) sh.deleteRows(keepR + 1, mr - keepR);
      if (mc > keepC) sh.deleteColumns(keepC + 1, mc - keepC);
      if (mr > keepR || mc > keepC) touched++;
    } catch (e) { Logger.log("skip " + sh.getName() + ": " + e); }
    after += sh.getMaxRows() * sh.getMaxColumns();
  });
  Logger.log("Trimmed " + touched + " sheets: " + before + " -> " + after + " cells (limit 10,000,000)");
  return { before: before, after: after, touched: touched };
}


/** One-off seed: YooJin's peer set (Sep 2 2026), picked from her own following list, sizes verified on profile pages. */
function fitSeedYooJin() {
  return fitAddPeers("yoojinslife", [
    { h: "sarang.hoe", notes: "Tracy, NYC lifestyle, 584K; YooJin follows" },
    { h: "michellechoii", notes: "Michelle Choi, NYC vlog, 672K; YooJin follows" },
    { h: "withlovelinh", notes: "Linh, lifestyle, 415K; YooJin follows" },
    { h: "jasminele", notes: "Jasmine Le, lifestyle, 435K; YooJin follows" },
    { h: "motokimaxted", notes: "LA lifestyle, 473K; YooJin follows" },
    { h: "yoorajung", notes: "Yoora Jung, lifestyle, 365K; YooJin follows" },
    { h: "kellywakasa", notes: "Kelly Wakasa, lifestyle/travel, 341K; YooJin follows" },
    { h: "isaasung", notes: "Isa Sung, lifestyle, 252K; YooJin follows" },
    { h: "jung.garments", notes: "Jung, fashion/lifestyle, 202K, ran paid -196 ad; YooJin follows" },
    { h: "elliotchoy", notes: "Elliot Choy, NYC lifestyle, 158K; YooJin follows" },
    { h: "lifewithtuyen", notes: "Tuyen, baking creator, 132K; YooJin follows" },
    { h: "rxchelleyu", notes: "Rachelle Yu, NYC lifestyle, 119K; YooJin follows" },
    { h: "twirlingpages", notes: "Alexandra, NYC lifestyle/books, 112K; YooJin follows" },
    { h: "chungeats", notes: "Joanna, NYC foodie, 111K; YooJin follows" },
    { h: "oksarahpan", notes: "Sarah Pan, lifestyle, 97K; YooJin follows" },
    { h: "kaitiyoo", notes: "Kaiti Yoo, NYC lifestyle vlog, 95K; YooJin follows" }
  ]);
}

function fitBuildYooJin() { var r = fitBuildCandidates("yoojinslife"); Logger.log(JSON.stringify(r)); return r; }
