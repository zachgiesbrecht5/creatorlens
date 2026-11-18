// Sponsorprint for YouTube: background service worker.
// Owns the Sponsorprint key and every network call, so YouTube pages never see the key.

const API = "https://sponsorprint.com/api/ext/print";

const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

async function call(method, { query, body } = {}) {
  const { spKey } = await get("spKey");
  if (!spKey) return { ok: false, status: 401, error: "Not connected to Sponsorprint" };
  const url = query ? `${API}?${new URLSearchParams(query)}` : API;
  try {
    const r = await fetch(url, { method, headers: { authorization: `Bearer ${spKey}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ...j, ok: r.ok && j.ok !== false, status: r.status, error: j.error || (r.ok ? null : `Sponsorprint returned ${r.status}`) };
  } catch (e) {
    return { ok: false, status: 0, error: "Can't reach sponsorprint.com" };
  }
}

async function ping() {
  const r = await call("GET");
  if (r.ok) await set({ spEmail: r.email || null, spFeed: r.feed_url || null });
  return r;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg?.type === "status") {
      const { spKey, spEmail, spFeed } = await get(["spKey", "spEmail", "spFeed"]);
      const live = msg.live && spKey ? await ping() : null;
      return { connected: !!spKey && (live ? live.ok : true), email: live?.email || spEmail || null, feed: live?.feed_url || spFeed || null, error: live && !live.ok ? live.error : null, version: chrome.runtime.getManifest().version };
    }
    if (msg?.type === "setKey") {
      const key = String(msg.key || "").trim();
      if (!/^sp_[A-Za-z0-9_-]{16,}$/.test(key)) return { ok: false, error: "That doesn't look like a Sponsorprint key (starts with sp_)" };
      const { spKey: old } = await get("spKey");
      await set({ spKey: key });
      const r = await ping();
      if (!r.ok) { if (old) await set({ spKey: old }); else await chrome.storage.local.remove("spKey"); return { ok: false, error: r.error }; }
      return { ok: true, email: r.email };
    }
    if (msg?.type === "disconnect") { await chrome.storage.local.remove(["spKey", "spEmail", "spFeed"]); return { ok: true }; }
    // Badge + results for one channel. Reads Sponsorprint's database only: no YouTube quota.
    if (msg?.type === "check") return call("GET", { query: { handle: String(msg.handle || ""), ...(msg.job ? { job: String(msg.job) } : {}) } });
    // The click: pull (or re-pull) the print.
    if (msg?.type === "pull") return call("POST", { body: { handle: String(msg.handle || ""), force: msg.force === true } });
    if (msg?.type === "open") { await chrome.tabs.create({ url: "https://sponsorprint.com/extension" }); return { ok: true }; }
    return { ok: false, error: "unknown message" };
  })().then(reply, (e) => reply({ ok: false, error: String(e?.message || e) }));
  return true;
});
