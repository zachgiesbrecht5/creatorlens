/**
 * ============================================================
 * ROOTFOR — YouTube Sponsorship Scanner (Main file, rebuilt)
 * ============================================================
 * RECONSTRUCTION of the lost Code.gs, rebuilt Jul 29 2026 to satisfy the
 * exact contract that Discovery.gs v1.3 and ScanDialog.html depend on:
 *
 *   getConfig, validateConfig, resolveChannelIdFromHandle,
 *   getUploadsPlaylistId, scanAdHoc, sanitizeTabName, matchCategory,
 *   CATEGORIES, BRAND_ALIASES, extractBrands, normalizeBrandName
 *   + showScanDialog, searchChannelsForDialog, runScanFromDialog,
 *     scanByPrompt, buildBrandLeaderboard   (menu + dialog handlers)
 *
 * The detection engine (signals, extraction, aliases, filters) is carried
 * over from Scanner v3 unchanged. Ad-hoc scanning generalizes v3's
 * fixed-roster scan: any channel, written to "<Creator> - Raw".
 *
 * NOTE: onOpen() lives in Discovery.gs (its "replacement onOpen").
 * Do NOT add another onOpen here — Apps Script would keep only one.
 *
 * Script Properties required:
 *   YT_API_KEY = YouTube Data API v3 key
 *   SHEET_ID   = target spreadsheet ID
 *   (REPORT_RECIPIENTS is optional; only needed if email reporting is used)
 * ============================================================
 */


// ── CONFIG ──────────────────────────────────────────────────

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    ytApiKey: props.getProperty("YT_API_KEY"),
    sheetId: props.getProperty("SHEET_ID"),
    reportRecipients: props.getProperty("REPORT_RECIPIENTS"),
    videosPerPage: 50,
    lookbackDays: 730,          // 24 months
    dialogSearchResults: 8,     // channel results shown in the scan dialog
    rawTabName: "YT Scan - Raw",
    leaderboardTabName: "Brand Leaderboard",
  };
}

function validateConfig(config) {
  var missing = [];
  if (!config.ytApiKey) missing.push("YT_API_KEY");
  if (!config.sheetId) missing.push("SHEET_ID");
  if (missing.length > 0) {
    throw new Error("Missing Script Properties: " + missing.join(", ")
      + ". Go to Project Settings → Script Properties to add them.");
  }
}


// ── CATEGORIES ──────────────────────────────────────────────
// Used by "Scan selected creators" and manual scans to tag each creator's
// Raw tab. Edit this list freely — matchCategory() is fuzzy.

var CATEGORIES = [
  "Tech", "Gaming", "Lifestyle", "Fashion", "Beauty", "Fitness", "Health",
  "Wellness", "Food", "Coffee", "Travel", "Pets", "Parenting", "Dad",
  "Home", "Design", "DIY", "Garden", "Outdoors", "Sports", "Auto",
  "Finance", "Business", "Legal", "Real Estate", "Education", "Music",
  "Comedy", "Entertainment", "Photography", "Art", "Books", "Wedding",
  "Baby", "Sustainability", "Luxury", "Other"
];

/** Free-typed words that should resolve to a category. Add freely - keys are
 * lowercase, matched exactly first, then as the longest substring found in
 * whatever was typed ("dog mom vlogs" -> Pets). */
var CATEGORY_SYNONYMS = {
  dog: "Pets", dogs: "Pets", cat: "Pets", cats: "Pets", puppy: "Pets",
  kitten: "Pets", pet: "Pets", pets: "Pets", animal: "Pets", animals: "Pets",
  mom: "Parenting", mother: "Parenting", motherhood: "Parenting",
  momlife: "Parenting", family: "Parenting", kids: "Parenting",
  toddler: "Parenting", newborn: "Baby", pregnancy: "Baby", nursery: "Baby",
  dadlife: "Dad", father: "Dad", fatherhood: "Dad", dads: "Dad", girldad: "Dad",
  interior: "Design", "interior design": "Design", decor: "Design",
  decorating: "Design", architecture: "Design", graphic: "Design",
  furniture: "Home", organization: "Home", organizing: "Home", cleaning: "Home",
  "home improvement": "DIY", renovation: "DIY", reno: "DIY",
  woodworking: "DIY", contractor: "DIY", tools: "DIY",
  plants: "Garden", gardening: "Garden", vanlife: "Travel", hotel: "Travel",
  flight: "Travel", camping: "Outdoors", hiking: "Outdoors",
  adventure: "Outdoors", fishing: "Outdoors", hunting: "Outdoors",
  cooking: "Food", recipe: "Food", recipes: "Food", baking: "Food",
  chef: "Food", restaurant: "Food", barista: "Coffee", espresso: "Coffee",
  makeup: "Beauty", skincare: "Beauty", hair: "Beauty", nails: "Beauty",
  style: "Fashion", outfit: "Fashion", ootd: "Fashion", thrift: "Fashion",
  gym: "Fitness", workout: "Fitness", running: "Fitness", yoga: "Fitness",
  nutrition: "Health", "mental health": "Wellness", selfcare: "Wellness",
  money: "Finance", investing: "Finance", crypto: "Finance",
  budgeting: "Finance", realtor: "Real Estate", property: "Real Estate",
  mortgage: "Real Estate", lawyer: "Legal", attorney: "Legal", law: "Legal",
  entrepreneur: "Business", startup: "Business", marketing: "Business",
  photo: "Photography", videography: "Photography", filmmaking: "Photography",
  painting: "Art", craft: "Art", crafts: "Art", dance: "Entertainment",
  movie: "Entertainment", film: "Entertainment", book: "Books",
  reading: "Books", booktok: "Books", bride: "Wedding", eco: "Sustainability",
  sustainable: "Sustainability", zerowaste: "Sustainability",
  car: "Auto", cars: "Auto", truck: "Auto", golf: "Sports",
  basketball: "Sports", football: "Sports", soccer: "Sports"
};

