// Sponsorprint Sales Nav: content script for www.linkedin.com/sales/*
// Reads People and Account searches (and lead / account lists) one page at a time,
// at a human pace, and syncs each page to Sponsorprint's admin Sales Nav tab.
// Safety: reads result pages only (never opens profiles, connects or messages),
// random 6-12s pauses, a longer break every 5 pages, a daily cap, and a hard stop
// the moment LinkedIn shows a security check, limit or restriction notice.
(() => {
  if (window.__spSalesNav) return;
  window.__spSalesNav = true;

  const VERSION = chrome.runtime.getManifest().version;
  const DEFAULTS = { dailyCap: 300, minDelay: 6, maxDelay: 12, maxPages: 10, breakEvery: 5 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (a, b) => a + Math.random() * (b - a);
  const today = () => new Date().toLocaleDateString("en-CA");
  const txt = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : "");
  const $ = (root, sel) => root.querySelector(sel);

  // ---------- page understanding ----------
  function mode() {
    const p = location.pathname;
    if (p.startsWith("/sales/search/people")) return { kind: "people", source: "search" };
    if (p.startsWith("/sales/search/company")) return { kind: "accounts", source: "search" };
    if (/^\/sales\/lists\/people\/\d/.test(p)) return { kind: "people", source: "list" };
    if (/^\/sales\/lists\/company\/\d/.test(p)) return { kind: "accounts", source: "list" };
    return null;
  }

  function resultRows(kind) {
    const link = kind === "people" ? 'a[href*="/sales/lead/"]' : 'a[href*="/sales/company/"]';
    return [...document.querySelectorAll("li.artdeco-list__item, table tbody tr")].filter((el) => el.querySelector(link));
  }

  const leadId = (el) => { const a = $(el, 'a[href*="/sales/lead/"]'); const m = a && a.getAttribute("href").match(/\/sales\/lead\/([^,?/]+)/); return m ? m[1] : null; };
  const companyId = (el) => { const a = $(el, 'a[data-anonymize="company-name"][href*="/sales/company/"]') || $(el, 'a[href*="/sales/company/"]'); const m = a && a.getAttribute("href").match(/\/sales\/company\/(\d+)/); return m ? m[1] : null; };
  const imgSrc = (img) => { const s = img && (img.currentSrc || img.src); return s && /^https:/.test(s) && !/ghost|data:image/i.test(s) ? s : null; };

  function parsePerson(el) {
    const lead_id = leadId(el);
    const name = txt($(el, '[data-anonymize="person-name"]'));
    if (!lead_id || !name) return null;
    const jt = txt($(el, '[data-anonymize="job-title"]'));
    const tenure = /\bin (role|company)\b/i.test(jt) ? jt : null;
    const title = txt($(el, '[data-anonymize="title"]')) || (tenure ? "" : jt);
    const about = txt($(el, '[data-anonymize="person-blurb"]')).replace(/\s*(…|\.\.\.)?\s*(Show more|See more)$/i, "");
    return {
      lead_id, name, title: title || null,
      company: txt($(el, '[data-anonymize="company-name"]')) || null,
      company_id: companyId(el),
      location: txt($(el, '[data-anonymize="location"]')) || null,
      degree: (txt($(el, ".artdeco-entity-lockup__degree")).match(/\d(st|nd|rd|th)/) || [null])[0],
      tenure, about: about || null,
      photo: imgSrc($(el, 'img[data-anonymize="headshot-photo"]')),
    };
  }

  function parseAccount(el) {
    const company_id = companyId(el);
    const name = txt($(el, '[data-anonymize="company-name"]'));
    if (!company_id || !name) return null;
    const all = el.innerText || "";
    const signals = [...el.querySelectorAll("span.nowrap-ellipsis, [class*='signal'] span, [class*='spotlight'] span")]
      .map(txt).filter((s) => s && s.length < 80 && s !== name && !/^(save|saved|view|more)$/i.test(s));
    if (/hiring on linkedin|actively hiring|is hiring|open jobs/i.test(all)) signals.push("Hiring on LinkedIn");
    const growth = all.match(/(\d+%\s*(?:headcount\s*)?growth[^\n]*)/i);
    if (growth) signals.push(growth[1].trim().slice(0, 60));
    const logoImg = $(el, 'img[data-anonymize="company-logo"]') || $(el, '[data-anonymize="company-logo"] img');
    return {
      company_id, name,
      industry: txt($(el, '[data-anonymize="industry"]')) || null,
      employees: txt($(el, '[data-anonymize="company-size"]')).replace(/\s*on LinkedIn$/i, "") || null,
      location: txt($(el, '[data-anonymize="location"]')) || null,
      about: txt($(el, '[data-anonymize="person-blurb"]')).replace(/\s*(…|\.\.\.)?\s*(Show more|See more)$/i, "") || null,
      signals: [...new Set(signals)].slice(0, 8),
      hiring: /hiring/i.test(signals.join(" ")),
      logo: imgSrc(logoImg),
      text: all.replace(/\s+/g, " ").slice(0, 1200),
    };
  }

  const pageKey = (kind) => { const r = resultRows(kind)[0]; return r ? (kind === "people" ? leadId(r) : companyId(r)) : null; };

  function pageNumber() {
    const b = document.querySelector(".artdeco-pagination__indicator--number.active button, .artdeco-pagination__indicator--number.selected button, button[aria-current='true']");
    return b ? Number(txt(b)) || null : null;
  }

  function nextButton() {
    const b = document.querySelector('button[aria-label="Next"], button.artdeco-pagination__button--next');
    return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
  }

  // LinkedIn's own warnings. Looks only at page chrome (dialogs, toasts, banners, title, URL),
  // not at result cards, so a blurb mentioning "security" can't stop a run.
  function blocker() {
    const p = location.pathname;
    if (/^\/(checkpoint|authwall|uas\/login|login)/.test(p)) return "LinkedIn asked for a security check";
    const chrome_ = [...document.querySelectorAll("[role='alertdialog'], [role='dialog'], .artdeco-modal, .artdeco-toast-item, [role='alert'], .global-alert, .banner")].map(txt).join(" | ") + " | " + document.title;
    const m = chrome_.match(/(unusual activity|security (check|verification)|verify (it'?s|that it'?s) you|too many (requests|searches)|reached (the|your) (weekly|monthly|daily)?\s*(commercial use |search )?limit|temporarily (restricted|limited)|account (has been |is )?restricted|try again later)/i);
    return m ? `LinkedIn showed: "${m[0]}"` : null;
  }

  function defaultLabel(m) {
    if (m.source === "list") return ("List: " + (txt(document.querySelector("h1")) || document.title.split(" | ")[0] || "Sales Nav list")).slice(0, 120);
    const q = decodeURIComponent(decodeURIComponent(new URLSearchParams(location.search).get("query") || ""));
    const kw = (q.match(/keywords:([^,)]+)/) || [])[1];
    const pills = [...document.querySelectorAll("[data-x-search-filter] li, .search-filter__selected-entity, ._selected-filter-pill, [class*='selected-filter'] button")].map(txt).filter(Boolean).map((s) => s.replace(/^(Remove|Exclude)\s+/i, "").replace(/\s+(filter|Remove)$/i, "")).slice(0, 4);
    const parts = [kw ? `"${kw}"` : null, ...pills].filter(Boolean);
    return (parts.join(" · ") || `${m.kind === "people" ? "People" : "Accounts"} search ${today()}`).slice(0, 140);
  }

  // Bring every card into view so LinkedIn renders it. Sales Nav only fills a card
  // (name, links) once it has been near the viewport, so walk every list slot, not
  // just the ones that already have content, then wait for the count to settle.
  const slots = () => [...document.querySelectorAll("li.artdeco-list__item, table tbody tr")];
  async function hydrate(kind) {
    const nameSel = kind === "people" ? '[data-anonymize="person-name"]' : '[data-anonymize="company-name"]';
    const filled = () => slots().filter((r) => r.querySelector(nameSel)).length;
    for (let pass = 0; pass < 3; pass++) {
      for (const r of slots()) {
        if (r.querySelector(nameSel)) continue;
        r.scrollIntoView({ block: "center" });
        await sleep(jitter(260, 480));
        if (state.stop) return;
      }
      let last = -1;
      for (let i = 0; i < 8; i++) { const n = filled(); if (n === last) break; last = n; await sleep(400); }
      if (filled() >= slots().length) break;
    }
    // a gentle scroll back up, like someone skimming the page
    window.scrollBy({ top: -300, behavior: "smooth" });
    await sleep(300);
  }

  // Wait until the result list stops growing (or is a full page of 25).
  async function settled(kind) {
    let last = -1, same = 0;
    for (let i = 0; i < 30 && !state.stop; i++) {
      const n = resultRows(kind).length;
      if (n >= 25) return n;
      same = n === last ? same + 1 : 0; last = n;
      if (n > 0 && same >= 3) return n;
      await sleep(400);
    }
    return resultRows(kind).length;
  }

  async function waitFor(fn, ms = 20000, step = 400) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); if (state.stop) return null; }
    return null;
  }

  // ---------- state ----------
  const state = { running: false, stop: false, runId: null, pages: 0, rows: 0, fresh: 0, synced: 0, queued: 0, status: "", err: false, settings: { ...DEFAULTS }, todayCount: 0, mode: null };
  const seen = new Set(); // ids parsed this run, so a page that didn't change is caught
  let lastRun = { kind: null, label: "", rows: [] };

  async function loadSettings() {
    const s = await chrome.storage.local.get(["settings", "counts", "lastRun"]);
    state.settings = { ...DEFAULTS, ...(s.settings || {}) };
    state.todayCount = (s.counts || {})[today()] || 0;
    if (s.lastRun) lastRun = s.lastRun;
  }
  async function addToday(n) {
    const { counts = {} } = await chrome.storage.local.get("counts");
    const d = today();
    const next = { [d]: (counts[d] || 0) + n };
    await chrome.storage.local.set({ counts: next });
    state.todayCount = next[d];
  }
  const saveLastRun = () => chrome.storage.local.set({ lastRun: { ...lastRun, rows: lastRun.rows.slice(-2500) } });

  // ---------- core ----------
  async function grabPage(m, label, stopReason) {
    await hydrate(m.kind);
    const parsed = resultRows(m.kind).map(m.kind === "people" ? parsePerson : parseAccount).filter(Boolean);
    const ids = parsed.map((r) => r.lead_id || r.company_id);
    const fresh = parsed.filter((r) => !seen.has(r.lead_id || r.company_id));
    ids.forEach((i) => seen.add(i));
    if (lastRun.kind !== m.kind || lastRun.label !== label) lastRun = { kind: m.kind, label, rows: [] };
    lastRun.rows.push(...fresh);
    saveLastRun();
    state.pages++; state.rows += fresh.length;
    await addToday(fresh.length);
    if (!fresh.length) return { parsed: parsed.length, fresh: 0 };
    const r = await chrome.runtime.sendMessage({ type: "sync", payload: { kind: m.kind, label, run_id: state.runId, page: pageNumber(), rows: fresh, stop_reason: stopReason || null } }).catch((e) => ({ ok: false, error: String(e) }));
    if (r?.run_id) state.runId = r.run_id;
    if (r?.ok) { state.synced += fresh.length; state.fresh += r.new || 0; }
    else if (r?.queued) state.queued += fresh.length;
    else if (r && (r.status === 401 || r.status === 403)) throw new Error(r.error || "Not connected to Sponsorprint");
    return { parsed: parsed.length, fresh: fresh.length, sync: r };
  }

  async function run(onePage) {
    const m = mode();
    if (!m || state.running) return;
    const status = await chrome.runtime.sendMessage({ type: "status", live: false }).catch(() => null);
    if (!status?.connected) { say("Connect Sponsorprint first: open the extension's popup, or sponsorprint.com/salesnav and press Connect.", true); return; }
    await loadSettings();
    const label = (ui.label.value || defaultLabel(m)).trim();
    const maxPages = onePage ? 1 : Math.max(1, Number(ui.pages.value) || state.settings.maxPages);
    Object.assign(state, { running: true, stop: false, runId: null, pages: 0, rows: 0, fresh: 0, synced: 0, queued: 0, err: false });
    seen.clear();
    render();
    let reason = "";
    try {
      for (;;) {
        const b = blocker(); if (b) { reason = b; break; }
        if (state.todayCount >= state.settings.dailyCap) { reason = `Daily cap reached (${state.settings.dailyCap}). Change it in the extension popup.`; break; }
        say(`Reading page ${pageNumber() || state.pages + 1}…`);
        const ready = await waitFor(() => resultRows(m.kind).length > 0, 15000);
        if (!ready) { reason = blocker() || "No results on this page"; break; }
        await settled(m.kind);
        const before = pageKey(m.kind);
        const g = await grabPage(m, label);
        if (state.stop) { reason = "Stopped"; break; }
        if (g.parsed && !g.fresh && state.pages > 1) { reason = "LinkedIn showed the same page twice; stopped to be safe"; break; }
        if (state.pages >= maxPages) { reason = onePage ? "Page grabbed" : `Reached ${maxPages} pages for this run`; break; }
        const next = nextButton();
        if (!next) { reason = "Last page reached"; break; }
        const breather = state.pages % state.settings.breakEvery === 0;
        const wait = breather ? jitter(35, 70) : jitter(state.settings.minDelay, state.settings.maxDelay);
        for (let s = Math.round(wait); s > 0; s--) { if (state.stop) break; say(`${breather ? "Taking a short break" : "Pausing like a person"}… next page in ${s}s`); await sleep(1000); }
        if (state.stop) { reason = "Stopped"; break; }
        next.scrollIntoView({ block: "center", behavior: "smooth" }); await sleep(jitter(500, 1100));
        next.click();
        const moved = await waitFor(() => { const k = pageKey(m.kind); return k && k !== before; }, 25000);
        if (!moved) { reason = blocker() || "The next page didn't load; stopped to be safe"; break; }
        await sleep(jitter(1200, 2200));
      }
    } catch (e) {
      reason = String(e.message || e); state.err = true;
    }
    state.running = false;
    if (state.runId) chrome.runtime.sendMessage({ type: "sync", payload: { kind: m.kind, label, run_id: state.runId, rows: [], stop_reason: reason } }).catch(() => {});
    const hard = /LinkedIn|security|limit|restricted/i.test(reason);
    say(`${reason}. ${state.rows} ${m.kind === "people" ? "people" : "accounts"} this run, ${state.fresh} new in Sponsorprint${state.queued ? `, ${state.queued} waiting to sync` : ""}.${hard ? " Give LinkedIn a rest before the next run." : ""}`, hard || state.err);
    render();
  }

  async function copySheets() {
    await loadSettings();
    const rows = lastRun.rows || [];
    if (!rows.length) return say("Nothing scraped yet in this browser. Run a page first.", true);
    const c = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
    let tsv;
    if (lastRun.kind === "people") {
      tsv = ["Full Name", "Title", "Company", "Location", "Connection", "Tenure", "Sales Nav URL", "Company URL", "Search"].join("\t") + "\n" +
        rows.map((r) => [r.name, r.title, r.company, r.location, r.degree, r.tenure, `https://www.linkedin.com/sales/lead/${r.lead_id}`, r.company_id ? `https://www.linkedin.com/sales/company/${r.company_id}` : "", lastRun.label].map(c).join("\t")).join("\n");
    } else {
      tsv = ["Company", "Industry", "Employees", "Location", "Hiring", "Signals", "About", "Sales Nav URL", "Search"].join("\t") + "\n" +
        rows.map((r) => [r.name, r.industry, r.employees, r.location, r.hiring ? "yes" : "", (r.signals || []).join("; "), r.about, `https://www.linkedin.com/sales/company/${r.company_id}`, lastRun.label].map(c).join("\t")).join("\n");
    }
    try { await navigator.clipboard.writeText(tsv); say(`Copied ${rows.length} rows from "${lastRun.label}". Paste into Google Sheets.`); }
    catch { say("Chrome blocked the clipboard. Click the page once and try again.", true); }
  }

  // ---------- panel ----------
  const host = document.createElement("div");
  host.id = "sp-salesnav-host";
  host.style.cssText = "position:fixed;z-index:2147483646;top:84px;right:20px;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host{all:initial}
    .p{width:300px;font:13px/1.4 Inter,-apple-system,system-ui,sans-serif;color:#0b0d12;background:#fff;border:1px solid #e4e6ea;border-radius:12px;box-shadow:0 12px 32px -8px rgba(11,13,18,.22),0 0 0 1px rgba(11,13,18,.04);overflow:hidden}
    .h{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0b0d12;color:#fff;cursor:move;user-select:none}
    .h b{font-weight:600;letter-spacing:.1px}.h .m{margin-left:auto;font:500 10px/1 'JetBrains Mono',ui-monospace,monospace;padding:4px 6px;border-radius:6px;background:#2f5bff}
    .h button{all:unset;cursor:pointer;color:#8b93a1;padding:0 2px;font-size:15px}.h button:hover{color:#fff}
    .dot{width:8px;height:8px;border-radius:50%;background:#8b93a1}.dot.on{background:#12854f}.dot.run{background:#2f5bff;animation:pulse 1s infinite}
    @keyframes pulse{50%{opacity:.35}}
    .b{padding:12px;display:flex;flex-direction:column;gap:10px}
    .row{display:flex;gap:8px;align-items:center}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
    .s{background:#f1f2f4;border-radius:8px;padding:7px 8px}.s i{display:block;font:600 16px/1.1 'JetBrains Mono',ui-monospace,monospace;font-style:normal}.s span{font-size:10.5px;color:#5b6472}
    label{font-size:11px;color:#5b6472;display:block;margin-bottom:3px}
    input{all:unset;box-sizing:border-box;width:100%;border:1px solid #e4e6ea;border-radius:8px;padding:6px 8px;font-size:12.5px;background:#fff}
    input:focus{border-color:#2f5bff}
    .btn{all:unset;cursor:pointer;text-align:center;border-radius:8px;padding:8px 10px;font-weight:600;font-size:12.5px;flex:1}
    .go{background:#2f5bff;color:#fff}.go:hover{background:#1d3fd6}.stop{background:#c8362e;color:#fff}
    .gh{border:1px solid #e4e6ea;color:#0b0d12;font-weight:500}.gh:hover{border-color:#0b0d12}
    .btn[disabled]{opacity:.45;pointer-events:none}
    .st{font-size:12px;color:#5b6472;min-height:16px}.st.bad{color:#c8362e}
    .f{display:flex;justify-content:space-between;font-size:11px;color:#8b93a1}.f a{color:#2f5bff;text-decoration:none}
    .cap{height:4px;background:#f1f2f4;border-radius:4px;overflow:hidden}.cap div{height:100%;background:#2f5bff}
    .min .b{display:none}.min.p{width:auto}
  </style>
  <div class="p" id="p">
    <div class="h" id="h"><span class="dot" id="dot"></span><b>Sponsorprint</b><span class="m" id="mode">-</span><button id="min" title="Minimize">–</button></div>
    <div class="b">
      <div class="stats"><div class="s"><i id="sRows">0</i><span>this run</span></div><div class="s"><i id="sNew">0</i><span>new</span></div><div class="s"><i id="sPages">0</i><span>pages</span></div></div>
      <div><div class="f" style="margin-bottom:4px"><span>today</span><span id="capTxt">0 / 300</span></div><div class="cap"><div id="capBar" style="width:0"></div></div></div>
      <div><label>Label this run (shows in Sponsorprint)</label><input id="label" maxlength="140"></div>
      <div class="row"><div style="flex:1"><label>Pages this run</label><input id="pages" type="number" min="1" max="40"></div></div>
      <div class="row"><button class="btn go" id="go">▶ Start</button><button class="btn gh" id="one" title="Grab only the page you're on">This page</button></div>
      <div class="row"><button class="btn gh" id="copy">Copy for Sheets</button></div>
      <div class="st" id="st"></div>
      <div class="f"><span id="conn">checking…</span><a href="https://sponsorprint.com/salesnav" target="_blank" rel="noreferrer">Open in Sponsorprint ↗</a></div>
    </div>
  </div>`;
  const ui = Object.fromEntries(["p", "h", "dot", "mode", "min", "sRows", "sNew", "sPages", "capTxt", "capBar", "label", "pages", "go", "one", "copy", "st", "conn"].map((id) => [id, root.getElementById(id)]));

  function say(msg, bad) { state.status = msg; state.err = !!bad; render(); }
  function render() {
    const m = state.mode;
    ui.mode.textContent = m ? (m.kind === "people" ? "PEOPLE" : "ACCOUNTS") + (m.source === "list" ? " · LIST" : "") : "-";
    ui.dot.className = "dot " + (state.running ? "run" : state.connected ? "on" : "");
    ui.sRows.textContent = state.rows; ui.sNew.textContent = state.fresh; ui.sPages.textContent = state.pages;
    const cap = state.settings.dailyCap;
    ui.capTxt.textContent = `${state.todayCount} / ${cap}`;
    ui.capBar.style.width = Math.min(100, (state.todayCount / cap) * 100) + "%";
    ui.go.textContent = state.running ? "■ Stop" : "▶ Start";
    ui.go.className = "btn " + (state.running ? "stop" : "go");
    ui.one.disabled = state.running; ui.copy.disabled = state.running;
    ui.st.textContent = state.status; ui.st.className = "st" + (state.err ? " bad" : "");
  }

  ui.go.onclick = () => { if (state.running) { state.stop = true; say("Stopping after this step…"); } else run(false); };
  ui.one.onclick = () => run(true);
  ui.copy.onclick = copySheets;
  ui.min.onclick = () => { ui.p.classList.toggle("min"); ui.min.textContent = ui.p.classList.contains("min") ? "+" : "–"; chrome.storage.local.set({ panelMin: ui.p.classList.contains("min") }); };

  // drag by the header, remember position
  (() => {
    let sx, sy, ox, oy, drag = false;
    ui.h.addEventListener("mousedown", (e) => { if (e.target === ui.min) return; drag = true; sx = e.clientX; sy = e.clientY; const r = host.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault(); });
    window.addEventListener("mousemove", (e) => { if (!drag) return; const x = Math.max(0, Math.min(window.innerWidth - 120, ox + e.clientX - sx)); const y = Math.max(0, Math.min(window.innerHeight - 40, oy + e.clientY - sy)); host.style.left = x + "px"; host.style.top = y + "px"; host.style.right = "auto"; });
    window.addEventListener("mouseup", () => { if (!drag) return; drag = false; chrome.storage.local.set({ panelPos: { left: host.style.left, top: host.style.top } }); });
  })();

  async function refreshConn() {
    const s = await chrome.runtime.sendMessage({ type: "status", live: false }).catch(() => null);
    state.connected = !!s?.connected;
    ui.conn.textContent = s?.connected ? `● ${s.email || "connected"}${s.outbox ? ` · ${s.outbox} to sync` : ""}` : "○ not connected";
    render();
  }

  // SPA: Sales Nav changes URL without reloading. Show the panel only on supported pages.
  let lastPath = "";
  async function onRoute() {
    const m = mode();
    state.mode = m;
    if (!m) { host.remove(); return; }
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (location.pathname + location.search !== lastPath) {
      lastPath = location.pathname + location.search;
      if (!state.running) { await sleep(1200); ui.label.value = defaultLabel(m); }
    }
    render();
  }

  (async () => {
    await loadSettings();
    const { panelPos, panelMin } = await chrome.storage.local.get(["panelPos", "panelMin"]);
    if (panelPos?.left) { host.style.left = panelPos.left; host.style.top = panelPos.top; host.style.right = "auto"; }
    if (panelMin) { ui.p.classList.add("min"); ui.min.textContent = "+"; }
    ui.pages.value = state.settings.maxPages;
    await refreshConn();
    say(`v${VERSION} ready. Reads results pages only, with human pauses.`);
    onRoute();
    setInterval(onRoute, 1000);
    setInterval(refreshConn, 30000);
    chrome.storage.onChanged.addListener((c) => { if (c.spKey || c.outbox) refreshConn(); if (c.settings) loadSettings().then(() => { if (!state.running) ui.pages.value = state.settings.maxPages; render(); }); });
  })();
})();
