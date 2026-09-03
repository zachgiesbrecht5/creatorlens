/**
 * ============================================================
 * ROOTFOR — Instagram Scanner (v1.0)
 * ============================================================
 * NEW FILE "Instagram" in the scanner project. Scans public IG
 * Business/Creator accounts via Meta Business Discovery and writes
 * "<name> IG - Raw" tabs — the " - Raw" suffix means IG results flow into
 * the SAME Brand Leaderboard as YouTube scans automatically.
 *
 * Credentials live in Script Properties (never in code):
 *   IG_ACCESS_TOKEN  — the system-user token (set via menu prompt)
 *   IG_USER_ID       — @rootforgroup's IG user ID (menu can find it)
 *
 * MENU: one line inside onOpen() in Discovery.gs, after .addToUi():
 *     try { igOnOpen_(); } catch (e) {}
 *
 * Depends on Code.gs: getConfig, sanitizeTabName, matchCategory,
 * CATEGORIES, writeAdHocRawTab, BRAND_ALIASES, MASS_SPONSOR_BRANDS.
 * ============================================================
 */

var IG = {
  graphVersion: "v25.0",
  maxPosts: 100,      // posts per creator
  pageSize: 50,       // per API page (max 50)
  proximity: 120,     // max chars between evidence phrase and @handle
  scanListTab: "IG Scan List",
};

function igOnOpen_() {
  try { fitAddMenu_(); } catch (eFit) {}  // Fit Scorer menu (Sep 2 2026)
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("IG Scanner")
    .addItem("Scan IG creator", "igScanCreator")
    .addItem("Brand search (IG)", "igBrandSearch")
    .addItem("Scan brand account (find creators)", "igScanBrand")
    .addItem("Find UGC creators (bio scan)", "igFindUgcCreators")
    .addSeparator()
    .addItem("Build Opportunities (all platforms)", "buildOpportunities")
    .addItem("IG Rebook Radar (repeat partners)", "buildIgRebookRadar")
    .addItem("Log TikTok deal", "igLogTikTokDeal")
    .addSeparator()
    .addItem("Start snowball auto-pilot", "igStartSnowball")
    .addItem("Simple view (core tabs only)", "tidySheet")
    .addSubMenu(ui.createMenu("More tools")
      .addItem("Scan IG batch list (everyone queued)", "igScanBatch")
      .addItem("Auto-scan remaining hourly", "igScheduleBatch")
      .addItem("Stop auto-scan", "igStopScheduledBatch")
      .addItem("Stop snowball auto-pilot", "igStopSnowball")
      .addSeparator()
      .addItem("Queue discovered creators (one-off)", "igQueueDiscoveredCreators")
      .addItem("Harvest IG + TikTok handles from YouTube", "igHarvestHandles")
      .addItem("Sort scan list by yield", "igSortScanListByYield")
      .addItem("Build Creator Index (matching surface)", "buildCreatorIndex")
      .addSeparator()
      .addItem("Disclosure sweep (#sponsored...)", "igAdSweep")
      .addItem("IG hashtag budget", "igHashtagBudget")
      .addItem("Show working tabs", "showWorkingTabs")
      .addItem("Show raw tabs", "showRawTabs")
      .addItem("Open a hidden tab", "openHiddenTab")
      .addItem("Purge junk rows (data quality)", "purgeJunkRows")
      .addItem("Team guide (create/refresh)", "buildGuideTabMenu"))
    .addSubMenu(ui.createMenu("Setup")
      .addItem("Set IG credentials", "igSetCredentials")
      .addItem("Find my Instagram ID", "igFindMyInstagramId")
      .addItem("Test IG connection", "igTestConnection"))
    .addToUi();
}

// ---------------------------------------------------------------- Credentials

function igSetCredentials() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var t = ui.prompt("Instagram access token",
    "Paste the system-user token (it never expires). Leave blank to keep the current one.",
    ui.ButtonSet.OK_CANCEL);
  if (t.getSelectedButton() !== ui.Button.OK) return;
  if (t.getResponseText().trim()) props.setProperty("IG_ACCESS_TOKEN", t.getResponseText().trim());

  var i = ui.prompt("Instagram user ID",
    "Paste the IG user ID for @rootforgroup (use 'Find my Instagram ID' if unknown). Leave blank to keep the current one.",
    ui.ButtonSet.OK_CANCEL);
  if (i.getSelectedButton() !== ui.Button.OK) return;
  if (i.getResponseText().trim()) props.setProperty("IG_USER_ID", i.getResponseText().trim());

  ui.alert("IG credentials saved. Run 'Test IG connection' to verify.");
}

function igGetCreds_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("IG_ACCESS_TOKEN");
  var igId = props.getProperty("IG_USER_ID");
  if (!token) throw new Error("No IG token saved. Use IG Scanner > Set IG credentials.");
  if (!igId) throw new Error("No IG user ID saved. Use IG Scanner > Find my Instagram ID, then Set IG credentials.");
  return { token: token, igId: igId };
}