/** Fuzzy-match free-typed text to a category; defaults to "Other". */
function matchCategory(text) {
  var t = (text || "").toString().trim().toLowerCase();
  if (!t) return "Other";
  // 1. exact category name
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].toLowerCase() === t) return CATEGORIES[i];
  }
  // 2. prefix either direction ("trav" -> Travel, "home decor" -> Home)
  for (var j = 0; j < CATEGORIES.length; j++) {
    var c = CATEGORIES[j].toLowerCase();
    if (c.indexOf(t) === 0 || t.indexOf(c) === 0) return CATEGORIES[j];
  }
  // 3. exact synonym
  if (CATEGORY_SYNONYMS.hasOwnProperty(t)) return CATEGORY_SYNONYMS[t];
  // 4. longest synonym appearing anywhere in the text
  var best = "", bestLen = 0;
  for (var k in CATEGORY_SYNONYMS) {
    if (k.length > bestLen && t.indexOf(k) !== -1) {
      best = CATEGORY_SYNONYMS[k]; bestLen = k.length;
    }
  }
  if (best) return best;
  // 5. any category name appearing anywhere in the text
  for (var m = 0; m < CATEGORIES.length; m++) {
    var cm = CATEGORIES[m].toLowerCase();
    if (cm !== "other" && t.indexOf(cm) !== -1) return CATEGORIES[m];
  }
  return "Other";
}

/** Makes a channel title safe (and short enough) for "<name> - Raw" tabs. */
function sanitizeTabName(name) {
  var clean = (name || "").toString()
    .replace(/[\[\]\/\\?*:]/g, "")   // chars Sheets forbids in tab names
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > 24) clean = clean.substring(0, 24).trim();
  return clean || "Channel";
}


// ── BRAND DATA (carried over from Scanner v3) ───────────────

var BRAND_ALIASES = {
  "drinkag1": "AG1",
  "athletic greens": "AG1",
  "athleticgreens": "AG1",
  "ag1": "AG1",
  "notion.so": "Notion",
  "notion": "Notion",
  "squarespace": "Squarespace",
  "skillshare": "Skillshare",
  "brilliant.org": "Brilliant",
  "brilliant": "Brilliant",
  "betterhelp": "BetterHelp",
  "better help": "BetterHelp",
  "nordvpn": "NordVPN",
  "expressvpn": "ExpressVPN",
  "surfshark": "Surfshark",
  "audible": "Audible",
  "hellofresh": "HelloFresh",
  "hello fresh": "HelloFresh",
  "teuxdeux": "TeuxDeux",
  "teux deux": "TeuxDeux",
  "dbrand": "dbrand",
  "casetify": "CASETiFY",
  "trade coffee": "Trade Coffee",
  "tradecoffee": "Trade Coffee",
  "fellow": "Fellow",
  "raycon": "Raycon",
  "ridge": "Ridge",
  "ridge wallet": "Ridge",
  "ridge wallets": "Ridge",
  "manscaped": "Manscaped",
  "curiositystream": "CuriosityStream",
  "curiosity stream": "CuriosityStream",
  "nebula": "Nebula",
  "established titles": "Established Titles",
  "babbel": "Babbel",
  "grammarly": "Grammarly",
  "keeper": "Keeper",
  "keeper security": "Keeper Security",
  "functi0n": "Function of Beauty",
  "function of beauty": "Function of Beauty",
  "aura": "Aura",
  "auraframes": "Aura Frames",
  "aura frames": "Aura Frames",
  // Tech / PC hardware aliases
  "micro center": "Micro Center",
  "microcenter": "Micro Center",
  "newegg": "Newegg",
  "corsair": "Corsair",
  "ekwb": "EKWB",
  "ek water blocks": "EKWB",
  "seasonic": "Seasonic",
  "be quiet": "be quiet!",
  "be quiet!": "be quiet!",
  "bequiet": "be quiet!",
  "ifixit": "iFixit",
  "thermal grizzly": "Thermal Grizzly",
  "thermalgrizzly": "Thermal Grizzly",
  "lianli": "Lian Li",
  "lian li": "Lian Li",
  "pcspecialist": "PCSpecialist",
  "glasswire": "GlassWire",
  "glass wire": "GlassWire",
  "ting": "Ting",
  "noctua": "Noctua",
  "phanteks": "Phanteks",
  "deepcool": "DeepCool",
  "cooler master": "Cooler Master",
  "coolermaster": "Cooler Master",
  "msi": "MSI",
  "asus": "ASUS",
  "evga": "EVGA",
  "gigabyte": "Gigabyte",
  "asrock": "ASRock",
  "crucial": "Crucial",
  "kingston": "Kingston",
  "samsung": "Samsung",
  "western digital": "Western Digital",
  "wd": "Western Digital",
  "seagate": "Seagate",
  "sabrent": "Sabrent",
  "teamgroup": "TeamGroup",
  "team group": "TeamGroup",
  "pny": "PNY",
  "bambu lab": "Bambu Lab",
  "bambulab": "Bambu Lab",
  "bambu": "Bambu Lab",
  "helixsleep": "Helix Sleep",
  "helix": "Helix Sleep",
  "helix sleep": "Helix Sleep",
  "falcon-nw": "Falcon Northwest",
  "falcon northwest": "Falcon Northwest",
  "sbird": "Scentbird",
  "scentbird": "Scentbird",
  "frctl": "Fractal Design",
  "fractal": "Fractal Design",
  "fractal design": "Fractal Design",
  "geekompc": "Geekom",
  "geekom": "Geekom",
  "myskylight": "Skylight",
  "skylight": "Skylight",
  "fonusmobile": "Fonus",
  "fonus": "Fonus",
  "inmoxr": "INMO",
  "inmo": "INMO",
  "fifinemicrophone": "Fifine",
  "fifine": "Fifine",
  "centralcomputer": "Central Computers",
  "central computers": "Central Computers",
  "opera gx": "Opera",
  "opera": "Opera",
  "andaseat": "AndaSeat",
  "noblechairs": "Noblechairs",
  "steampowered": "Steam",
  "xreal": "XREAL",
  "xrealonepro": "XREAL",
  "xreal1s": "XREAL",
  "factor": "Factor",
  "factor75": "Factor",
  "woojer": "Woojer",
  "lenovo": "Lenovo",
  "qualcomm": "Qualcomm",
  "dropbox": "Dropbox",
  "incogni": "Incogni",
  "reolink": "Reolink",
  "analogue": "Analogue",
  "sfbags": "SF Bags",
  "playstation": "PlayStation",
};

