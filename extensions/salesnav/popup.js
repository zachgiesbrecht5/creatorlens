const DEFAULTS = { dailyCap: 300, minDelay: 6, maxDelay: 12, maxPages: 10, breakEvery: 5 };
const $ = (id) => document.getElementById(id);
const msg = (t, bad) => { $("msg").textContent = t; $("msg").style.color = bad ? "#c8362e" : "#12854f"; };
$("ver").textContent = "v" + chrome.runtime.getManifest().version;

async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: "status", live: true }).catch(() => null);
  const on = !!s?.connected;
  $("conn").innerHTML = on ? `<span class="ok">● Connected</span> as ${s.email || "admin"}` : `<span class="bad">○ Not connected</span>${s?.error ? ` · ${s.error}` : ""}`;
  $("today").textContent = on && s.today ? `Today in Sponsorprint: ${s.today.people} people, ${s.today.accounts} accounts${s.outbox ? ` · ${s.outbox} pages waiting to sync` : ""}` : "";
  $("connectBox").style.display = on ? "none" : "block";
  $("connectedBox").style.display = on ? "flex" : "none";
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = { ...DEFAULTS, ...(settings || {}) };
  for (const k of ["dailyCap", "maxPages", "minDelay", "maxDelay"]) $(k).value = s[k];
}

$("saveSettings").onclick = async () => {
  const n = (k, lo, hi) => Math.max(lo, Math.min(hi, Number($(k).value) || DEFAULTS[k]));
  const s = { ...DEFAULTS, dailyCap: n("dailyCap", 25, 1000), maxPages: n("maxPages", 1, 40), minDelay: n("minDelay", 4, 60), maxDelay: n("maxDelay", 6, 120) };
  if (s.maxDelay < s.minDelay + 2) s.maxDelay = s.minDelay + 2;
  await chrome.storage.local.set({ settings: s });
  await loadSettings();
  msg(s.dailyCap > 500 ? "Saved. Heads up: over 500 a day is where LinkedIn starts to notice." : "Saved.", s.dailyCap > 500);
};
$("openConnect").onclick = () => chrome.tabs.create({ url: "https://sponsorprint.com/salesnav" });
$("saveKey").onclick = async () => {
  const r = await chrome.runtime.sendMessage({ type: "setKey", key: $("key").value });
  if (r?.ok) { $("key").value = ""; msg("Connected."); } else msg(r?.error || "Couldn't connect.", true);
  refresh();
};
$("disconnect").onclick = async () => { await chrome.runtime.sendMessage({ type: "disconnect" }); msg("Disconnected."); refresh(); };

loadSettings(); refresh();
