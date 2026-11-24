// ===== Konfiguracja – po podłączeniu backendu zmień USE_MOCK na false i ustaw API_BASE =====
const USE_MOCK = true;
const API_BASE = "/api";

// Wspólne menu, nagłówek i stopka – wstrzykiwane na każdej stronie (działa też z file://)
const ROOT = document.body.dataset.root || "";   // "" dla index.html, "../" dla pages/*
const PAGE = document.body.dataset.page;
const NAV = [
  ["overview",  "Przegląd",  "index.html"],
  ["player",    "Player",    "pages/player.html"],
  ["services",  "Usługi",    "pages/services.html"],
  ["vendors",   "Vendorzy",  "pages/vendors.html"],
  ["events",    "Eventy",    "pages/events.html"],
  ["incidents", "Incydenty", "pages/incidents.html"],
  ["model",     "Model",     "pages/model.html"]
];

document.getElementById("site-header").innerHTML = `
  <header class="top">
    <a class="logo" href="${ROOT}index.html" title="Predykcyjne wykrywanie awarii i degradacji usług">pulse<span>watch</span></a>
    <nav>${NAV.map(([id, name, href]) =>
      `<a href="${ROOT}${href}" data-id="${id}" class="${id === PAGE ? "active" : ""}">${name}<i class="navdot" hidden></i></a>`).join("")}</nav>
    <div class="top-right">
      <div class="dd-wrap">
        <label class="search"><input id="search-input" type="search" placeholder="Szukaj usługi lub incydentu" autocomplete="off"><span>🔍</span></label>
        <div id="search-results" class="dropdown" hidden></div>
      </div>
      <div class="dd-wrap">
        <button id="bell" class="btn-link bell" title="Powiadomienia" aria-label="Powiadomienia">🔔<span id="bell-count" class="count" hidden>0</span></button>
        <div id="notif-panel" class="dropdown notif" hidden>
          <div class="dd-head"><strong>Powiadomienia</strong><button id="notif-readall" class="link-small">Oznacz jako przeczytane</button></div>
          <div id="notif-list"></div>
          <div class="dd-foot"><span id="notif-perm-state"></span><button id="notif-perm" class="link-small">Włącz powiadomienia przeglądarki</button></div>
        </div>
      </div>
      <button class="btn-link">⎆ Zaloguj</button>
      <button class="btn-cta">Zgłoś incydent</button>
    </div>
  </header>
  <div class="meta">Dane: <span id="data-source">PLACEHOLDER (Snowflake niepodłączony)</span> · Ostatnia aktualizacja: <span id="last-update">—</span></div>`;

document.getElementById("site-footer").innerHTML =
  `<footer>Created using Anthropic Claude – wersja robocza, do weryfikacji przez człowieka przed użyciem poza środowiskiem wewnętrznym.</footer>`;

// Dane przykładowe (do czasu gotowego modelu i bazy)
// Generator przykładowej serii widzów (36 punktów co 5 min = 3 h) z wzrostem i pikiem
function genSeries(last, spikeAt, spikeSize, seed) {
  const out = [];
  let r = seed;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let k = 0; k < 36; k++) {
    const trend = 0.55 + 0.45 * (k / 35);
    const spike = spikeSize * Math.exp(-Math.pow((k - spikeAt) / 3, 2));
    out.push(Math.round(last * (trend + spike + (rnd() - 0.5) * 0.06)));
  }
  out[35] = last;
  return out;
}