var MASS_SPONSOR_BRANDS = [
  "squarespace", "skillshare", "brilliant", "audible", "nordvpn",
  "expressvpn", "surfshark", "betterhelp", "hellofresh", "nebula",
  "curiositystream", "established titles", "raid shadow legends",
  "raycon", "ridge", "manscaped", "babbel", "grammarly",
  "function of beauty", "keeper security",
];

var JUNK_DOMAINS = [
  "youtube", "instagram", "tiktok", "facebook", "twitter", "x",
  "pinterest", "reddit", "snapchat", "linkedin", "threads",
  "patreon", "ko-fi", "buymeacoffee", "paypal", "venmo",
  "google", "apple", "spotify", "amazon", "bit", "linktr",
  "youtu", "goo", "amzn", "tinyurl", "bitly",
  "creativecommons", "commons", "wikimedia", "wikipedia",
  "mailto", "javascript", "static", "cdn", "assets", "media",
  "content", "upload", "image", "embed", "player", "widget",
  "tracking", "analytics", "share", "plugin",
  "twitch", "streamlabs", "discord", "floatplane",
  "playstation", "xbox", "nintendo", "steampowered", "steam", "epicgames",
  "soundcloud", "shrsl", "shareasale", "linksynergy", "awin", "avantlink",
  "skimresources", "rstyle", "howl", "mavely", "geni", "sovrn", "redirectingat",
  "anrdoezrs", "dpbolvw", "kqzyfj", "jdoqocy", "tkqlhce", "pjtra", "pntra",
  "pntrs", "gopjn", "affilimate", "tomshardware", "videocardz",
];


// ── YOUTUBE API HELPERS ─────────────────────────────────────

/** Resolve a channel ID from a @handle via channels.list (1 unit). */
function resolveChannelIdFromHandle(config, handle) {
  try {
    var url = "https://www.googleapis.com/youtube/v3/channels"
      + "?key=" + config.ytApiKey
      + "&forHandle=" + encodeURIComponent((handle || "").replace(/^@/, ""))
      + "&part=id";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) {
      Logger.log("  Handle resolution error: " + resp.getContentText().substring(0, 150));
      return null;
    }
    var json = JSON.parse(resp.getContentText());
    if (json.items && json.items.length > 0) return json.items[0].id;
  } catch (e) {
    Logger.log("  Handle resolution error: " + e.message);
  }
  return null;
}

/** Uploads playlist for a channel (1 unit), UC→UU swap fallback. */
function getUploadsPlaylistId(config, channelId) {
  try {
    var url = "https://www.googleapis.com/youtube/v3/channels"
      + "?key=" + config.ytApiKey
      + "&id=" + channelId
      + "&part=contentDetails";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) {
      Logger.log("  channels.list error, falling back to UC→UU swap: " + resp.getContentText().substring(0, 150));
      return "UU" + channelId.substring(2);
    }
    var json = JSON.parse(resp.getContentText());
    if (json.items && json.items.length > 0 && json.items[0].contentDetails) {
      return json.items[0].contentDetails.relatedPlaylists.uploads;
    }
  } catch (e) {
    Logger.log("  Error getting uploads playlist, falling back to UC→UU swap: " + e.message);
  }
  return "UU" + channelId.substring(2);
}

/** Basic channel profile (snippet + statistics), or null. */
function getChannelProfile(config, channelId) {
  var url = "https://www.googleapis.com/youtube/v3/channels"
    + "?key=" + config.ytApiKey
    + "&id=" + channelId
    + "&part=snippet,statistics";
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 400) return null;
  var json = JSON.parse(resp.getContentText());
  if (!json.items || !json.items.length) return null;
  var ch = json.items[0];
  return {
    id: ch.id,
    title: ch.snippet.title || channelId,
    handle: ch.snippet.customUrl || "",
    subs: Number((ch.statistics || {}).subscriberCount || 0),
  };
}

/**
 * Paginated video IDs via playlistItems.list (1 unit/page).
 * Stops at cutoffDate; 100-page (5,000 video) safety cap.
 */
function getAllVideoIdsFromPlaylist(config, playlistId, cutoffDate) {
  var allIds = [];
  var nextPageToken = null;
  var maxPages = 100;
  var page = 0;
  var reachedCutoff = false;

  do {
    var url = "https://www.googleapis.com/youtube/v3/playlistItems"
      + "?key=" + config.ytApiKey
      + "&playlistId=" + playlistId
      + "&part=contentDetails"
      + "&maxResults=" + config.videosPerPage;
    if (nextPageToken) url += "&pageToken=" + nextPageToken;

    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 400) {
      Logger.log("  playlistItems error (page " + page + "): " + resp.getContentText().substring(0, 200));
      break;
    }
    var json = JSON.parse(resp.getContentText());

    if (json.items) {
      for (var i = 0; i < json.items.length; i++) {
        var cd = json.items[i].contentDetails || {};
        if (!cd.videoId) continue;
        if (cd.videoPublishedAt && new Date(cd.videoPublishedAt) < cutoffDate) {
          reachedCutoff = true;
          break;
        }
        allIds.push(cd.videoId);
      }
    }
    if (reachedCutoff) break;

    nextPageToken = json.nextPageToken || null;
    page++;
    if (nextPageToken) Utilities.sleep(100);
  } while (nextPageToken && page < maxPages);

  return allIds;
}

