// Runs on sponsorprint.com. Lets the admin Sales Nav tab hand this extension the
// Sponsorprint key with one click (no copy-paste). Only answers the page itself.
(() => {
  const ORIGINS = new Set(["https://sponsorprint.com", "https://www.sponsorprint.com"]);
  if (!ORIGINS.has(location.origin)) return;
  const send = (data) => window.postMessage({ source: "sp-salesnav-ext", ...data }, location.origin);
  const hello = async () => {
    const s = await chrome.runtime.sendMessage({ type: "status", live: false }).catch(() => null);
    send({ type: "hello", version: chrome.runtime.getManifest().version, connected: !!s?.connected, email: s?.email || null });
  };
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== "sp-salesnav-page") return;
    if (e.data.type === "ping") return hello();
    if (e.data.type === "key") {
      const r = await chrome.runtime.sendMessage({ type: "setKey", key: e.data.key }).catch((err) => ({ ok: false, error: String(err) }));
      send({ type: "connected", ok: !!r?.ok, connected: !!r?.ok, error: r?.error || null, email: r?.email || null, version: chrome.runtime.getManifest().version });
    }
  });
  if (location.pathname.startsWith("/salesnav")) hello();
})();