function igGraph_(pathAndQuery) {
  var url = "https://graph.facebook.com/" + IG.graphVersion + "/" + pathAndQuery;
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var json;
  try { json = JSON.parse(resp.getContentText()); }
  catch (e) { throw new Error("Meta returned non-JSON (HTTP " + resp.getResponseCode() + ")."); }
  if (json.error) {
    var err = json.error;
    var msg = "Meta API error " + err.code + ": " + err.message;
    if (err.code === 190) msg += " >> Token invalid/revoked. Re-check Set IG credentials.";
    if (err.code === 100 || err.code === 110) msg += " >> Username misspelled, or account is not a public Business/Creator account.";
    if (err.code === 4 || err.code === 17) msg += " >> Rate limit. Wait 30-60 min.";
    throw new Error(msg);
  }
  return json;
}

function igFindMyInstagramId() {
  var ui = SpreadsheetApp.getUi();
  var token = PropertiesService.getScriptProperties().getProperty("IG_ACCESS_TOKEN");
  if (!token) { ui.alert("Save the token first (IG Scanner > Set IG credentials)."); return; }
  var enc = encodeURIComponent(token);
  var lines = [];
  var found = [];

  // 1. Pages + BOTH ways an IG account attaches to a Page:
  //    instagram_business_account (API/Business Discovery link) and
  //    connected_instagram_account (content-publishing link).
  try {
    var pages = igGraph_("me/accounts?fields=" +
      encodeURIComponent("name,instagram_business_account{id,username},connected_instagram_account{id,username}") +
      "&limit=50&access_token=" + enc);
    var data = pages.data || [];
    for (var p = 0; p < data.length; p++) {
      var iba = data[p].instagram_business_account;
      var cia = data[p].connected_instagram_account;
      if (iba) { lines.push('Page "' + data[p].name + '": business IG @' + iba.username + " | ID: " + iba.id); found.push(iba.id); }
      if (cia && (!iba || cia.id !== iba.id)) { lines.push('Page "' + data[p].name + '": connected IG @' + cia.username + " | ID: " + cia.id); found.push(cia.id); }
      if (!iba && !cia) lines.push('Page "' + data[p].name + '": no IG on this Page');
    }
    if (!data.length) lines.push("No Pages visible to this token.");
  } catch (e) { lines.push("Page lookup error: " + e.message); }

  // 2. Instagram accounts owned directly by the business portfolio (the
  //    "added as an asset" path). Requires business_management on the token.
  try {
    var biz = igGraph_("me/businesses?fields=id,name&access_token=" + enc);
    var bdata = biz.data || [];
    for (var b = 0; b < bdata.length; b++) {
      try {
        var owned = igGraph_(bdata[b].id +
          "/owned_instagram_accounts?fields=" + encodeURIComponent("id,username") +
          "&access_token=" + enc);
        var odata = owned.data || [];
        for (var o = 0; o < odata.length; o++) {
          lines.push('Business "' + bdata[b].name + '": owned IG @' + (odata[o].username || "?") + " | ID: " + odata[o].id);
          found.push(odata[o].id);
        }
      } catch (e2) { /* endpoint may be unavailable; ignore */ }
    }
  } catch (e) { /* business list may be unavailable; ignore */ }

  var msg = "Instagram accounts found:\n\n" + (lines.join("\n") || "(none)");
  if (found.length) {
    msg += "\n\nUse the ID next to a 'business IG' or 'owned IG' entry in Set IG credentials.";
    // Auto-save the first found ID for convenience.
    PropertiesService.getScriptProperties().setProperty("IG_USER_ID", String(found[0]));
    msg += "\n\n(Auto-saved ID " + found[0] + " to credentials — run Test IG connection to verify.)";
  } else {
    msg += "\n\nNo usable IG business account ID found yet. If you just connected it, wait 1-2 min and re-run; the connection can take a moment to propagate.";
  }
  ui.alert(msg);
}

function igTestConnection() {
  var ui = SpreadsheetApp.getUi();
  try {
    var c = igGetCreds_();
    var json = igGraph_(c.igId + "?fields=username&access_token=" + encodeURIComponent(c.token));
    ui.alert("Connected. Querying as @" + json.username + ". Ready to scan Instagram.");
  } catch (e) {
    ui.alert("IG connection failed:\n\n" + e.message);
  }
}

// ---------------------------------------------------------------- Fetch via Business Discovery

function igFetchCreator_(username) {
  var c = igGetCreds_();
  var clean = String(username).trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(clean)) throw new Error('"' + username + '" is not a valid IG username.');

  var fields = "caption,permalink,timestamp,like_count,comments_count";
  var posts = [];
  var after = null;

  while (posts.length < IG.maxPosts) {
    var media = "media.limit(" + IG.pageSize + ")" + (after ? (".after(" + after + ")") : "") + "{" + fields + "}";
    var inner = after ? media : ("username,followers_count," + media);
    var json = igGraph_(c.igId + "?fields=" +
      encodeURIComponent("business_discovery.username(" + clean + "){" + inner + "}") +
      "&access_token=" + encodeURIComponent(c.token));
    var bd = json.business_discovery;
    if (!bd) throw new Error("No business_discovery data for @" + clean + ".");
    var m = bd.media;
    if (!m || !m.data || !m.data.length) break;
    posts = posts.concat(m.data);
    var cursors = m.paging && m.paging.cursors;
    after = cursors && cursors.after;
    if (!after || m.data.length < IG.pageSize) break;
  }
  return { username: clean, posts: posts.slice(0, IG.maxPosts) };
}