function getVideoDetails(config, videoIds) {
  var url = "https://www.googleapis.com/youtube/v3/videos"
    + "?key=" + config.ytApiKey
    + "&id=" + videoIds.join(",")
    + "&part=snippet,statistics";
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 400) {
    throw new Error("YouTube videos error: " + resp.getContentText().substring(0, 200));
  }
  return JSON.parse(resp.getContentText()).items || [];
}


// ── SIGNAL SCORING (v3 engine, unchanged) ───────────────────

function scoreSignals(text) {
  var lower = text.toLowerCase();
  var score = 0;
  var reasons = [];

  if (/#ad\b/.test(lower) || /#sponsored\b/.test(lower) || /#partner\b/.test(lower) || /#brandpartner\b/.test(lower)) {
    score += 4;
    reasons.push("Hashtag Disclosure");
  }
  if (/this\s+(video|episode|content)\s+is\s+sponsored\s+by/.test(lower) || /paid\s+partnership/.test(lower) || /paid\s+promotion/.test(lower)) {
    score += 5;
    reasons.push("Explicit Sponsorship");
  }
  if (/sponsored\s+by/.test(lower) || /brought\s+to\s+you\s+by/.test(lower) || /presented\s+by/.test(lower)) {
    score += 4;
    reasons.push("Sponsorship Mention");
  }
  if (/thanks?\s+to\s+.{1,40}\s+for\s+(sponsoring|partnering|supporting|making)/.test(lower)) {
    score += 4;
    reasons.push("Thank You Sponsorship");
  }
  if (/use\s+(code|my\s+code)|promo\s+code|discount\s+code/.test(lower)) {
    score += 2;
    reasons.push("Discount Code");
  }
  if (/in\s+collaboration\s+with|partnered\s+with|in\s+partnership\s+with/.test(lower)) {
    score += 3;
    reasons.push("Collaboration");
  }
  if (/affiliate/.test(lower) || /commission/.test(lower)) {
    score += 1;
    reasons.push("Affiliate");
  }
  if (/sent\s+(me|us|this|over)|provided\s+by|gifted\s+by|supplied\s+by|sample\s+from|courtesy\s+of|received\s+.{1,30}\s+from/.test(lower)) {
    score += 3;
    reasons.push("Product Seeding");
  }
  if (/check\s+out\s+the\s+.{1,40}(?:link|below|here)/.test(lower) && /#ad\b|sponsor|partner/i.test(lower)) {
    score += 1;
    reasons.push("CTA + Disclosure");
  }

  return { score: score, reasons: reasons };
}


// ── BRAND EXTRACTION (v3 engine, unchanged) ─────────────────