const mock = {
  kpis: { risk: 72, alerts: 3, mttd: 4, eventIn: "02:15 h" },
  // Vendorzy zewnętrzni (docelowo: AWS Health API, Statuspage/RSS, własne health-checki)
  // status: ok | degraded | down; uptime = ostatnie 24 h co godzinę (1 ok, .5 degradacja, 0 awaria)
  vendors: [
    { name: "AWS", component: "CloudFront / EC2 / S3 (eu-central-1)", status: "degraded", availability: 99.12, latencyMs: 410, baselineMs: 140, since: "22 min", note: "Podwyższone błędy 5xx i latency w eu-central-1.", affects: ["Streaming / CDN", "Autoryzacja (login)"], statusUrl: "https://health.aws.amazon.com/health/status", uptime: [...Array(21).fill(1), .5, .5, .5] },
    { name: "Akamai", component: "CDN (dostarczanie wideo)", status: "ok", availability: 99.99, latencyMs: 38, baselineMs: 40, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Streaming / CDN"], statusUrl: "https://www.akamaistatus.com/", uptime: Array(24).fill(1) },
    { name: "Cloudflare", component: "DNS / WAF", status: "ok", availability: 99.98, latencyMs: 12, baselineMs: 12, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Wyszukiwarka", "Autoryzacja (login)"], statusUrl: "https://www.cloudflarestatus.com/", uptime: Array(24).fill(1) },
    { name: "Snowflake", component: "Hurtownia danych", status: "ok", availability: 99.95, latencyMs: 220, baselineMs: 210, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Model predykcyjny", "Raporty"], statusUrl: "https://status.snowflake.com/", uptime: Array(24).fill(1) },
    { name: "Okta", component: "Logowanie (SSO)", status: "ok", availability: 99.97, latencyMs: 95, baselineMs: 90, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Autoryzacja (login)"], statusUrl: "https://status.okta.com/", uptime: Array(24).fill(1) }
  ],
  // Powiadomienia (docelowo: alerty z modelu predykcyjnego)
  alerts: [
    { id: "a1", level: "crit", title: "Wysokie ryzyko: Streaming / CDN", text: "Prognoza 72% w ciągu 30 min. Rosnący ruch na TVN24.", minsAgo: 2 },
    { id: "a2", level: "warn", title: "Wzrost latency p95: Autoryzacja", text: "Latency +35% względem normy dla tej godziny.", minsAgo: 14 },
    { id: "a3", level: "warn", title: "Nadchodzący event za 2 h 15 min", text: "Spodziewany wzrost ruchu na Eurosport 1.", minsAgo: 40 }
  ],
  // Top kanały live wg liczby widzów; cdnLoad = obciążenie CDN/origin dla kanału
  channels: [
    { name: "TVN24",       viewers: 412000, bandwidth: 2.9, cdnLoad: 88, trend: +18, series: genSeries(412000, 33, 0.25, 11) },
    { name: "TVN",         viewers: 365000, bandwidth: 2.6, cdnLoad: 71, trend: +9,  series: genSeries(365000, 20, 0.35, 23) },
    { name: "Eurosport 1", viewers: 241000, bandwidth: 2.1, cdnLoad: 64, trend: +25, series: genSeries(241000, 34, 0.15, 37) },
    { name: "TTV",         viewers: 158000, bandwidth: 1.0, cdnLoad: 37, trend: -3,  series: genSeries(158000, 12, 0.5, 41) },
    { name: "TVN Style",   viewers: 96000,  bandwidth: 0.7, cdnLoad: 22, trend: +1,  series: genSeries(96000, 25, 0.1, 59) }
  ],
  services: [
    { name: "Streaming / CDN", risk: 72, factor: "Rosnący ruch przed eventem" },
    { name: "Autoryzacja (login)", risk: 48, factor: "Wzrost latency p95" },
    { name: "Koszyk / płatności", risk: 15, factor: "—" },
    { name: "Wyszukiwarka", risk: 9, factor: "—" }
  ],
  player: { rebuf: 1.8, startup: 3.2, bitrate: 2.4, errors: 0.9, sessions: 128400 },
  incidents: [
    { id: "INC-1001", service: "Streaming / CDN", start: "2026-10-04 20:41", detected: "2026-10-04 21:05", sev: "P1", model: "tak (+24 min)" },
    { id: "INC-1002", service: "Autoryzacja", start: "2026-10-11 18:10", detected: "2026-10-11 18:22", sev: "P2", model: "tak (+12 min)" },
    { id: "INC-1003", service: "Wyszukiwarka", start: "2026-10-19 09:02", detected: "2026-10-19 09:30", sev: "P3", model: "nie" }
  ]
};

const level = r => r >= 60 ? "crit" : r >= 30 ? "warn" : "ok";
const label = { crit: "Wysokie", warn: "Podwyższone", ok: "OK" };
const $ = id => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const fmt = n => n.toLocaleString("pl-PL");

let appData = mock;   // aktualne dane – używane przez wyszukiwarkę i powiadomienia

async function load() {
  const data = USE_MOCK ? mock : await (await fetch(API_BASE + "/dashboard")).json();
  appData = data;
  renderNotifs();
  updateNavDots();
  renderVendors();
  setText("last-update", new Date().toLocaleString("pl-PL"));
  if (!USE_MOCK) setText("data-source", "Snowflake");

  // Przegląd
  setText("kpi-risk", data.kpis.risk + "%");
  setText("kpi-alerts", data.kpis.alerts);
  setText("kpi-mttd", data.kpis.mttd + " min");
  setText("kpi-event", data.kpis.eventIn);

  if ($("top-channels")) {
    const top = [...data.channels].sort((a, b) => b.viewers - a.viewers).slice(0, 5);
    $("top-channels").innerHTML = top.map((c, i) => {
      const l = level(c.cdnLoad);
      const arrow = c.trend >= 0 ? "▲" : "▼";
      const s = c.series;                       // widzowie co 5 min, ostatnie 3 h
      const max = Math.max(...s), peakIdx = s.indexOf(max);
      const W = 200, H = 70, min = Math.min(...s) * 0.9;
      const pts = s.map((v, k) => [k / (s.length - 1) * W, H - (v - min) / (max * 1.05 - min) * (H - 6) - 3]);
      const line = pts.map((p, k) => (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      const col = { ok: "#18e8a4", warn: "#f5a623", crit: "#ff5c5c" }[l];
      const [px, py] = pts[peakIdx];
      const peakAgo = (s.length - 1 - peakIdx) * 5;
      return `<div class="ch ${l}">
        <div class="name">${i + 1}. ${c.name}${l === "crit" ? '<span class="dot" title="Wysokie obciążenie"></span>' : ""}</div>
        <div class="viewers">${fmt(c.viewers)} <small>live</small></div>
        <div class="spark"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs><linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
          <path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#g${i})"/>
          <path d="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/>
          <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${col}"/>
        </svg></div>
        <div class="row"><span>szczyt ${fmt(max)} (${peakAgo ? peakAgo + " min temu" : "teraz"})</span><span class="${c.trend >= 10 ? "warn" : ""}">${arrow} ${Math.abs(c.trend)}%/15 min</span></div>
        <div class="row"><span>${c.bandwidth} Tbps</span><span class="${l}">CDN ${c.cdnLoad}%</span></div>
        <div class="load"><i style="width:${c.cdnLoad}%"></i></div>
      </div>`;
    }).join("");
  }

  // Player
  if (data.player) {
    const p = data.player;
    setText("pl-rebuf", p.rebuf + "%");
    setText("pl-startup", p.startup + " s");
    setText("pl-bitrate", p.bitrate + " Mbps");
    setText("pl-errors", p.errors + "%");
    setText("pl-sessions", fmt(p.sessions));
  }

  // Usługi
  if ($("services-table")) {
    $("services-table").innerHTML = data.services.map(s => {
      const l = level(s.risk);
      return `<tr><td>${s.name}</td><td class="${l}">${s.risk}%</td><td><span class="badge ${l}">${label[l]}</span></td><td>${s.factor}</td></tr>`;
    }).join("");
  }

  // Incydenty
  if ($("incidents-table")) {
    $("incidents-table").innerHTML = data.incidents.map(i =>
      `<tr><td>${i.id}</td><td>${i.service}</td><td>${i.start}</td><td>${i.detected}</td><td>${i.sev}</td><td>${i.model}</td></tr>`
    ).join("");
  }
}
// load() jest wywoływane na końcu pliku (po zdefiniowaniu wyszukiwarki i powiadomień)

// Symulacja telemetrii playera (tylko strona Player, do czasu podłączenia prawdziwego strumienia)
// Docelowo: player wysyła zdarzenia (beacon/WebSocket) → backend → Snowflake → ten widok.
if (USE_MOCK && $("player-events")) {
  const evTypes = [
    ["play", "ok"], ["quality_change 1080p→720p", "warn"], ["buffering_start", "warn"],
    ["buffering_end", "ok"], ["stalled", "crit"], ["error MEDIA_ERR_NETWORK", "crit"], ["seek", "ok"]
  ];
  const evBox = $("player-events"), hud = $("player-hud");
  setInterval(() => {
    const [name, lvl] = evTypes[Math.floor(Math.random() * evTypes.length)];
    const row = document.createElement("div");
    row.innerHTML = `<span style="color:var(--muted)">${new Date().toLocaleTimeString("pl-PL")}</span> <span class="${lvl}">${name}</span> <span style="color:var(--muted)">sess=${Math.random().toString(36).slice(2, 8)}</span>`;
    evBox.prepend(row);
    while (evBox.children.length > 40) evBox.lastChild.remove();
    hud.innerHTML = `res: ${["1080p", "720p", "480p"][Math.floor(Math.random() * 3)]}<br>bitrate: ${(3 + Math.random() * 4).toFixed(1)} Mbps<br>buffer: ${(2 + Math.random() * 20).toFixed(1)} s<br>dropped: ${Math.floor(Math.random() * 30)}`;
  }, 1500);
}

// Miejsce na wykresy, np.: Plotly.newPlot("chart-risk-timeline", [...], {...});

// ===== Wyszukiwarka =====
const norm = s => String(s).toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
const link = href => ROOT + href;

function buildIndex() {
  const d = appData, idx = [];
  NAV.forEach(([id, name, href]) => idx.push({ type: "Strona", title: name, sub: "", href: link(href), key: name }));
  (d.services || []).forEach(s => idx.push({ type: "Usługa", title: s.name, sub: `ryzyko ${s.risk}% · ${s.factor}`, href: link("pages/services.html"), key: `${s.name} ${s.factor}` }));
  (d.incidents || []).forEach(i => idx.push({ type: "Incydent", title: `${i.id} – ${i.service}`, sub: `${i.start} · ${i.sev}`, href: link("pages/incidents.html"), key: `${i.id} ${i.service} ${i.sev}` }));
  (d.vendors || []).forEach(v => idx.push({ type: "Vendor", title: v.name, sub: `${v.component} · ${v.status}`, href: link("pages/vendors.html"), key: `${v.name} ${v.component}` }));
  (d.channels || []).forEach(c => idx.push({ type: "Kanał", title: c.name, sub: `${fmt(c.viewers)} widzów · CDN ${c.cdnLoad}%`, href: link("index.html"), key: c.name }));
  return idx;
}

const sInput = $("search-input"), sBox = $("search-results");
function runSearch() {
  const q = norm(sInput.value.trim());
  if (!q) { sBox.hidden = true; return; }
  const res = buildIndex().filter(e => norm(e.title + " " + e.key + " " + e.type).includes(q)).slice(0, 8);
  sBox.innerHTML = res.length
    ? res.map(e => `<a class="dd-item" href="${e.href}"><span class="tag">${e.type}</span><span><b>${e.title}</b>${e.sub ? `<br><small>${e.sub}</small>` : ""}</span></a>`).join("")
    : `<div class="dd-empty">Brak wyników dla „${sInput.value}"</div>`;
  sBox.hidden = false;
}
sInput.addEventListener("input", runSearch);
sInput.addEventListener("focus", runSearch);
sInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { const a = sBox.querySelector("a"); if (a) location.href = a.href; }
  if (e.key === "Escape") { sBox.hidden = true; sInput.blur(); }
});
document.addEventListener("keydown", e => {
  if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); sInput.focus(); }
});

// ===== Powiadomienia =====
const READ_KEY = "pw_read";
const getRead = () => { try { return JSON.parse(localStorage.getItem(READ_KEY)) || []; } catch { return []; } };
const setRead = ids => localStorage.setItem(READ_KEY, JSON.stringify(ids));
const liveAlerts = [];   // alerty dodane w trakcie sesji

function allAlerts() {
  const base = [...derivedAlerts(), ...(appData.alerts || [])].map(a => ({ ...a, ts: Date.now() - a.minsAgo * 60000 }));
  return [...liveAlerts, ...base].sort((a, b) => b.ts - a.ts);
}
const ago = ts => { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? "teraz" : m < 60 ? `${m} min temu` : `${Math.floor(m / 60)} h temu`; };

function renderNotifs() {
  const read = getRead(), list = allAlerts(), unread = list.filter(a => !read.includes(a.id)).length;
  const cnt = $("bell-count");
  cnt.textContent = unread; cnt.hidden = unread === 0;
  $("notif-list").innerHTML = list.length ? list.map(a =>
    `<div class="dd-item notif-item ${read.includes(a.id) ? "read" : ""}"><span class="lvl ${a.level}">●</span><span><b>${a.title}</b><br><small>${a.text}</small><br><small class="muted">${ago(a.ts)}</small></span></div>`
  ).join("") : `<div class="dd-empty">Brak powiadomień</div>`;
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  $("notif-perm-state").textContent = perm === "granted" ? "Przeglądarka: włączone" : perm === "denied" ? "Przeglądarka: zablokowane" : "";
  $("notif-perm").hidden = perm !== "default";
}

$("bell").addEventListener("click", e => { e.stopPropagation(); $("notif-panel").hidden = !$("notif-panel").hidden; renderNotifs(); });
$("notif-readall").addEventListener("click", () => { setRead(allAlerts().map(a => a.id)); renderNotifs(); });
$("notif-perm").addEventListener("click", async () => { await Notification.requestPermission(); renderNotifs(); });
$("notif-panel").addEventListener("click", e => e.stopPropagation());
sBox.addEventListener("click", e => e.stopPropagation());
document.addEventListener("click", e => { $("notif-panel").hidden = true; if (e.target !== sInput) sBox.hidden = true; });

// Toast + powiadomienie przeglądarki dla nowego alertu
function pushAlert(a) {
  a.ts = Date.now(); liveAlerts.unshift(a); renderNotifs();
  let box = $("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast " + a.level;
  t.innerHTML = `<b>${a.title}</b><br><small>${a.text}</small>`;
  box.appendChild(t); setTimeout(() => t.remove(), 7000);
  if ("Notification" in window && Notification.permission === "granted") new Notification(a.title, { body: a.text });
}
window.pushAlert = pushAlert;   // docelowo wywoływane z backendu (WebSocket/SSE/polling)

// Symulacja nowego alertu (tylko tryb przykładowy)
if (USE_MOCK) setTimeout(() => pushAlert({ id: "sim-" + Date.now(), level: "crit", title: "Pik oglądalności: TVN24", text: "Obciążenie CDN przekroczyło 85%." }), 20000);
// ===== Vendorzy: diagnoza „nasza strona vs vendor", alerty pochodne, kropki w menu =====
const STATUS_LABEL = { ok: "Działa", degraded: "Degradacja", down: "Awaria" };
const STATUS_LEVEL = { ok: "ok", degraded: "warn", down: "crit" };
const BITRATE_MIN = 3, ERRORS_MAX = 2, REBUF_MAX = 2.5;   // progi „naszych" metryk

function ourSignals(d) {
  const p = d.player || {}, s = [];
  if (p.bitrate < BITRATE_MIN) s.push(`niski bitrate playera (${p.bitrate} Mbps)`);
  if (p.errors > ERRORS_MAX) s.push(`błędy odtwarzania ${p.errors}%`);
  if (p.rebuf > REBUF_MAX) s.push(`rebuffering ${p.rebuf}%`);
  return s;
}

// Prosta reguła; docelowo można ją zastąpić korelacją czasową metryk z incydentami vendora
function diagnose(d) {
  const ours = ourSignals(d), bad = (d.vendors || []).filter(v => v.status !== "ok");
  const names = bad.map(v => v.name).join(", ");
  if (ours.length && bad.length) return { level: "warn", title: `Prawdopodobnie po stronie vendora: ${names}`, text: `U nas: ${ours.join("; ")}. Jednocześnie ${names} zgłasza problem – warto najpierw sprawdzić vendora i rozważyć przełączenie ruchu.` };
  if (ours.length)               return { level: "crit", title: "Prawdopodobnie po naszej stronie", text: `U nas: ${ours.join("; ")}. Żaden vendor nie zgłasza problemu – sprawdź nasz origin, wdrożenia i konfigurację playera.` };
  if (bad.length)                return { level: "warn", title: `Problem u vendora (${names}), na razie bez wpływu na nasze metryki`, text: "Obserwuj – model może podnieść ryzyko, jeśli degradacja się utrzyma." };
  return { level: "ok", title: "Brak problemów po naszej stronie i u vendorów", text: "Wszystkie monitorowane usługi działają prawidłowo." };
}

function derivedAlerts() {
  const d = appData, out = [];
  (d.vendors || []).filter(v => v.status !== "ok").forEach(v => out.push({
    id: `vendor-${v.name}-${v.status}`, level: STATUS_LEVEL[v.status],
    title: `${v.name} ${v.status === "down" ? "nie działa" : "– degradacja"}`, text: `${v.component}. ${v.note}`, minsAgo: parseInt(v.since) || 1 }));
  if (d.player && d.player.bitrate < BITRATE_MIN) out.push({
    id: "player-bitrate-low", level: "warn", title: "Player: niski bitrate",
    text: `Średni bitrate ${d.player.bitrate} Mbps (próg ${BITRATE_MIN} Mbps).`, minsAgo: 6 });
  if (d.player && d.player.errors > ERRORS_MAX) out.push({
    id: "player-errors-high", level: "crit", title: "Player: wysoki odsetek błędów",
    text: `${d.player.errors}% sesji z błędem odtwarzania.`, minsAgo: 4 });
  return out;
}

// Kropki przy pozycjach menu: Vendorzy (vendor nie działa) i Player (problem z jakością)
function updateNavDots() {
  const set = (id, lvl) => {
    const dot = document.querySelector(`nav a[data-id="${id}"] .navdot`);
    if (!dot) return;
    dot.hidden = !lvl; dot.className = "navdot " + (lvl || "");
  };
  const vs = (appData.vendors || []).map(v => v.status);
  set("vendors", vs.includes("down") ? "crit" : vs.includes("degraded") ? "warn" : null);
  const p = appData.player || {};
  set("player", p.errors > ERRORS_MAX ? "crit" : (p.bitrate < BITRATE_MIN || p.rebuf > REBUF_MAX) ? "warn" : null);
}

function renderVendors() {
  const v = appData.vendors || [], dg = diagnose(appData);
  if ($("verdict-box")) $("verdict-box").innerHTML =
    `<div class="verdict ${dg.level}"><div class="verdict-title">${dg.title}</div><div>${dg.text}</div></div>`;
  if ($("verdict-line")) $("verdict-line").innerHTML =
    `<a class="verdict-line ${dg.level}" href="${link("pages/vendors.html")}"><span class="navdot ${dg.level}"></span><b>Diagnoza:</b> ${dg.title}</a>`;
  if ($("vendors-grid")) $("vendors-grid").innerHTML = v.map(x => {
    const l = STATUS_LEVEL[x.status];
    return `<div class="card vendor ${l}">
      <div class="vh"><span class="navdot ${l}"></span><b>${x.name}</b><span class="badge ${l}">${STATUS_LABEL[x.status]}</span></div>
      <div class="muted small">${x.component}</div>
      <div class="vstats"><div><span class="muted small">Dostępność 30 d</span><br><b>${x.availability}%</b></div>
        <div><span class="muted small">Latency</span><br><b class="${x.latencyMs > x.baselineMs * 2 ? "warn" : ""}">${x.latencyMs} ms</b> <span class="muted small">(norma ${x.baselineMs})</span></div></div>
      <div class="uptime" title="Ostatnie 24 h">${x.uptime.map(u => `<i class="${u === 1 ? "ok" : u === 0 ? "crit" : "warn"}"></i>`).join("")}</div>
      <div class="small" style="margin-top:8px">${x.note}${x.since !== "—" ? ` <span class="muted">(od ${x.since})</span>` : ""}</div>
      <a class="link-small" href="${x.statusUrl}" target="_blank" rel="noopener">Strona statusu vendora ↗</a>
    </div>`;
  }).join("");
  if ($("vendor-impact")) $("vendor-impact").innerHTML = v.map(x => {
    const l = STATUS_LEVEL[x.status];
    return `<tr><td>${x.name}</td><td><span class="badge ${l}">${STATUS_LABEL[x.status]}</span></td><td>${x.affects.join(", ")}</td><td>${x.status === "ok" ? "—" : "Możliwy wpływ na te usługi"}</td></tr>`;
  }).join("");
  if ($("vendor-our-signals")) {
    const s = ourSignals(appData);
    $("vendor-our-signals").innerHTML = s.length ? s.map(t => `<li class="warn">${t}</li>`).join("") : `<li class="ok">Nasze metryki w normie</li>`;
  }
}

renderNotifs();

load();
