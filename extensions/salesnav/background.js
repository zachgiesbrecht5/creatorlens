// Sponsorprint Sales Nav: background service worker.
// Owns the Sponsorprint key and every network call, so LinkedIn pages never see it.
// Failed syncs go to an outbox and retry, so a flaky connection never loses a page.

const API = "https://sponsorprint.com/api/salesnav/ingest";
const OUTBOX_MAX = 300;

const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

async function call(method, body) {
  const { spKey } = await get("spKey");
  if (!spKey) return { ok: false, status: 401, error: "Not connected to Sponsorprint" };
  try {
    const r = await fetch(API, { method, headers: { authorization: `Bearer ${spKey}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ...j, ok: r.ok && j.ok !== false, status: r.status, error: j.error || (r.ok ? null : `Sponsorprint returned ${r.status}`) };
  } catch (e) {
    return { ok: false, status: 0, error: "Can't reach sponsorprint.com", network: true };
  }
}

async function ping() {
  const r = await call("GET");
  if (r.ok) await set({ spEmail: r.email || null, spToday: r.today || null, spCheckedAt: Date.now() });
  return r;
}

async function flushOutbox() {
  const { outbox = [] } = await get("outbox");
  if (!outbox.length) return { sent: 0, left: 0 };
  const left = [];
  let sent = 0;
  for (const item of outbox) {
    const r = await call("POST", item);
    if (r.ok) sent++;
    else if (r.network || r.status >= 500) left.push(item);
    // 4xx (bad key, not admin) is dropped from the retry loop but kept in the local run for Copy for Sheets
  }
  await set({ outbox: left });
  return { sent, left: left.length };
}

async function sync(payload) {
  await flushOutbox();
  const r = await call("POST", payload);
  if (!r.ok && (r.network || r.status >= 500)) {
    const { outbox = [] } = await get("outbox");
    outbox.push(payload);
    await set({ outbox: outbox.slice(-OUTBOX_MAX) });
    return { ...r, queued: true };
  }
  return r;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg?.type === "status") {
      const { spKey, spEmail, outbox = [] } = await get(["spKey", "spEmail", "outbox"]);
      const live = msg.live && spKey ? await ping() : null;
      return { connected: !!spKey && (live ? live.ok : true), email: live?.email || spEmail || null, today: live?.today || null, outbox: outbox.length, error: live && !live.ok ? live.error : null, version: chrome.runtime.getManifest().version };
    }
    if (msg?.type === "setKey") {
      const key = String(msg.key || "").trim();
      if (!/^sp_[A-Za-z0-9_-]{16,}$/.test(key)) return { ok: false, error: "That doesn't look like a Sponsorprint key (starts with sp_)" };
      const { spKey: old } = await get("spKey");
      await set({ spKey: key });
      const r = await ping();
      if (!r.ok) { if (old) await set({ spKey: old }); else await chrome.storage.local.remove("spKey"); return { ok: false, error: r.error }; }
      await flushOutbox();
      return { ok: true, email: r.email };
    }
    if (msg?.type === "disconnect") { await chrome.storage.local.remove(["spKey", "spEmail", "spToday"]); return { ok: true }; }
    if (msg?.type === "sync") return sync(msg.payload);
    if (msg?.type === "flush") return flushOutbox();
    return { ok: false, error: "unknown message" };
  })().then(reply, (e) => reply({ ok: false, error: String(e?.message || e) }));
  return true;
});

chrome.alarms.create("flush", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "flush") flushOutbox(); });
