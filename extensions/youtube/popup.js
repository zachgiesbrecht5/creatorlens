const $ = (id) => document.getElementById(id);
const send = (m) => chrome.runtime.sendMessage(m).catch((e) => ({ ok: false, error: String(e) }));
const say = (t, bad) => { $("msg").textContent = t || ""; $("msg").className = bad ? "bad" : "note"; };
let feed = null;

async function refresh() {
  $("ver").textContent = "v" + chrome.runtime.getManifest().version;
  const s = await send({ type: "status", live: true });
  const on = !!s?.connected;
  $("conn").textContent = on ? `Connected${s.email ? " as " + s.email : ""}` : s?.error || "Not connected";
  $("conn").className = on ? "ok" : "bad";
  $("connectBox").style.display = on ? "none" : "block";
  $("connectedBox").style.display = on ? "flex" : "none";
  feed = on ? s.feed : null;
  $("sheetBox").style.display = feed ? "block" : "none";
}

$("openConnect").addEventListener("click", () => send({ type: "open" }));
$("saveKey").addEventListener("click", async () => {
  const r = await send({ type: "setKey", key: $("key").value });
  say(r?.ok ? "Connected." : r?.error || "Could not connect", !r?.ok);
  refresh();
});
$("disconnect").addEventListener("click", async () => { await send({ type: "disconnect" }); say("Disconnected."); refresh(); });
$("copyFormula").addEventListener("click", async () => {
  if (!feed) return;
  await navigator.clipboard.writeText(`=IMPORTDATA("${feed}")`);
  say("Formula copied. Paste it into cell A1 of an empty tab.");
});
refresh();