function extractBrands(fullText, description) {
  var brands = [];
  var seen = {};

  // METHOD 1: Explicit sponsor mentions
  var explicitPatterns = [
    { re: /(?:[Tt]hank\s+[Yy]ou,?\s+(?:[Tt]o\s+)?|[Tt]hanks,?\s+(?:[Tt]o\s+)?)([A-Z0-9][A-Za-z0-9\s&:'!.\-]{1,40}?)\s+for\s+(?:sponsoring|supporting|partnering|sending)/g, score: 5 },
    { re: /(?:sponsored|partnered?)\s+(?:by|with)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 4 },
    { re: /(?:thanks?\s+to)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})\s+(?:for|who|!)/gi, score: 4 },
    { re: /(?:brought\s+to\s+you\s+by|presented\s+by)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 4 },
    { re: /(?:video|episode|content)\s+(?:is\s+)?(?:sponsored|brought\s+to\s+you|presented)\s+(?:by|with)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 5 },
    { re: /in\s+collaboration\s+with\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 3 },
    { re: /(?:sent|provided|gifted|supplied)\s+(?:by|from)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 3 },
    { re: /(?:courtesy\s+of)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 3 },
    { re: /(?:received\s+(?:this|a|the)\s+.{0,20}\s+from)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 3 },
  ];

  for (var p = 0; p < explicitPatterns.length; p++) {
    var pattern = explicitPatterns[p];
    pattern.re.lastIndex = 0;
    var match;
    while ((match = pattern.re.exec(fullText)) !== null) {
      var name = cleanBrandCapture(match[1]);
      if (name && !seen[name.toLowerCase()]) {
        seen[name.toLowerCase()] = true;
        brands.push({ name: name, score: pattern.score, evidence: match[0].trim().substring(0, 120) });
      }
    }
  }

  // METHOD 2: Line-by-line description scanning
  var lines = description.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var lineLower = line.toLowerCase();
    if (line.length < 5 || line.length > 500) continue;

    var isSponsorLine = (
      lineLower.indexOf("sponsor") > -1 ||
      lineLower.indexOf("thanks to") > -1 ||
      lineLower.indexOf("brought to you") > -1 ||
      lineLower.indexOf("partnered with") > -1 ||
      lineLower.indexOf("paid partnership") > -1 ||
      lineLower.indexOf("presented by") > -1 ||
      lineLower.indexOf("in collaboration with") > -1 ||
      lineLower.indexOf("supported by") > -1 ||
      lineLower.indexOf("#ad") > -1 ||
      lineLower.indexOf("use code") > -1 ||
      lineLower.indexOf("promo code") > -1 ||
      lineLower.indexOf("discount code") > -1 ||
      lineLower.indexOf("sent by") > -1 ||
      lineLower.indexOf("provided by") > -1 ||
      lineLower.indexOf("gifted by") > -1 ||
      lineLower.indexOf("courtesy of") > -1 ||
      lineLower.indexOf("supplied by") > -1 ||
      lineLower.indexOf("sent me") > -1 ||
      lineLower.indexOf("sent us") > -1 ||
      lineLower.indexOf("sent this") > -1
    );

    if (isSponsorLine) {
      var urlLines = line;
      if (i + 1 < lines.length) urlLines += " " + lines[i + 1];
      if (i + 2 < lines.length) urlLines += " " + lines[i + 2];

      var urlMatches = urlLines.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,25})\.(?:com|co|io|org|net)(?:\/\S*)?/gi);
      if (urlMatches) {
        for (var u = 0; u < urlMatches.length; u++) {
          var domain = urlMatches[u].replace(/https?:\/\//, "").replace(/^www\./, "").split(".")[0];
          if (domain && !seen[domain.toLowerCase()] && !isJunkBrand(domain.toLowerCase())) {
            seen[domain.toLowerCase()] = true;
            brands.push({ name: domain, score: 3, evidence: line.substring(0, 120) });
          }
        }
      }
    }
  }

  // METHOD 3: Brand URL detection
  var hasSponsorContext = /#ad\b|#sponsored\b|sponsor|brought to you|presented by|use code|promo code|discount code|partnered with/i.test(fullText);

  if (hasSponsorContext) {
    var urlBrandPattern = /(?:https?:\/\/)?([a-z][a-z0-9-]{1,25})\.(?:com|co|io|org|net)\/([a-z][a-z0-9_-]{2,30})/gi;
    urlBrandPattern.lastIndex = 0;
    var urlBrandMatch;
    while ((urlBrandMatch = urlBrandPattern.exec(fullText)) !== null) {
      var urlDomain = urlBrandMatch[1].toLowerCase();
      var urlPath = urlBrandMatch[2].toLowerCase();
      if (urlPath.length >= 3 && urlPath.length <= 25 && !isJunkBrand(urlDomain) && !isSocialPlatformDomain(urlDomain)) {
        if (!seen[urlDomain]) {
          seen[urlDomain] = true;
          brands.push({ name: urlDomain, score: 2, evidence: urlBrandMatch[0].substring(0, 120) });
        }
      }
    }
  }

  // METHOD 4: Discount code extraction
  var codePatterns = [
    /(?:use\s+(?:code|my\s+code)\s+\S+\s+(?:at|on|with)\s+)([a-z][a-z0-9-]+)\.(?:com|co|io)/gi,
    /(?:visit|go\s+to|check\s+out)\s+([a-z][a-z0-9-]+)\.(?:com|co|io)(?:\/\S+)?\s+.*?(?:use\s+code|promo)/gi,
  ];
  for (var cp = 0; cp < codePatterns.length; cp++) {
    codePatterns[cp].lastIndex = 0;
    var codeMatch;
    while ((codeMatch = codePatterns[cp].exec(fullText)) !== null) {
      var codeBrand = codeMatch[1].toLowerCase();
      if (codeBrand && !seen[codeBrand] && !isJunkBrand(codeBrand)) {
        seen[codeBrand] = true;
        brands.push({ name: codeBrand, score: 3, evidence: codeMatch[0].trim().substring(0, 120) });
      }
    }
  }

  // METHOD 5: Top-of-description brand link detection
  var topLines = description.split("\n").slice(0, 8);
  for (var tl = 0; tl < topLines.length; tl++) {
    var topLine = topLines[tl].trim();
    if (topLine.length < 5) continue;

    var topUrlMatches = topLine.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,25})\.(?:com|co|io|org|net)(?:\/\S*)?/gi);
    if (topUrlMatches) {
      for (var tu = 0; tu < topUrlMatches.length; tu++) {
        var topDomain = topUrlMatches[tu].replace(/https?:\/\//, "").replace(/^www\./, "").split(".")[0].toLowerCase();
        if (topDomain && !seen[topDomain] && !isJunkBrand(topDomain) && !isSocialPlatformDomain(topDomain)) {
          var hasCreatorPath = /\.[a-z]{2,3}\/[a-z][a-z0-9_-]{2,25}$/i.test(topUrlMatches[tu]);
          var lineHasCode = /code|%\s*off|discount|coupon|free/i.test(topLine);
          var urlScore = hasCreatorPath ? 3 : (lineHasCode ? 3 : 2);
          seen[topDomain] = true;
          brands.push({ name: topDomain, score: urlScore, evidence: topLine.substring(0, 120) });
        }
      }
    }
  }

  // METHOD 6: Discount code lines without an inline "at brand.com"
  var descLines = description.split("\n");
  for (var dl = 0; dl < descLines.length; dl++) {
    var dLine = descLines[dl].trim();
    var dLineLower = dLine.toLowerCase();
    if (!/use\s+code|%\s*off|discount|coupon/i.test(dLineLower)) continue;

    var codeContext = dLine;
    if (dl + 1 < descLines.length) codeContext += " " + descLines[dl + 1];
    if (dl + 2 < descLines.length) codeContext += " " + descLines[dl + 2];

    var codeUrlMatches = codeContext.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,25})\.(?:com|co|io|org|net)(?:\/\S*)?/gi);
    if (codeUrlMatches) {
      for (var cu = 0; cu < codeUrlMatches.length; cu++) {
        var codeDomain = codeUrlMatches[cu].replace(/https?:\/\//, "").replace(/^www\./, "").split(".")[0].toLowerCase();
        if (codeDomain && !seen[codeDomain] && !isJunkBrand(codeDomain) && !isSocialPlatformDomain(codeDomain)) {
          seen[codeDomain] = true;
          brands.push({ name: codeDomain, score: 3, evidence: dLine.substring(0, 120) });
        }
      }
    }
  }

  // METHOD 7: Brand hashtag detection - STRICT
  // A bare hashtag is only a brand when it matches a known alias, or uses a
  // #BrandPartner/#BrandAmbassador-style shape. Anything else (#tennis, #pov,
  // #sponsored) is topic noise, not a sponsor.
  var hashtagMatches = fullText.match(/#([A-Za-z][A-Za-z0-9]{2,25})/g);
  if (hashtagMatches) {
    for (var ht = 0; ht < hashtagMatches.length; ht++) {
      var htName = hashtagMatches[ht].substring(1);
      var htLower = htName.toLowerCase();
      if (seen[htLower]) continue;
      if (isCommonWord(htName)) continue;
      if (isJunkBrand(htLower)) continue;
      var pShape = htLower.match(/^([a-z0-9]{3,})(partner|ambassador|crew)$/);
      if (pShape && !BRAND_ALIASES[htLower]) {
        var core = pShape[1];
        if (!seen[core] && !isCommonWord(core) && !isJunkBrand(core)) {
          seen[core] = true;
          brands.push({ name: BRAND_ALIASES[core] || cleanBrandCapture(core), score: 4, evidence: "#" + htName + " (partner-style hashtag)" });
        }
        continue;
      }
      if (!BRAND_ALIASES[htLower]) continue;
      seen[htLower] = true;
      brands.push({ name: BRAND_ALIASES[htLower], score: 2, evidence: "#" + htName + " (hashtag in description)" });
    }
  }

  return brands;
}

