// Sponsorprint for YouTube: content script.
// Puts one small button on YouTube channel and video pages. On every page it only asks
// Sponsorprint "is there a print for this channel?" (a database lookup, no YouTube quota).
// A scan starts only when the button is clicked.
(() => {
  if (window.__sponsorprintYt) return;
  window.__sponsorprintYt = true;

  const POLL_MS = 4000;
  const POLL_MAX_MS = 4 * 60 * 1000;
  const CACHE_MS = 5 * 60 * 1000;
  const send = (m) => chrome.runtime.sendMessage(m).catch((e) => ({ ok: false, status: 0, error: String(e?.message || e) }));

  // ---------------------------------------------------------------- channel on this page
  const clean = (s) => { try { s = decodeURIComponent(s); } catch { /* keep */ } return String(s || "").replace(/^@/, "").replace(/[/?#].*$/, "").trim(); };
  const refFromHref = (href) => {
    const p = String(href || "").replace(/^https?:\/\/[^/]+/, "");
    let m = p.match(/^\/@([^/?#]+)/); if (m) return clean(m[1]);
    m = p.match(/^\/channel\/(UC[A-Za-z0-9_-]{20,})/); if (m) return m[1];
    return null;
  };

  function detect() {
    const path = location.pathname;
    const direct = refFromHref(path);
    if (direct) return { ref: direct, name: textOf("yt-page-header-renderer h1, ytd-c4-tabbed-header-renderer #channel-name #text, #channel-name #text") };
    if (/^\/(c|user)\/[^/]+/.test(path)) {
      // legacy channel URLs: read the @handle YouTube prints in the header
      const header = document.querySelector("yt-page-header-renderer, ytd-c4-tabbed-header-renderer");
      const m = header?.textContent?.match(/@[A-Za-z0-9._-]{3,30}/);
      if (m) return { ref: clean(m[0]), name: textOf("yt-page-header-renderer h1") };
      const canon = refFromHref(document.querySelector('link[rel="canonical"]')?.href);
      return canon ? { ref: canon, name: null } : null;
    }
    if (path === "/watch" || path.startsWith("/live/")) {
      const a = document.querySelector('ytd-watch-metadata ytd-video-owner-renderer a[href^="/@"], ytd-watch-metadata ytd-video-owner-renderer a[href^="/channel/"], #owner ytd-video-owner-renderer a[href^="/@"], #owner ytd-video-owner-renderer a[href^="/channel/"]');
      const ref = refFromHref(a?.getAttribute("href"));
      return ref ? { ref, name: textOf("ytd-watch-metadata ytd-video-owner-renderer #channel-name a, #owner #channel-name a") } : null;
    }
    if (path.startsWith("/shorts/")) {
      const a = document.querySelector('ytd-reel-video-renderer[is-active] a[href^="/@"], ytd-reel-video-renderer[is-active] a[href^="/channel/"], ytd-shorts a[href^="/@"]');
      const ref = refFromHref(a?.getAttribute("href"));
      return ref ? { ref, name: (a?.textContent || "").trim().replace(/^@/, "") || null } : null;
    }
    return null;
  }
  function textOf(sel) { const t = document.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim(); return t || null; }

  // ---------------------------------------------------------------- state
  let current = null;        // { ref, name }
  let state = { kind: "hidden" };   // hidden | disconnected | loading | none | ready | printing | error
  let data = null;           // last /api/ext/print payload for current.ref
  let open = false;
  let pollTimer = null;
  let token = 0;             // bumps on every navigation so stale replies are ignored
  const cache = new Map();   // ref(lower) -> { at, data }

  // ---------------------------------------------------------------- ui (shadow DOM, nothing injected into YouTube's own markup)
  const host = document.createElement("div");
  host.id = "sponsorprint-yt";
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;display:none";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
    .wrap{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
    .pill{display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;border-radius:999px;padding:10px 16px 10px 12px;background:#0b0d12;color:#fff;font-size:13px;font-weight:600;letter-spacing:-.01em;box-shadow:0 6px 22px rgba(11,13,18,.28);transition:transform .12s ease,background .12s ease}
    .pill:hover{transform:translateY(-1px);background:#161a22}
    .pill:disabled{cursor:default;opacity:.92;transform:none}
    .dot{width:8px;height:8px;border-radius:50%;background:#5b6472;flex:0 0 auto}
    .dot.ok{background:#2fd08a}.dot.old{background:#f0b23c}.dot.go{background:#2f5bff;animation:pulse 1s ease-in-out infinite}.dot.bad{background:#ef5a50}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .sub{font-weight:500;color:#aab2bf}
    .panel{width:380px;max-width:calc(100vw - 40px);max-height:min(560px,calc(100vh - 110px));display:flex;flex-direction:column;background:#fff;color:#0b0d12;border:1px solid #e4e6ea;border-radius:14px;box-shadow:0 18px 50px rgba(11,13,18,.28);overflow:hidden}
    .head{padding:14px 16px 12px;border-bottom:1px dashed #cfd3d9}
    .eyebrow{font:10px/1 "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#5b6472;display:flex;justify-content:space-between;align-items:center}
    .x{border:0;background:none;cursor:pointer;color:#5b6472;font-size:16px;line-height:1;padding:2px 4px}
    .name{font-size:16px;font-weight:650;letter-spacing:-.02em;margin-top:8px}
    .meta{font-size:12px;color:#5b6472;margin-top:2px}
    .actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
    .btn{font:500 11.5px "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;padding:6px 10px;border:1px solid #cfd3d9;border-radius:999px;background:#fff;color:#0b0d12;cursor:pointer;text-decoration:none}
    .btn:hover{border-color:#0b0d12}
    .btn.primary{background:#2f5bff;border-color:#2f5bff;color:#fff}
    .list{overflow:auto;padding:4px 0}
    .row{padding:10px 16px;border-bottom:1px solid #f1f2f4}
    .row:last-child{border-bottom:0}
    .line{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
    .brand{font-size:13.5px;font-weight:600;color:#0b0d12;text-decoration:none}
    a.brand:hover{color:#2f5bff}
    .when{font:11px "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;color:#5b6472;white-space:nowrap}
    .tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;align-items:center}
    .tag{font:10px "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.06em;padding:2px 6px;border-radius:4px;background:#f1f2f4;color:#5b6472}
    .tag.hi{background:#e7f7ef;color:#12854f}.tag.rep{background:#e9eeff;color:#2f5bff}
    .ev{font-size:11.5px;color:#2f5bff;text-decoration:none;margin-left:auto;white-space:nowrap}
    .empty{padding:26px 16px;text-align:center;color:#5b6472;font-size:13px;line-height:1.5}
    .foot{padding:9px 16px;border-top:1px solid #f1f2f4;font-size:11px;color:#5b6472}
  `;
  const wrap = el("div", "wrap");
  const panel = el("div", "panel"); panel.style.display = "none";
  const pill = el("button", "pill"); pill.type = "button";
  wrap.append(panel, pill);
  root.append(style, wrap);
  pill.addEventListener("click", onPill);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) { open = false; render(); } });

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function link(cls, text, href) { const a = el("a", cls, text); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }
  const safeUrl = (u) => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };
  const fmtNum = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n || 0));
  const fmtDay = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
  const ago = (iso) => { const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); if (!isFinite(days)) return ""; if (days < 1) return "today"; if (days < 31) return `${days}d ago`; if (days < 365) return `${Math.floor(days / 30)}mo ago`; return `${Math.floor(days / 365)}y ago`; };

  function render() {
    if (state.kind === "hidden" || !document.body) { host.style.display = "none"; return; }
    if (!host.isConnected) document.body.appendChild(host);
    host.style.display = "block";

    // pill
    pill.replaceChildren();
    const dot = el("span", "dot");
    let label = "Pull the print"; let sub = null; pill.disabled = false;
    if (state.kind === "disconnected") { label = "Connect Sponsorprint"; dot.className = "dot bad"; }
    else if (state.kind === "loading") { label = "Sponsorprint"; sub = "checking"; }
    else if (state.kind === "printing") { label = "Printing"; sub = state.note || "reading their videos"; dot.className = "dot go"; }
    else if (state.kind === "error") { label = "Sponsorprint"; sub = "try again"; dot.className = "dot bad"; }
    else if (state.kind === "ready" && data) {
      const n = data.brand_count || 0;
      label = "Print ready"; sub = `${n} brand${n === 1 ? "" : "s"}${data.fresh ? "" : ` · ${ago(data.creator?.last_scanned_at)}`}`;
      dot.className = data.fresh ? "dot ok" : "dot old";
    }
    pill.append(dot, el("span", null, label));
    if (sub) pill.append(el("span", "sub", sub));
    pill.title = state.kind === "ready" ? "Sponsorprint already has this creator. Click to see the brands." : state.kind === "none" ? "Scan this channel for brand partnerships" : "";

    // panel
    panel.style.display = open ? "flex" : "none";
    if (!open) return;
    panel.replaceChildren();
    const head = el("div", "head");
    const eyebrow = el("div", "eyebrow"); eyebrow.append(el("span", null, "Sponsorprint"));
    const x = el("button", "x", "×"); x.type = "button"; x.title = "Close"; x.addEventListener("click", () => { open = false; render(); });
    eyebrow.append(x); head.append(eyebrow);
    const c = data?.creator;
    head.append(el("div", "name", c?.name || current?.name || `@${current?.ref || ""}`));
    panel.append(head);

    if (state.kind === "printing") {
      panel.append(el("div", "empty", "Printing. Sponsorprint is reading their recent videos for sponsors. This usually takes under a minute, and you can keep browsing."));
      return;
    }
    if (state.kind === "error") {
      panel.append(el("div", "empty", state.message || "Something went wrong. Try again in a minute."));
      const a = el("div", "actions"); a.style.padding = "0 16px 14px"; a.style.justifyContent = "center";
      const retry = el("button", "btn primary", "Try again"); retry.type = "button"; retry.addEventListener("click", () => pull(false)); a.append(retry); panel.append(a);
      return;
    }
    if (!data?.printed) { panel.append(el("div", "empty", "No print yet. Click the button to pull one.")); return; }

    const bits = [];
    if (c?.followers) bits.push(`${fmtNum(c.followers)} subscribers`);
    if (c?.category && c.category !== "Other") bits.push(c.category);
    if (c?.last_scanned_at) bits.push(`printed ${ago(c.last_scanned_at)}`);
    head.append(el("div", "meta", bits.join(" · ")));
    const actions = el("div", "actions");
    if (data.print_url) actions.append(link("btn primary", "Open full print ↗", data.print_url));
    const copy = el("button", "btn", "Copy for Sheets"); copy.type = "button";
    copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(tsv()); copy.textContent = "Copied"; } catch { copy.textContent = "Copy blocked"; } setTimeout(() => { copy.textContent = "Copy for Sheets"; }, 1600); });
    if (data.brands?.length) actions.append(copy);
    const re = el("button", "btn", "↻ Re-print"); re.type = "button"; re.title = "Scan again for new deals"; re.addEventListener("click", () => pull(true));
    actions.append(re);
    head.append(actions);

    const brands = data.brands || [];
    if (!brands.length) { panel.append(el("div", "empty", "No deals found on this channel's recent videos.")); }
    else {
      const list = el("div", "list");
      for (const b of brands) {
        const row = el("div", "row");
        const line = el("div", "line");
        const site = b.website ? safeUrl(b.website) : null;
        line.append(site ? link("brand", b.brand, site) : el("span", "brand", b.brand));
        line.append(el("span", "when", fmtDay(b.last_seen)));
        row.append(line);
        const tags = el("div", "tags");
        if (b.category && b.category !== "Other") tags.append(el("span", "tag", b.category));
        tags.append(el("span", "tag", `${b.deals} deal${b.deals === 1 ? "" : "s"}`));
        if (b.type_label) tags.append(el("span", b.type === "Sponsored" ? "tag hi" : "tag", b.type_label));
        else if (b.confidence) tags.append(el("span", b.confidence === "High" ? "tag hi" : "tag", b.confidence));
        if (b.repeat_partner) tags.append(el("span", "tag rep", "repeat partner"));
        const ev = b.evidence_url ? safeUrl(b.evidence_url) : null;
        if (ev) { const a = link("ev", "see the video", ev); if (b.evidence_title) a.title = b.evidence_title; tags.append(a); }
        row.append(tags);
        list.append(row);
      }
      panel.append(list);
    }
    panel.append(el("div", "foot", "Saved to Sponsorprint and your sheet feed."));
  }

  function tsv() {
    const c = data?.creator || {};
    const t = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
    const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
    const head = ["Creator", "Handle", "Subscribers", "Brand", "Type", "Brand category", "Deals", "Confidence", "First deal", "Last deal", "Repeat partner", "Evidence video", "Evidence link", "Brand website", "Print"];
    const rows = (data?.brands || []).map((b) => [c.name, `@${c.handle}`, c.followers ?? "", b.brand, b.type_label || "", b.category || "", b.deals, b.confidence || "", day(b.first_seen), day(b.last_seen), b.repeat_partner ? "Yes" : "", b.evidence_title || "", b.evidence_url || "", b.website || "", data.print_url || ""]);
    return [head, ...rows].map((r) => r.map(t).join("\t")).join("\n");
  }

  // ---------------------------------------------------------------- data flow
  function stopPoll() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }
  function apply(r, mine) {
    if (mine !== token) return false;
    if (r.status === 401) { state = { kind: "disconnected" }; data = null; render(); return false; }
    if (!r.ok) { state = { kind: "error", message: r.error }; render(); return false; }
    data = r;
    return true;
  }

  // Runs on every channel or video page. Database lookup only.
  async function check() {
    const mine = token; const ref = current.ref;
    const hit = cache.get(ref.toLowerCase());
    if (hit && Date.now() - hit.at < CACHE_MS) { data = hit.data; state = { kind: data.scanning ? "printing" : data.printed ? "ready" : "none" }; render(); if (data.scanning) poll(ref, null, Date.now()); return; }
    state = { kind: "loading" }; data = null; render();
    const r = await send({ type: "check", handle: ref });
    if (!apply(r, mine)) return;
    cache.set(ref.toLowerCase(), { at: Date.now(), data: r });
    if (r.scanning) { state = { kind: "printing" }; render(); poll(ref, null, Date.now()); return; }
    state = { kind: r.printed ? "ready" : "none" }; render();
  }

  // The click. This is the only place a scan can start.
  async function pull(force) {
    const mine = token; const ref = current.ref;
    stopPoll();
    state = { kind: "printing", note: "starting" }; open = true; render();
    const r = await send({ type: "pull", handle: ref, force });
    if (mine !== token) return;
    if (r.status === 401) { state = { kind: "disconnected" }; open = false; render(); return; }
    if (!r.ok) { state = { kind: "error", message: r.error }; render(); return; }
    cache.delete(ref.toLowerCase());
    const canonical = r.handle || ref;
    if (r.cached) { await load(canonical, mine); return; }
    state = { kind: "printing" }; render();
    poll(canonical, r.jobId, Date.now());
  }

  async function load(ref, mine) {
    const r = await send({ type: "check", handle: ref });
    if (!apply(r, mine)) return;
    cache.set(current.ref.toLowerCase(), { at: Date.now(), data: r });
    state = { kind: r.printed ? "ready" : "none" }; render();
  }

  function poll(ref, jobId, started) {
    const mine = token;
    stopPoll();
    pollTimer = setTimeout(async () => {
      if (mine !== token) return;
      const r = await send({ type: "check", handle: ref, job: jobId || undefined });
      if (mine !== token) return;
      if (r.status === 401) { state = { kind: "disconnected" }; render(); return; }
      if (r.ok && r.failed) { state = { kind: "error", message: r.failed }; render(); return; }
      if (r.ok && !r.scanning && r.printed) { data = r; cache.set(current.ref.toLowerCase(), { at: Date.now(), data: r }); state = { kind: "ready" }; render(); return; }
      if (Date.now() - started > POLL_MAX_MS) { state = { kind: "error", message: "Still printing. It is taking longer than usual, so it will be in Sponsorprint and your sheet when it finishes." }; render(); return; }
      poll(ref, jobId, started);
    }, POLL_MS);
  }

  async function onPill() {
    if (state.kind === "disconnected") { send({ type: "open" }); return; }
    if (state.kind === "loading") return;
    if (state.kind === "printing" || state.kind === "error") { open = !open; render(); return; }
    if (state.kind === "ready" && data && !data.locked) { open = !open; render(); return; }
    // no print yet, or one this account has not opened (opening a cached print is free)
    pull(false);
  }

  // ---------------------------------------------------------------- navigation (YouTube is a single-page app)
  async function update() {
    const found = detect();
    if (!found) { if (current) { current = null; token++; stopPoll(); open = false; data = null; state = { kind: "hidden" }; render(); } return; }
    if (current && current.ref.toLowerCase() === found.ref.toLowerCase()) { if (found.name && !current.name) { current.name = found.name; if (open) render(); } return; }
    current = found; token++; stopPoll(); open = false; data = null;
    const s = await send({ type: "status", live: false });
    if (!s?.connected) { state = { kind: "disconnected" }; render(); return; }
    check();
  }

  let settle = [];
  function onNavigate() {
    settle.forEach(clearTimeout);
    // the owner link on a watch page arrives (and changes) a beat after the URL does
    settle = [0, 700, 1600, 3200, 6000].map((ms) => setTimeout(update, ms));
  }
  window.addEventListener("yt-navigate-finish", onNavigate);
  window.addEventListener("popstate", onNavigate);
  let lastUrl = location.href;
  setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; onNavigate(); } }, 1200);
  chrome.storage?.onChanged?.addListener((changes) => { if (changes.spKey) { cache.clear(); const keep = current; current = null; if (keep) update(); } });
  onNavigate();
})();