// ---------------------------------------------------------------- Detection (caption + @handle proximity)

var IG_PATTERNS = [
  { type: "Paid - explicit", score: 8, label: "High", res: [
    /#ad\b/gi, /#advert(?:isement)?\b/gi, /#sponsored\b/gi, /#spons\b/gi,
    /paid partnership/gi, /in (?:paid )?partnership with/gi,
    /partner(?:ing|ed)?\s+with/gi, /sponsored by/gi ] },
  { type: "Affiliate / code", score: 5, label: "Medium", res: [
    /use (?:my |the )?code/gi, /(?:promo|discount|coupon) code/gi,
    /code[:\s]+[A-Z0-9]{3,}/g, /affiliate/gi ] },
  { type: "Gifted / PR", score: 4, label: "Medium", res: [
    /gifted/gi, /#gift(?:edby)?\b/gi, /pr (?:package|box|haul|from)/gi, /for sending/gi ] },
  { type: "Potential partner", score: 2, label: "Low", res: [
    /thanks? (?:you )?to/gi, /collab(?:oration|orating)?/gi, /ambassador/gi, /teamed up with/gi ] }
];

/** Pure: caption -> [{brand, type, score, label, evidence}].
 * v3: @handle proximity + partner/ambassador hashtags + campaign-shaped hashtags
 * (#createdwithX, #myX, #Xcrew, #teamX, #Xsquad) + known-brand names inside any
 * hashtag + plain-text known brands + unknown-brand fallback for explicit paid
 * disclosures. (The in-app "Paid partnership" label is NOT exposed by Meta's API.) */
function igDetect_(caption, ownHandle) {
  if (!caption) return [];
  ensureLearnedAliases_();
  var text = String(caption);
  var own = String(ownHandle || "").toLowerCase().replace(/^@/, "");

  var evidences = [];
  for (var g = 0; g < IG_PATTERNS.length; g++) {
    var grp = IG_PATTERNS[g];
    for (var r = 0; r < grp.res.length; r++) {
      var re = grp.res[r];
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(text)) !== null) {
        evidences.push({ grp: grp, index: m.index, length: m[0].length });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }

  var GENERIC = { brand: 1, paid: 1, our: 1, the: 1, my: 1, your: 1, travel: 1, business: 1,
    media: 1, content: 1, creator: 1, official: 1, insta: 1, instagram: 1, fashion: 1,
    workday: 1, unboxing: 1, review: 1, upgrade: 1, office: 1, early: 1, easy: 1,
    asmr: 1, honest: 1, ultimate: 1, finally: 1, obsessed: 1, help: 1, made: 1,
    style: 1, beauty: 1, fitness: 1, food: 1, home: 1, life: 1, love: 1, daily: 1,
    weekend: 1, morning: 1, dream: 1, glow: 1, self: 1, best: 1, real: 1 };

  function brandFor_(k) {
    return (typeof BRAND_ALIASES === "object" && BRAND_ALIASES[k])
      ? BRAND_ALIASES[k] : (k.charAt(0).toUpperCase() + k.slice(1));
  }

  // ---- Candidate brands: {key, brand, idx, len, self}
  var candidates = [];

  // Words that are real brand names for SOME brand but common English words too.
  // These (and anything <= 4 chars) only match aliases when capitalized in the
  // caption - "Aura frame" counts, "an aura of calm" does not.
  var RISKY = { ring: 1, aura: 1, cozy: 1, prime: 1, glow: 1, pure: 1, bloom: 1,
    halo: 1, luna: 1, nova: 1, mint: 1, honey: 1, sage: 1, dawn: 1, ember: 1 };

  // Grammar capture: "collaborating with soltech", "partnered with X" - the
  // object of the phrase IS the brand, stronger than any alias lookup.
  var pw = /\b(?:collab(?:orat(?:e|ing|ion))?|partner(?:ing|ed|ship)?|team(?:ing|ed)?\s*up|working)\s+(?:with|w\/)\s+[@#]?([A-Za-z][A-Za-z0-9._]{2,30})/gi, pwm;
  while ((pwm = pw.exec(text)) !== null) {
    var pname = pwm[1].replace(/[._]+$/, "");
    var plow = pname.toLowerCase().replace(/[._]/g, "");
    if (plow.length < 3 || GENERIC[plow] || plow === own) continue;
    var pdisp = (typeof BRAND_ALIASES === "object" && BRAND_ALIASES[plow]) ? BRAND_ALIASES[plow]
      : pname.charAt(0).toUpperCase() + pname.slice(1).replace(/[._]/g, " ");
    candidates.push({ key: plow, brand: pdisp, idx: pwm.index, len: pwm[0].length,
      self: { type: "Partner mention", score: 6, label: "Medium" } });
  }


  // "Product from @brand": a labeled Paid-partnership collab often leaves NO
  // disclosure words in the caption (the label itself is invisible to the API).
  // "The Opus 2 from @fellowproducts ... $200 ... link in my bio" is the
  // recognizable residue: the from-grammar plus commercial context.
  var fromRe = /\bfrom\s+@([A-Za-z0-9._]{3,30})/gi, fromM;
  var hasCommerce = /link in (?:my )?bio|\$\s?\d|use (?:my )?code|% ?off|shop now/i.test(text);
  while ((fromM = fromRe.exec(text)) !== null) {
    var fh = fromM[1].toLowerCase().replace(/[._]+$/, "");
    if (fh.length < 3 || fh === own) continue;
    var fkey = fh.replace(/[._]/g, "");
    var fdisp = (typeof BRAND_ALIASES === "object" && BRAND_ALIASES[fkey]) ? BRAND_ALIASES[fkey]
      : ("@" + fh);
    candidates.push({ key: fkey, brand: fdisp, idx: fromM.index, len: fromM[0].length,
      self: hasCommerce
        ? { type: "Product from @brand + promo", score: 4, label: "Medium" }
        : { type: "Product from @brand", score: 2, label: "Low" } });
  }

  var handleRe = /(^|[^\w@.])@([a-zA-Z0-9](?:[a-zA-Z0-9._]{0,28}[a-zA-Z0-9_])?)/g;
  var hm;
  while ((hm = handleRe.exec(text)) !== null) {
    var h = hm[2].toLowerCase().replace(/\.+$/, "");
    if (h.length < 2 || h === own) continue;
    candidates.push({ key: h,
      brand: (typeof BRAND_ALIASES === "object" && BRAND_ALIASES[h]) ? BRAND_ALIASES[h] : ("@" + h),
      idx: hm.index + hm[1].length, len: hm[2].length + 1, self: null });
  }

  // Hashtags that carry brand + disclosure in one token
  var SHAPES = [
    { re: /#([a-z0-9_.]{2,30}?)_?(?:partner|ambassador)s?\b/gi, self: { type: "Paid - explicit", score: 8, label: "High" } },
    { re: /#createdwith([a-z0-9]{3,30})/gi,                      self: { type: "Paid - explicit", score: 8, label: "High" } },
    { re: /#([a-z0-9]{3,30}?)crew\b/gi,                          self: { type: "Community tag", score: 3, label: "Low" } },
    { re: /#team([a-z0-9]{3,30})\b/gi,                           self: { type: "Community tag", score: 3, label: "Low" } },
    { re: /#([a-z0-9]{3,30}?)squad\b/gi,                         self: { type: "Community tag", score: 3, label: "Low" } },
    { re: /#my([a-z0-9]{3,30})\b/gi,                             self: null }  // needs nearby disclosure (e.g. #myIKEAUSA #ad)
  ];
  for (var si = 0; si < SHAPES.length; si++) {
    var sre = SHAPES[si].re; sre.lastIndex = 0;
    var sm;
    while ((sm = sre.exec(text)) !== null) {
      var nm = sm[1].toLowerCase().replace(/[._]+$/, "");
      if (nm.length < 3 || GENERIC[nm]) continue;
      candidates.push({ key: nm, brand: brandFor_(nm), idx: sm.index, len: sm[0].length, self: SHAPES[si].self });
    }
  }

  // Known brands hiding inside ANY hashtag (e.g. #myIKEAUSA, #adidasrunning)
  if (typeof BRAND_ALIASES === "object") {
    var tagRe2 = /#([a-z0-9_.]{4,40})/gi, tg;
    while ((tg = tagRe2.exec(text)) !== null) {
      var tl = tg[1].toLowerCase();
      for (var ak in BRAND_ALIASES) {
        var names2 = [String(ak).toLowerCase(), String(BRAND_ALIASES[ak]).toLowerCase()];
        for (var n2 = 0; n2 < names2.length; n2++) {
          var lk2 = names2[n2].replace(/[^a-z0-9]/g, "");
          if (lk2.length >= 5 && !RISKY[lk2] && tl.indexOf(lk2) !== -1) {
            candidates.push({ key: lk2, brand: String(BRAND_ALIASES[ak]), idx: tg.index, len: tg[0].length, self: null });
            break;
          }
        }
      }
    }
  }

  // Plain-text known-brand names near evidence
  if (evidences.length && typeof BRAND_ALIASES === "object") {
    var tried = {};
    for (var ak2 in BRAND_ALIASES) {
      var names3 = [ak2, String(BRAND_ALIASES[ak2])];
      for (var ni = 0; ni < names3.length; ni++) {
        var lk3 = names3[ni].toLowerCase();
        if (lk3.length < 4 || tried[lk3]) continue;
        tried[lk3] = 1;
        var esc = lk3.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var risky3 = (lk3.length <= 4 || RISKY[lk3]);
        var body3 = risky3 ? (esc.charAt(0).toUpperCase() + esc.slice(1)) : esc;
        var pr = new RegExp("(^|[^\\w@#])(" + body3 + ")\\b", risky3 ? "g" : "gi");
        var pm;
        while ((pm = pr.exec(text)) !== null) {
          candidates.push({ key: lk3, brand: String(BRAND_ALIASES[ak2]), idx: pm.index + pm[1].length, len: pm[2].length, self: null });
        }
      }
    }
  }

  var out = {};
  function snip_(aIdx, aLen) {
    var s = Math.max(0, aIdx - 20);
    var e = Math.min(text.length, aIdx + aLen + 40);
    if (e - s > 160) e = s + 160;
    return text.substring(s, e).replace(/\s+/g, " ").trim();
  }

  for (var c = 0; c < candidates.length; c++) {
    var cand = candidates[c];
    var chosen = null, aIdx = cand.idx, aLen = cand.len;
    if (cand.self) {
      chosen = cand.self;
    } else {
      if (!evidences.length) continue;
      var minDist = Infinity;
      for (var e1 = 0; e1 < evidences.length; e1++) {
        var d1 = Math.abs(cand.idx - evidences[e1].index);
        if (d1 <= IG.proximity && d1 < minDist) minDist = d1;
      }
      if (minDist === Infinity) continue;
      var best = null;
      for (var e2 = 0; e2 < evidences.length; e2++) {
        var d2 = Math.abs(cand.idx - evidences[e2].index);
        if (d2 <= IG.proximity && d2 <= minDist + 25 &&
          (!best || evidences[e2].grp.score > best.grp.score)) best = evidences[e2];
      }
      if (!best) continue;
      chosen = { type: best.grp.type, score: best.grp.score, label: best.grp.label };
      aIdx = Math.min(cand.idx, best.index);
      aLen = Math.max(cand.idx + cand.len, best.index + best.length) - aIdx;
    }
    var key = cand.brand.toLowerCase();
    if (!out[key] || chosen.score > out[key].score) {
      out[key] = { brand: cand.brand, type: chosen.type, score: chosen.score, label: chosen.label, evidence: snip_(aIdx, aLen) };
    }
  }

  // ---- Family dedupe + per-post cap. Hashtag variants of one brand
  // (#VITURE vs #VITUREbeast, "ban" inside "raybanmeta") collapse into one
  // row - the variant appearing most as a standalone token wins. Then keep
  // only the top 3 brands per post so hashtag-stuffed captions cannot flood
  // the sheet with junk rows.
  var lowText = text.toLowerCase();
  function standalone_(k4) {
    var c4 = 0, p4 = -1;
    while ((p4 = lowText.indexOf(k4, p4 + 1)) !== -1) {
      var pb = p4 === 0 ? "" : lowText.charAt(p4 - 1);
      var pa = lowText.charAt(p4 + k4.length) || "";
      if (!/[a-z0-9]/.test(pb) && !/[a-z0-9]/.test(pa)) c4++;
    }
    return c4;
  }
  var keys2 = [];
  for (var kk in out) keys2.push(kk);
  var dropK = {};
  for (var i1 = 0; i1 < keys2.length; i1++) {
    for (var j1 = 0; j1 < keys2.length; j1++) {
      if (i1 === j1) continue;
      var a3 = keys2[i1], b3 = keys2[j1];
      if (dropK[a3] || dropK[b3]) continue;
      if (b3.indexOf(a3) !== -1) {           // a3 is substring of b3: same family
        var loser;
        if (out[b3].score !== out[a3].score) {
          loser = out[b3].score > out[a3].score ? a3 : b3;
        } else {
          var sa = standalone_(a3), sb = standalone_(b3);
          loser = sb > sa ? a3 : b3;         // tie on standalone count: keep the shorter
        }
        dropK[loser] = 1;
      }
    }
  }
  var arr = [];
  for (var k in out) { if (!dropK[k]) arr.push(out[k]); }
  arr.sort(function (x2, y2) { return y2.score - x2.score; });
  if (arr.length > 3) arr = arr.slice(0, 3);

  // Fallback: explicit paid disclosure but no known brand matched.
  // First try to GUESS the brand from the caption itself (CamelCase hashtags,
  // handle-shaped tokens, ALL-CAPS tags, capitalized names near the disclosure).
  // A guess is marked "(?)" and Medium so humans and filters treat it honestly.
  if (!arr.length) {
    for (var f = 0; f < evidences.length; f++) {
      if (evidences[f].grp.score >= 8) {
        var guess = igGuessBrand_(text, evidences[f].index);
        if (guess) {
          arr.push({ brand: guess + " (?)", type: "Paid - brand guessed (verify)",
            score: 5, label: "Medium", evidence: snip_(evidences[f].index, evidences[f].length) });
        } else {
          arr.push({ brand: "(unknown - check post)", type: "Paid disclosure, brand unclear",
            score: 8, label: "High", evidence: snip_(evidences[f].index, evidences[f].length) });
        }
        break;
      }
    }
  }
  return arr;
}

/** Best-effort brand guess from caption structure, used only when explicit
 * paid language exists but no known brand matched. Order of trust:
 * handle-shaped tokens > CamelCase hashtags > ALL-CAPS tags > capitalized
 * words near the disclosure > distinctive lowercase hashtags. */
function igGuessBrand_(text, evIdx) {
  var GEN = { the:1, this:1, that:1, with:1, from:1, your:1, our:1, and:1, for:1,
    life:1, love:1, home:1, style:1, daily:1, living:1, vibes:1, mood:1, ideas:1,
    inspo:1, aesthetic:1, ootd:1, reels:1, viral:1, fyp:1, explore:1, trending:1,
    lifestyle:1, fashion:1, beauty:1, travel:1, food:1, fitness:1, family:1,
    winning:1, happens:1, here:1, way:1, of:1, new:1, best:1, real:1, one:1,
    partner:1, ambassador:1, sponsored:1, gifted:1, collab:1, giveaway:1,
    monday:1, tuesday:1, wednesday:1, thursday:1, friday:1, saturday:1, sunday:1,
    january:1, february:1, march:1, april:1, may:1, june:1, july:1, august:1,
    september:1, october:1, november:1, december:1, thanks:1, thank:1, link:1,
    bio:1, shop:1, code:1, use:1, get:1, off:1, sale:1, discount:1,
    canada:1, america:1, united:1, states:1, miami:1, toronto:1, vancouver:1,
    venice:1, paris:1, london:1, tokyo:1, imagine:1, everyone:1, today:1,
    tomorrow:1, yesterday:1, weekend:1, morning:1, evening:1, night:1,
    summer:1, winter:1, spring:1, autumn:1, happy:1, hello:1, check:1,
    watch:1, video:1, episode:1, favourite:1, favorite:1 };
  var cands = [];  // {name, idx, rank}  lower rank = more trusted

  // a) handle-shaped tokens without @ (internal . or _), e.g. dolcegabbana_beauty
  var hre = /(^|[^\w@#.])([a-z0-9]{3,}[._][a-z0-9]{2,}[a-z0-9._]*)/gi, hm2;
  while ((hm2 = hre.exec(text)) !== null) {
    var base = hm2[2].toLowerCase().replace(/[._]+(beauty|official|us|usa|uk|global|hq|shop|store)$/, "").replace(/[._]+/g, "");
    if (base.length >= 4 && !GEN[base]) {
      cands.push({ name: base.charAt(0).toUpperCase() + base.slice(1), idx: hm2.index, rank: 1 });
    }
  }
  // b/c/e) hashtags with original casing
  var tre = /#([A-Za-z0-9_]{2,40})/g, tm2;
  while ((tm2 = tre.exec(text)) !== null) {
    var tag = tm2[1];
    var low = tag.toLowerCase();
    if (/^(ad|ads|sponsored|advert(ising)?|paid|partner|ambassador|gifted|pr)$/.test(low)) continue;
    var words = tag.match(/[A-Z][a-z0-9]+|[A-Z]{2,}(?![a-z])|^[a-z0-9]+/g) || [];
    if (words.length >= 2) {                       // CamelCase: #BarbourWayOfLife
      var first = words[0].toLowerCase();
      if (!GEN[first] && first.length >= 3) {
        cands.push({ name: words[0], idx: tm2.index, rank: 2 });
      } else if (words.length >= 2) {
        var joined = words.join(" ");
        if (joined.length >= 6) cands.push({ name: joined, idx: tm2.index, rank: 4 });
      }
    } else if (/^[A-Z0-9]{2,8}$/.test(tag)) {      // ALL-CAPS: #OLG #JINS
      cands.push({ name: tag, idx: tm2.index, rank: 3 });
    } else if (/^[a-z0-9]{5,}$/.test(low) && !GEN[low]) {  // distinctive lowercase tag
      var generic = false;
      for (var gk in GEN) { if (gk.length >= 3 && low.indexOf(gk) !== -1) { generic = true; break; } }
      if (!generic) cands.push({ name: low.charAt(0).toUpperCase() + low.slice(1), idx: tm2.index, rank: 5 });
    }
  }
  // c2) capitalized product runs anywhere in the caption: "My Kobo Libra
  // Colour setup" -> "Kobo". Runs are strong brand markers, so no proximity
  // requirement (the guesser only fires on explicitly-paid captions anyway).
  var wordsAll = text.match(/\b[A-Za-z][a-z0-9]+\b/g) || [];
  var capCount = 0;
  for (var wi = 0; wi < wordsAll.length; wi++) { if (/^[A-Z]/.test(wordsAll[wi])) capCount++; }
  var titleCased = wordsAll.length >= 6 && capCount / wordsAll.length > 0.5;
  var rre = /\b([A-Z][a-z0-9]{2,})(?:\s+[A-Z][a-z0-9]+){1,3}\b/g, rrm;
  while (!titleCased && (rrm = rre.exec(text)) !== null) {
    var rw = rrm[1];
    if (GEN[rw.toLowerCase()] || /^(The|My|Our|Your|This|That|New|Happy|Merry|Black|Cyber)$/.test(rw)) continue;
    cands.push({ name: rw, idx: rrm.index, rank: 2 });
  }

  // d) capitalized mid-sentence words near the disclosure: "about Monet #Ad"
  var cre = /([^.!?\n]\s)([A-Z][a-z]{2,})\b/g, cm2;
  while ((cm2 = cre.exec(text)) !== null) {
    var w = cm2[2];
    if (GEN[w.toLowerCase()] || /^(I|Im|Ive|The|My|We|You|He|She|It|They|If|So|But|And|Or)$/.test(w)) continue;
    var reps = (text.match(new RegExp("\\b" + w + "\\b", "g")) || []).length;
    if (reps >= 2 && Math.abs(cm2.index - evIdx) <= 120) cands.push({ name: w, idx: cm2.index, rank: 4 });
  }

  if (!cands.length) return "";
  cands.sort(function (a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return Math.abs(a.idx - evIdx) - Math.abs(b.idx - evIdx);
  });
  return cands[0].name;
}

/** Self-learning aliases: every brand already CONFIRMED anywhere in this sheet
 * (Brand Leaderboard + Rebook Radar) becomes plain-text/hashtag matchable in
 * future scans. Loaded once per execution; failures never break a scan. */
var LEARNED_ALIASES_LOADED = false;
function ensureLearnedAliases_() {
  if (LEARNED_ALIASES_LOADED || typeof BRAND_ALIASES !== "object") return;
  LEARNED_ALIASES_LOADED = true;
  try {
    var cfg = getConfig();
    var ss = SpreadsheetApp.openById(cfg.sheetId);
    var added = 0;
    var tabs = [cfg.leaderboardTabName || "Brand Leaderboard", "Rebook Radar"];
    for (var t = 0; t < tabs.length; t++) {
      var sh = ss.getSheetByName(tabs[t]);
      if (!sh || sh.getLastRow() < 2) continue;
      var vals = sh.getRange(1, 1, sh.getLastRow(), Math.min(8, sh.getLastColumn())).getValues();
      var hdr0 = vals[0].map(String);
      var bCol = hdr0.indexOf("Brand");
      if (bCol < 0) bCol = 0;
      // find a volume column so junk one-off "brands" are never learned
      var nCol = -1;
      for (var h0 = 0; h0 < hdr0.length; h0++) {
        if (/post|deal|video|count|creator/i.test(hdr0[h0])) { nCol = h0; break; }
      }
      for (var r = 1; r < vals.length; r++) {
        var vol = nCol >= 0 ? Number(vals[r][nCol]) : NaN;
        var name = String(vals[r][bCol]).trim();
        if (!name || name.charAt(0) === "(" || name.charAt(0) === "@") continue;
        if (/ \(\?\)$/.test(name)) continue;                 // never learn from guesses
        // volume gate: single-word names need 5+ recorded deals to be trusted,
        // multi-word names need 3+; if no volume column exists, single words
        // are simply not learned (multi-word names are safe enough alone)
        var isSingle = name.trim().indexOf(" ") === -1;
        if (isFinite(vol)) {
          if (vol < (isSingle ? 5 : 3)) continue;
        } else if (isSingle) { continue; }
        if (/^(home|learn|life|live|love|style|beauty|world|today|magic|dream|light|smart|prime|play|game|games|studio|media|group|team|club|shop|store|brand|daily|first|best|good|great|real|true|next|plus|core|pure|peak|edge|flow|zone|wave|link|water|coffee|house|works|labs?|https?|www|deals?|amazon|blackfriday|newarrival|desksetup|upgrade|espresso|machine|ultimate|office|night|premium|series|trend|problem|empty|workday|ban|meta|glasses|setup|chair|keys|alto)$/i.test(name.trim())) continue;
        var key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (key.length >= 4 && !BRAND_ALIASES[key]) { BRAND_ALIASES[key] = name; added++; }
      }
    }
  } catch (eLearn) {}
}

// ---------------------------------------------------------------- Scanning

function igScanCore_(username, category) {
  var data = igFetchCreator_(username);
  var results = [];
  for (var p = 0; p < data.posts.length; p++) {
    var post = data.posts[p];
    var found = igDetect_(post.caption, data.username);
    for (var f = 0; f < found.length; f++) {
      var fb = found[f];
      var lower = fb.brand.toLowerCase().replace(/^@/, "");
      results.push({
        normalizedBrand: fb.brand,
        confidenceScore: fb.score,
        confidenceLabel: fb.label,
        videoTitle: (post.caption || "").substring(0, 80).replace(/\s+/g, " "),
        videoUrl: post.permalink || "",
        publishedAt: post.timestamp || "",
        views: post.like_count || 0,
        signals: fb.type,
        evidence: fb.evidence,
        isMassSponsor: typeof MASS_SPONSOR_BRANDS !== "undefined"
          && MASS_SPONSOR_BRANDS.indexOf(lower) > -1,
      });
    }
  }
  var config = getConfig();
  var tabBase = sanitizeTabName(data.username) + " IG";
  var tabName = writeAdHocRawTab(config, tabBase, category || "Other", results);
  return { creator: data.username, posts: data.posts.length, findings: results.length, tab: tabName };
}

function igScanCreator() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt("Scan IG creator",
    "Instagram username (with or without @). Must be a public Business/Creator account:",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var username = resp.getResponseText().trim();
  if (!username) return;

  var catResp = ui.prompt("Category", "Type one of:\n" + CATEGORIES.join(", "), ui.ButtonSet.OK_CANCEL);
  if (catResp.getSelectedButton() !== ui.Button.OK) return;

  try {
    var r = igScanCore_(username, matchCategory(catResp.getResponseText()));
    ui.alert("Scanned @" + r.creator + "\n\nPosts: " + r.posts + "\nBrand findings: " + r.findings +
      "\n\nSee \"" + r.tab + "\". Run \"Rebuild Brand Leaderboard\" to fold IG into the rollup.");
  } catch (e) {
    ui.alert("IG scan failed: " + e.message);
  }
}

var IGBATCH = {
  perRun: 40,            // creators per run - stays well under Meta's ~200 calls/hr
  pauseMs: 2000,
  triggerFn: "igBatchTick"
};

/** Manual batch run. Rows already marked OK are skipped, so this is safe to
 * re-run as many times as you like - it always resumes where it stopped. */
function igScanBatch() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName(IG.scanListTab);
  if (!sheet) {
    sheet = ss.insertSheet(IG.scanListTab);
    sheet.getRange(1, 1, 1, 3).setValues([["Instagram Username", "Category", "Status"]])
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
    ui.alert("Created \"" + IG.scanListTab + "\". Add usernames in column A (category in B, optional) and run again.");
    return;
  }
  if (sheet.getLastRow() < 2) {
    ui.alert("Add usernames to column A of \"" + IG.scanListTab + "\" first.");
    return;
  }

  var res = igBatchRun_(sheet, IGBATCH.perRun);

  if (res.limited) {
    ui.alert("Instagram rate limit reached",
      "Scanned " + res.done + " creator(s) before Meta throttled us. " +
      res.remaining + " still to go.\n\n" +
      "Nothing is lost - creators marked OK are skipped on the next run.\n\n" +
      "Either re-run this in about an hour, or use \"Auto-scan remaining hourly\" " +
      "to let it finish itself in the background.", ui.ButtonSet.OK);
  } else if (!res.remaining) {
    ui.alert("IG batch complete",
      "Scanned " + res.done + " creator(s). Nothing left in the list.", ui.ButtonSet.OK);
  } else {
    ui.alert("IG batch chunk done",
      "Scanned " + res.done + " creator(s) this run.\n" +
      res.remaining + " still unscanned (capped at " + IGBATCH.perRun + " per run to stay under Meta's limit).\n\n" +
      "Run again, or use \"Auto-scan remaining hourly\" to finish it unattended.", ui.ButtonSet.OK);
  }
}

/** Shared engine. No UI calls, so triggers can use it too. */
function igBatchRun_(sheet, max) {
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  var done = 0, limited = false, remaining = 0;
  for (var r = 0; r < rows.length; r++) {
    var username = String(rows[r][0]).trim();
    if (!username) continue;
    var status = String(rows[r][2] || "");
    if (/^OK\b/.test(status)) continue;          // already scanned - resume past it
    if (done >= max) { remaining++; continue; }   // save the rest for the next run

    var statusCell = sheet.getRange(r + 2, 3);
    statusCell.setValue("Scanning...");
    SpreadsheetApp.flush();
    try {
      var res = igScanCore_(username, matchCategory(String(rows[r][1] || "")));
      statusCell.setValue("OK - " + res.findings + " findings / " + res.posts + " posts");
      done++;
    } catch (e) {
      var msg = String(e.message).split("\n")[0];
      if (/request limit|rate limit|#4\b/i.test(msg)) {
        statusCell.setValue("");                  // leave it unscanned so it retries
        limited = true;
        for (var q = r; q < rows.length; q++) {
          var u2 = String(rows[q][0]).trim();
          if (u2 && !/^OK\b/.test(String(rows[q][2] || ""))) remaining++;
        }
        break;
      }
      statusCell.setValue("ERROR - " + msg.substring(0, 180));
    }
    Utilities.sleep(IGBATCH.pauseMs);
  }
  return { done: done, limited: limited, remaining: remaining };
}

/** Time-driven trigger handler: chips away at the list once an hour. */
function igBatchTick() {
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName(IG.scanListTab);
  if (!sheet || sheet.getLastRow() < 2) { igCancelBatchSchedule_(); return; }
  var res = igBatchRun_(sheet, IGBATCH.perRun);
  // List finished - retire the trigger so it stops waking up for nothing.
  if (!res.remaining && !res.limited) igCancelBatchSchedule_();
}

/** Menu: run the remaining list automatically, one chunk per hour. */
function igScheduleBatch() {
  var ui = SpreadsheetApp.getUi();
  igCancelBatchSchedule_();
  ScriptApp.newTrigger(IGBATCH.triggerFn).timeBased().everyHours(1).create();
  var ss = SpreadsheetApp.openById(getConfig().sheetId);
  var sheet = ss.getSheetByName(IG.scanListTab);
  var left = 0;
  if (sheet && sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    for (var r = 0; r < rows.length; r++) {
      if (String(rows[r][0]).trim() && !/^OK\b/.test(String(rows[r][2] || ""))) left++;
    }
  }
  ui.alert("Auto-scan scheduled",
    left + " creator(s) left to scan.\n\n" +
    "The scanner will now work through up to " + IGBATCH.perRun + " per hour on its own " +
    "(about " + Math.max(1, Math.ceil(left / IGBATCH.perRun)) + " hour(s)) and switch itself off when the list is done.\n\n" +
    "You can keep using the sheet normally - Status updates as it goes.", ui.ButtonSet.OK);
}

function igStopScheduledBatch() {
  var n = igCancelBatchSchedule_();
  SpreadsheetApp.getUi().alert("Auto-scan stopped",
    n ? "Removed the hourly auto-scan. Anything already scanned is kept." :
        "There was no auto-scan running.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function igCancelBatchSchedule_() {
  var t = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < t.length; i++) {
    if (t[i].getHandlerFunction() === IGBATCH.triggerFn) { ScriptApp.deleteTrigger(t[i]); n++; }
  }
  return n;
}