function cleanBrandCapture(name) {
  if (!name) return "";
  name = name.trim().replace(/\s+/g, " ");

  var stopWords = [" and ", " for ", " to ", " with ", " by ", " in ", " on ",
    " at ", " the ", " is ", " are ", " was ", " has ", " our ", " my ",
    " your ", " below ", " above ", " using ", " link ", " get ", " who ",
    " that ", " this ", " so ", " we ", " you "];
  for (var i = 0; i < stopWords.length; i++) {
    var idx = name.toLowerCase().indexOf(stopWords[i]);
    if (idx > 0) name = name.substring(0, idx).trim();
  }

  name = name.replace(/[.!,;:]+$/, "").trim();
  if (name.length < 2 || name.length > 40) return "";
  if (isCommonWord(name)) return "";

  return name;
}

function normalizeBrandName(name) {
  if (!name) return "";

  var cleaned = name.toLowerCase().trim()
    .replace(/^www\./, "")
    .replace(/\.(com|co|io|org|net)$/, "")
    .replace(/[^\w\s&'\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (BRAND_ALIASES[cleaned]) return BRAND_ALIASES[cleaned];

  return cleaned.split(" ")
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(" ");
}


// ── FILTERS ─────────────────────────────────────────────────

function isJunkBrand(name) {
  for (var i = 0; i < JUNK_DOMAINS.length; i++) {
    if (name === JUNK_DOMAINS[i]) return true;
  }
  return false;
}

function isSocialPlatformDomain(domain) {
  var platforms = [
    "youtube", "instagram", "tiktok", "facebook", "twitter",
    "pinterest", "reddit", "snapchat", "linkedin", "threads",
    "patreon", "spotify", "amazon", "google", "apple",
    "youtu", "goo", "amzn", "tinyurl", "bitly", "bit",
    "linktr", "ko-fi", "buymeacoffee", "paypal", "venmo",
    "twitch", "streamlabs", "discord",
  ];
  for (var i = 0; i < platforms.length; i++) {
    if (domain === platforms[i]) return true;
  }
  return false;
}

function isCommonWord(word) {
  var common = [
    "the", "and", "for", "with", "this", "that", "from", "your", "have",
    "more", "about", "what", "when", "where", "which", "their", "been",
    "will", "each", "make", "like", "just", "over", "take", "than",
    "very", "some", "also", "then", "well", "much", "click", "link",
    "below", "above", "video", "subscribe", "channel", "watch", "follow",
    "episode", "today", "new", "best", "how", "get", "use", "code",
    "check", "out", "try", "we", "partners", "sponsors", "sponsor",
    "partner", "brand", "brands", "creator", "creators", "content",
    "music", "camera", "gear", "shop", "store", "buy", "sale",
    "discount", "free", "first", "last", "next", "here", "there",
    "good", "great", "amazing", "day", "week", "month", "year",
    "vlog", "review", "tutorial", "guide", "tips",
  ];
  var lw = word.toLowerCase();
  for (var i = 0; i < common.length; i++) {
    if (lw === common[i]) return true;
  }
  if (word.length < 3) return true;
  if (/^\d+$/.test(word)) return true;
  return false;
}

/**
 * Dynamic self-reference check for ad-hoc scans: filters out the scanned
 * channel's own name/handle so it never shows up as its own "sponsor".
 * (Replaces v3's hardcoded CHANNEL_SELF_REFS list.)
 */
function buildSelfRefKeys(channelTitle, channelHandle) {
  var keys = {};
  function add(s) {
    var k = (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (k.length >= 3) keys[k] = true;
  }
  add(channelTitle);
  add((channelHandle || "").replace(/^@/, ""));
  var words = (channelTitle || "").split(/\s+/);
  if (words.length > 1) add(words.join(""));
  if (words.length > 0 && words[0].length >= 4) add(words[0]);
  return keys;
}

function isSelfRefDynamic(normalizedLower, selfKeys) {
  var k = normalizedLower.replace(/[^a-z0-9]/g, "");
  if (!k) return false;
  if (selfKeys[k]) return true;
  for (var key in selfKeys) {
    if (key.length >= 5 && (k.indexOf(key) === 0 || key.indexOf(k) === 0)) return true;
  }
  return false;
}


// ── AD-HOC CHANNEL SCAN (the core engine) ───────────────────

/**
 * Scans ANY channel by ID and writes "<tabBase> - Raw".
 * Returns { count, tabName, videosChecked, creator }.
 * This is the function Discovery.gs's scanSelectedCreators() calls.
 */
function scanAdHoc(tabBase, channelId, category) {
  var config = getConfig();
  validateConfig(config);

  var profile = getChannelProfile(config, channelId) ||
    { id: channelId, title: tabBase, handle: "", subs: 0 };
  var selfKeys = buildSelfRefKeys(profile.title, profile.handle);

  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.lookbackDays);

  var uploads = getUploadsPlaylistId(config, channelId);
  var videoIds = getAllVideoIdsFromPlaylist(config, uploads, cutoffDate);
  Logger.log("scanAdHoc " + profile.title + ": " + videoIds.length + " videos in window");

  var results = [];
  for (var i = 0; i < videoIds.length; i += 50) {
    var batch = videoIds.slice(i, i + 50);
    var videos = getVideoDetails(config, batch);

    for (var v = 0; v < videos.length; v++) {
      var video = videos[v];
      var sn = video.snippet || {};
      var fullText = (sn.title || "") + "\n" + (sn.description || "") + "\n" + (sn.tags || []).join(" ");
      var signals = scoreSignals(fullText);
      var brands = extractBrands(fullText, sn.description || "");
      var seenPerVideo = {};

      for (var b = 0; b < brands.length; b++) {
        var normalized = normalizeBrandName(brands[b].name);
        if (!normalized || normalized.length < 2) continue;
        var normalizedLower = normalized.toLowerCase();
        if (isJunkBrand(normalizedLower)) continue;
        if (isSelfRefDynamic(normalizedLower, selfKeys)) continue;
        if (seenPerVideo[normalizedLower]) continue;
        seenPerVideo[normalizedLower] = true;

        var confidence = signals.score + brands[b].score;
        results.push({
          normalizedBrand: normalized,
          confidenceScore: confidence,
          confidenceLabel: confidence >= 5 ? "High" : confidence >= 3 ? "Medium" : "Low",
          videoTitle: sn.title || "",
          videoUrl: "https://www.youtube.com/watch?v=" + video.id,
          publishedAt: sn.publishedAt || "",
          views: (video.statistics || {}).viewCount || "0",
          signals: signals.reasons.join(", "),
          evidence: brands[b].evidence,
          isMassSponsor: MASS_SPONSOR_BRANDS.indexOf(normalizedLower) > -1,
        });
      }
    }
    if (i + 50 < videoIds.length) Utilities.sleep(100);
  }

  var tabName = writeAdHocRawTab(config, tabBase, category, results);
  return { count: results.length, tabName: tabName, videosChecked: videoIds.length, creator: profile.title };
}

/** Writes "<tabBase> - Raw" (overwritten each run). Returns the tab name. */
function writeAdHocRawTab(config, tabBase, category, results) {
  var ss = SpreadsheetApp.openById(config.sheetId);
  var tabName = tabBase + " - Raw";
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    try { sheet.hideSheet(); } catch (eh) {} // raw tabs stay hidden (Simple view); IG Scanner > More tools > Open a hidden tab
  } else {
    sheet.clearContents();
  }

  var headers = [
    "Date Scanned", "Brand", "Confidence", "Score",
    "Video Title", "Video URL", "Published", "Views",
    "Signal Type", "Evidence", "Mass Sponsor", "Category"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#1B3A5C").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);

  if (results.length > 0) {
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    results.sort(function(a, b) { return b.confidenceScore - a.confidenceScore; });

    var rows = results.map(function(r) {
      return [
        today, r.normalizedBrand, r.confidenceLabel, r.confidenceScore,
        r.videoTitle, r.videoUrl,
        r.publishedAt ? r.publishedAt.substring(0, 10) : "",
        r.views, r.signals, r.evidence,
        r.isMassSponsor ? "Yes" : "", category || "Other",
      ];
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    var confRange = sheet.getRange("C2:C" + (rows.length + 1));
    sheet.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("High").setBackground("#D1FAE5").setFontColor("#059669").setBold(true).setRanges([confRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Medium").setBackground("#FEF3C7").setFontColor("#92400E").setBold(true).setRanges([confRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Low").setBackground("#F3F4F6").setFontColor("#9CA3AF").setRanges([confRange]).build(),
    ]);
  }

  var widths = [110, 180, 90, 60, 280, 200, 100, 80, 160, 300, 100, 110];
  for (var w = 0; w < widths.length; w++) sheet.setColumnWidth(w + 1, widths[w]);

  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).createFilter();

  Logger.log("Wrote " + results.length + " results to " + tabName);
  return tabName;
}


// ── SCAN DIALOG (menu: "Scan a creator's channel") ──────────

function showScanDialog() {
  var html = HtmlService.createHtmlOutputFromFile("ScanDialog")
    .setWidth(430)
    .setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(html, "Rootfor Scanner");
}

/**
 * Server handler for the dialog's live search.
 * NOTE: each call is one search.list request (billed against the dedicated
 * ~100 searches/day budget) — the dialog debounces to keep this cheap.
 */
function searchChannelsForDialog(query) {
  var config = getConfig();
  validateConfig(config);

  var url = "https://www.googleapis.com/youtube/v3/search"
    + "?key=" + config.ytApiKey
    + "&part=snippet"
    + "&type=channel"
    + "&maxResults=" + config.dialogSearchResults
    + "&q=" + encodeURIComponent(query);

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 400) {
    throw new Error("Channel search failed (" + resp.getResponseCode() + "). "
      + "If this persists, the daily search budget may be used up.");
  }
  var items = JSON.parse(resp.getContentText()).items || [];

  return items.map(function(it) {
    var sn = it.snippet || {};
    var thumb = sn.thumbnails && (sn.thumbnails.default || sn.thumbnails.medium);
    return {
      channelId: (it.id && it.id.channelId) || sn.channelId || "",
      title: sn.title || "",
      description: (sn.description || "").substring(0, 90),
      thumbnail: thumb ? thumb.url : "",
    };
  }).filter(function(r) { return r.channelId; });
}

/**
 * Server handler for the dialog's scan click.
 * Returns { count, tab } — the shape ScanDialog.html expects.
 */
function runScanFromDialog(channelId, title) {
  var tabBase = sanitizeTabName(title);
  var res = scanAdHoc(tabBase, channelId, "Other");
  return { count: res.count, tab: res.tabName };
}

/** Menu: "Scan by ID / @handle (manual)". */
function scanByPrompt() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();
  validateConfig(config);

  var resp = ui.prompt(
    "Scan by ID / @handle",
    "Paste a channel ID (UC...) or @handle:",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var raw = resp.getResponseText().trim().replace(/^@/, "");
  if (!raw) return;

  var channelId = /^UC[A-Za-z0-9_-]{20,}$/.test(raw)
    ? raw
    : resolveChannelIdFromHandle(config, raw);
  if (!channelId) { ui.alert("Couldn't resolve that channel. Check the ID/handle."); return; }

  var profile = getChannelProfile(config, channelId);
  var name = profile ? profile.title : raw;

  var catResp = ui.prompt(
    "Category for " + name,
    "Type one of:\n" + CATEGORIES.join(", "),
    ui.ButtonSet.OK_CANCEL);
  if (catResp.getSelectedButton() !== ui.Button.OK) return;
  var category = matchCategory(catResp.getResponseText());

  try {
    var res = scanAdHoc(sanitizeTabName(name), channelId, category);
    ui.alert("Scanned " + res.creator + "\n\nVideos checked: " + res.videosChecked
      + "\nBrand detections: " + res.count
      + "\n\nSee \"" + res.tabName + "\". Run \"Rebuild Brand Leaderboard\" to refresh the rollup.");
  } catch (e) {
    ui.alert("Scan failed: " + e.message);
  }
}


// ── BRAND LEADERBOARD (menu: "Rebuild Brand Leaderboard") ───

/**
 * Aggregates EVERY "* - Raw" tab into "Brand Leaderboard".
 * Column names "Brand" (col A) and "Mass Sponsor" are load-bearing —
 * Discovery.gs reads them by header name. Preserves nothing (full rebuild).
 */
function buildBrandLeaderboard() {
  var config = getConfig();
  validateConfig(config);
  var ss = SpreadsheetApp.openById(config.sheetId);

  var brands = {};
  var sheets = ss.getSheets();
  var tabsRead = 0;

  for (var s = 0; s < sheets.length; s++) {
    var tab = sheets[s].getName();
    if (tab.slice(-6) !== " - Raw") continue;
    var sheet = sheets[s];
    if (sheet.getLastRow() <= 1) continue;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var brandCol = headers.indexOf("Brand");
    var confCol = headers.indexOf("Confidence");
    var scoreCol = headers.indexOf("Score");
    var pubCol = headers.indexOf("Published");
    var evCol = headers.indexOf("Evidence");
    var massCol = headers.indexOf("Mass Sponsor");
    var catCol = headers.indexOf("Category");
    if (brandCol === -1) continue;

    var creator = tab.slice(0, -6);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    tabsRead++;

    for (var r = 0; r < data.length; r++) {
      var brand = (data[r][brandCol] || "").toString().trim();
      if (!brand) continue;
      var key = brand.toLowerCase();

      if (!brands[key]) {
        brands[key] = {
          brand: brand, channels: {}, sightings: 0, bestScore: -1,
          bestConf: "", categories: {}, mass: false, latest: "", evidence: "",
        };
      }
      var b = brands[key];
      b.channels[creator] = true;
      b.sightings++;

      var score = scoreCol > -1 ? Number(data[r][scoreCol]) || 0 : 0;
      if (score > b.bestScore) {
        b.bestScore = score;
        b.bestConf = confCol > -1 ? (data[r][confCol] || "").toString() : "";
        if (evCol > -1 && data[r][evCol]) b.evidence = data[r][evCol].toString().substring(0, 160);
      }
      if (massCol > -1 && (data[r][massCol] || "").toString() === "Yes") b.mass = true;
      if (catCol > -1 && data[r][catCol]) b.categories[data[r][catCol].toString()] = true;

      var pub = pubCol > -1 ? (data[r][pubCol] || "").toString() : "";
      if (pub && pub > b.latest) b.latest = pub.substring(0, 10);
    }
  }

  var headersOut = [
    "Brand", "Channels", "Channel List", "Category", "Mass Sponsor",
    "Sightings", "Best Confidence", "Latest Seen", "Best Evidence"
  ];

  var out = Object.keys(brands).map(function(k) {
    var b = brands[k];
    var chNames = Object.keys(b.channels);
    return [
      b.brand, chNames.length, chNames.join(", "),
      Object.keys(b.categories).join(", ") || "Other",
      b.mass ? "Yes" : "", b.sightings, b.bestConf, b.latest, b.evidence,
    ];
  });
  out.sort(function(a, b) { return b[1] - a[1] || b[5] - a[5]; });

  var lb = ss.getSheetByName(config.leaderboardTabName);
  if (!lb) lb = ss.insertSheet(config.leaderboardTabName);
  lb.clearContents();
  lb.getRange(1, 1, 1, headersOut.length).setValues([headersOut]);
  lb.getRange(1, 1, 1, headersOut.length)
    .setBackground("#7C3AED").setFontColor("#FFFFFF").setFontWeight("bold");
  lb.setFrozenRows(1);

  if (out.length > 0) {
    lb.getRange(2, 1, out.length, headersOut.length).setValues(out);
  }

  var widths = [190, 90, 260, 130, 110, 90, 120, 110, 320];
  for (var w = 0; w < widths.length; w++) lb.setColumnWidth(w + 1, widths[w]);

  if (lb.getFilter()) lb.getFilter().remove();
  lb.getRange(1, 1, Math.max(lb.getLastRow(), 1), headersOut.length).createFilter();

  SpreadsheetApp.getUi().alert("Brand Leaderboard rebuilt: " + out.length
    + " brands across " + tabsRead + " Raw tab(s).");
}
