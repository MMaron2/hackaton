// ===== Konfiguracja – po podłączeniu backendu zmień USE_MOCK na false i ustaw API_BASE =====
const USE_MOCK = true;
const API_BASE = "/api";

// Wspólne menu, nagłówek i stopka – wstrzykiwane na każdej stronie (działa też z file://)
const ROOT = document.body.dataset.root || "";   // "" dla index.html, "../" dla pages/*
const PAGE = document.body.dataset.page;
const NAV = [
  ["overview",  "Przegląd",  "index.html"],
  ["alerts",    "Alerty",    "pages/alerts.html"],
  ["player",    "Player",    "pages/player.html"],
  ["services",  "Usługi",    "pages/services.html"],
  ["vendors",   "Vendorzy",  "pages/vendors.html"],
  ["watch",     "Obserwowane", "pages/watch.html"],
  ["events",    "Eventy",    "pages/events.html"],
  ["incidents", "Incydenty", "pages/incidents.html"],
  ["model",     "Model",     "pages/model.html"]
];

// Ikona logo: „hub" – węzeł centralny połączony z pięcioma źródłami informacji (ten sam motyw co ikona karty)
const LOGO_HTML = `<svg class="logo-ico" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor"/><g stroke="var(--logo-ink, #03182f)" stroke-width="2" stroke-linecap="round"><path d="M16 16 16 6.5M16 16 25 12.5M16 16 22 24.5M16 16 10 24.5M16 16 7 12.5"/></g><g fill="var(--logo-ink, #03182f)"><circle cx="16" cy="6.5" r="2.6"/><circle cx="25" cy="12.5" r="2.6"/><circle cx="22" cy="24.5" r="2.6"/><circle cx="10" cy="24.5" r="2.6"/><circle cx="7" cy="12.5" r="2.6"/><circle cx="16" cy="16" r="4.4"/></g><circle cx="16" cy="16" r="1.7" fill="currentColor"/></svg><span class="logo-text">info<span>hub</span></span>`;
// Prosta lupa wektorowa (kolor dziedziczy z tekstu) – używana w polach i przyciskach wyszukiwania
const SEARCH_SVG = `<svg class="ico-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/></svg>`;
// Zestaw prostych ikon wektorowych (linie, kolor z tekstu) – zastępują emoji. icon("bell") zwraca gotowe SVG;
// w statycznym HTML wystarczy <i data-ic="bell"></i>, a skrypt wstawi ikonę.
const ICON_PATHS = {
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  login: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M4 12h11M11 8l4 4-4 4"/>',
  "chart-line": '<path d="M4 4v16h16"/><path d="M7 15l4-5 3 3 5-7"/>',
  "chart-bar": '<path d="M4 4v16h16"/><path d="M8 16v-5M12 16V8M16 16v-9"/>',
  heatmap: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  network: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M11 7l-5 9M13 7l5 9M7 18h10"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  app: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 7h.01M10 7h.01"/>',
  volume: '<path d="M4 10v4h3l5 4V6l-5 4z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const icon = name => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
document.querySelectorAll("i[data-ic]").forEach(el => { el.innerHTML = icon(el.dataset.ic); });

// Płynne przejścia między stronami: treść znika przed wyjściem i wjeżdża po wejściu (style: body.page-leaving, @keyframes page-in).
// Dotyczy linków w menu, logo, stopce, wyników wyszukiwania i przejść z powiadomień (openAlert).
const LEAVE_MS = 170;
function navigateTo(url) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { location.href = url; return; }
  document.body.classList.add("page-leaving");
  setTimeout(() => { location.href = url; }, LEAVE_MS);
}
document.addEventListener("click", e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download") || a.getAttribute("href").startsWith("#")) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;   // tylko strony tego serwisu
  e.preventDefault(); navigateTo(url.href);
});
window.addEventListener("pageshow", () => document.body.classList.remove("page-leaving"));   // powrót przyciskiem „Wstecz"
// Klikalne kafelki (KPI na Przeglądzie): data-go="strona" przenosi na podstronę,
// data-go-focus="selektor" przewija do elementu na tej samej stronie i go podświetla
function goTile(el) {
  if (el.dataset.goFocus) { focusElement(el.dataset.goFocus); return; }
  navigateTo(new URL(ROOT + el.dataset.go, location.href).href);
}
document.addEventListener("click", e => { const t = e.target.closest("[data-go], [data-go-focus]"); if (t) goTile(t); });
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-go], [data-go-focus]")) { e.preventDefault(); goTile(e.target); }
});
// Nagłówek: logo + wyszukiwarka i akcje, pod spodem przyklejony pasek działów
document.getElementById("site-header").innerHTML = `
  <header class="masthead">
    <a class="logo" href="${ROOT}index.html" title="Monitoring awarii i degradacji usług">${LOGO_HTML}</a>
    <span class="tagline">Monitoring awarii i degradacji usług
      <small class="meta">Dane: <span id="data-source">PLACEHOLDER (Snowflake niepodłączony)</span> · Aktualizacja: <span id="last-update">—</span></small></span>
    <div class="top-right">
      <div class="dd-wrap">
        <label class="search"><input id="search-input" type="search" placeholder="Szukaj usługi lub incydentu" autocomplete="off">${SEARCH_SVG}</label>
        <div id="search-results" class="dropdown" hidden></div>
      </div>
      <div class="dd-wrap">
        <button id="bell" class="btn-link bell" title="Powiadomienia" aria-label="Powiadomienia">${icon("bell")}<span id="bell-count" class="count" hidden>0</span></button>
        <div id="notif-panel" class="dropdown notif" hidden>
          <div class="dd-head"><strong>Powiadomienia</strong><button id="notif-readall" class="link-small">Oznacz jako przeczytane</button></div>
          <div id="notif-list"></div>
          <div class="dd-foot"><span id="notif-perm-state"></span><button id="notif-perm" class="link-small">Włącz powiadomienia przeglądarki</button></div>
        </div>
      </div>
      <button id="theme-toggle" class="btn-link theme-toggle" type="button"></button>
      <select id="lang-select" class="lang-select" aria-label="Język / Language / Sprache"><option value="pl">PL</option><option value="en">EN</option><option value="de">DE</option></select>
      <button class="btn-link login-btn">${icon("login")} Zaloguj</button>
      <button class="btn-cta">Zgłoś incydent</button>
    </div>
  </header>
  <div class="navbar">
    <nav>${NAV.map(([id, name, href]) =>
      `<a href="${ROOT}${href}" data-id="${id}" class="${id === PAGE ? "active" : ""}">${name}<i class="navdot" hidden></i></a>`).join("")}</nav>
  </div>`;

// Przełącznik motywu jasny/ciemny (wybór zapamiętany; domyślnie wg ustawień systemu)
(function () {
  const btn = document.getElementById("theme-toggle"), root = document.documentElement;
  const paint = () => {
    const light = root.dataset.theme === "light";
    btn.innerHTML = icon(light ? "moon" : "sun");
    btn.title = btn.ariaLabel = light ? "Przełącz na tryb ciemny" : "Przełącz na tryb jasny";
  };
  btn.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    localStorage.setItem("pw_theme", root.dataset.theme);
    paint();
  });
  paint();
})();

// Wybór języka (PL / EN / DE): zapis w przeglądarce i przeładowanie strony – tłumaczy assets/i18n.js
(function () {
  const sel = document.getElementById("lang-select");
  sel.value = window.LANG || "pl";
  sel.addEventListener("change", () => { localStorage.setItem("pw_lang", sel.value); location.reload(); });
})();

document.getElementById("site-footer").innerHTML =
  `<footer class="site-footer">
    <div class="foot-cols">
      <div><span class="logo">${LOGO_HTML}</span><p>Monitoring awarii i degradacji usług.</p></div>
      <div><b>Działy</b><p>${NAV.map(([, name, href]) => `<a href="${ROOT}${href}">${name}</a>`).join("")}</p></div>
    </div>
    <div class="foot-note">Created using Anthropic Claude – wersja robocza, do weryfikacji przez człowieka przed użyciem poza środowiskiem wewnętrznym.</div>
  </footer>`;

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
  kpis: { risk: 72, alerts: 3, mttd: 4, eventAt: Date.now() + (2 * 60 + 15) * 60000, eventName: "Eurosport 1 – transmisja live" },   // API: eventAt jako ISO, np. "2026-11-24T20:00:00Z"
  // Vendorzy zewnętrzni (docelowo: AWS Health API, Statuspage/RSS, własne health-checki)
  // status: ok | degraded | down; uptime = ostatnie 24 h co godzinę (1 ok, .5 degradacja, 0 awaria)
  vendors: [
    { name: "AWS", component: "CloudFront / EC2 / S3 (eu-central-1)", status: "degraded", availability: 99.12, latencyMs: 410, baselineMs: 140, since: "22 min", note: "Podwyższone błędy 5xx i latency w eu-central-1.", affects: ["Streaming / CDN", "Autoryzacja (login)"], statusUrl: "https://health.aws.amazon.com/health/status", uptime: [...Array(21).fill(1), .5, .5, .5] },
    { name: "Microsoft", component: "Azure (usługi chmurowe)", status: "ok", availability: 99.98, latencyMs: 60, baselineMs: 60, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Autoryzacja (login)", "Raporty"], statusUrl: "https://azure.status.microsoft/en-us/status/", uptime: Array(24).fill(1) },
    { name: "Google Cloud", component: "GCP (usługi chmurowe)", status: "ok", availability: 99.98, latencyMs: 55, baselineMs: 55, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Wyszukiwarka"], statusUrl: "https://status.cloud.google.com/", uptime: Array(24).fill(1) },
    { name: "Akamai", component: "CDN (dostarczanie wideo)", status: "ok", availability: 99.99, latencyMs: 38, baselineMs: 40, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Streaming / CDN"], statusUrl: "https://www.akamaistatus.com/", uptime: Array(24).fill(1) },
    { name: "Cloudflare", component: "DNS / WAF", status: "ok", availability: 99.98, latencyMs: 12, baselineMs: 12, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Wyszukiwarka", "Autoryzacja (login)"], statusUrl: "https://www.cloudflarestatus.com/", uptime: Array(24).fill(1) },
    { name: "Snowflake", component: "Hurtownia danych", status: "ok", availability: 99.95, latencyMs: 220, baselineMs: 210, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Model predykcyjny", "Raporty"], statusUrl: "https://status.snowflake.com/", uptime: Array(24).fill(1) },
    { name: "Okta", component: "Logowanie (SSO)", status: "ok", availability: 99.97, latencyMs: 95, baselineMs: 90, since: "—", note: "Brak zgłoszonych problemów.", affects: ["Autoryzacja (login)"], statusUrl: "https://status.okta.com/", uptime: Array(24).fill(1) }
  ],
  // Powiadomienia (docelowo: alerty z modelu predykcyjnego)
  alerts: [
    { id: "a1", source: { kind: "channel", name: "TVN24" }, level: "crit", title: "Wysokie ryzyko: Streaming / CDN", text: "Prognoza 72% w ciągu 30 min. Rosnący ruch na TVN24.", minsAgo: 2 },
    { id: "a2", source: { kind: "vendor", name: "Okta" }, target: { page: "pages/services.html", selector: '[data-service="Autoryzacja (login)"]' }, level: "warn", title: "Wzrost latency p95: Autoryzacja", text: "Latency +35% względem normy dla tej godziny.", minsAgo: 14 },
    { id: "a3", source: { kind: "channel", name: "Eurosport 1" }, level: "warn", title: "Nadchodzący event za 2 h 15 min", text: "Spodziewany wzrost ruchu na Eurosport 1.", minsAgo: 40 }
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
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));   // dane od vendorów są niezaufane
const stripHtml = h => new DOMParser().parseFromString(String(h || ""), "text/html").body.textContent.trim();
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const fmt = n => n.toLocaleString(LOCALE);

let appData = mock;   // aktualne dane – używane przez wyszukiwarkę i powiadomienia

async function load() {
  const data = USE_MOCK ? mock : await (await fetch(API_BASE + "/dashboard")).json();
  appData = data;
  renderNotifs();
  updateNavDots();
  renderVendors();
  setText("last-update", new Date().toLocaleString(LOCALE));
  if (!USE_MOCK) setText("data-source", "Snowflake");

  // Przegląd
  setText("kpi-risk", data.kpis.risk + "%");
  setText("kpi-alerts", data.kpis.alerts);
  setText("kpi-mttd", data.kpis.mttd + " min");
  renderKpis(data.kpis);

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
      const col = { ok: "var(--ok)", warn: "var(--warn)", crit: "var(--crit)" }[l];
      const [px, py] = pts[peakIdx];
      const peakAgo = (s.length - 1 - peakIdx) * 5;
      return `<div class="ch ${l}" data-ch="${c.name}">
        <div class="name">${channelIcon(c.name, 26)}<span>${c.name}</span>${l === "crit" ? '<span class="dot" title="Wysokie obciążenie"></span>' : ""}</div>
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
      return `<tr data-service="${s.name}"><td>${s.name}</td><td class="${l}">${s.risk}%</td><td><span class="badge ${l}">${label[l]}</span></td><td>${s.factor}</td></tr>`;
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
    row.innerHTML = `<span style="color:var(--muted)">${new Date().toLocaleTimeString(LOCALE)}</span> <span class="${lvl}">${name}</span> <span style="color:var(--muted)">sess=${Math.random().toString(36).slice(2, 8)}</span>`;
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
  (d.services || []).forEach(s => idx.push({ type: "Usługa", title: s.name, sub: `ryzyko ${s.risk}% · ${s.factor}`, href: link("pages/services.html"), key: `${s.name} ${s.factor}`, focus: `[data-service="${s.name}"]` }));
  (d.incidents || []).forEach(i => idx.push({ type: "Incydent", title: `${i.id} – ${i.service}`, sub: `${i.start} · ${i.sev}`, href: link("pages/incidents.html"), key: `${i.id} ${i.service} ${i.sev}` }));
  (d.vendors || []).forEach(v => idx.push({ type: "Vendor", title: v.name, sub: `${v.component} · ${STATUS_LABEL[v.status] || v.status}`, href: link("pages/vendors.html"), key: `${v.name} ${v.component}`, focus: `[data-vendor="${v.name}"]` }));
  (d.channels || []).forEach(c => idx.push({ type: "Kanał", title: c.name, sub: `${fmt(c.viewers)} widzów · CDN ${c.cdnLoad}%`, href: link("index.html"), key: c.name, icon: channelIcon(c.name, 24), focus: `[data-ch="${c.name}"]` }));
  // Kalendarz: święta i eventy z miesięcy widocznych na stronie Eventy – wynik prowadzi do dnia w kalendarzu
  if (window.getCalendarItems) window.getCalendarItems(3).forEach(e => idx.push({
    type: e.kind === "Event" ? "Event" : "Święto", title: e.name, sub: `${e.date} · ${e.kind}${e.note ? " · " + e.note : ""}`,
    href: link("pages/events.html"), key: `${e.name} ${e.date} ${e.date.slice(8)}.${e.date.slice(5, 7)} ${e.kind}`, focus: `[data-date="${e.date}"]` }));
  // Historia incydentów vendorów – tylko już wczytana (po rozwinięciu dostawcy na stronie Vendorzy)
  (d.vendors || []).forEach(v => ((v.history && v.history.incidents) || []).forEach(i => idx.push({
    type: "Historia", title: i.name, sub: `${v.name} · ${fmtDate(i.created)}`, href: link("pages/vendors.html"), key: `${i.name} ${v.name} ${i.desc || ""}`, focus: `[data-vendor="${v.name}"]` })));
  return idx;
}

const sInput = $("search-input"), sBox = $("search-results");
function runSearch() {
  const q = norm(sInput.value.trim());
  if (!q) { sBox.hidden = true; return; }
  const res = buildIndex().filter(e => norm(`${e.title} ${e.key} ${e.type} ${T(e.title)} ${T(e.type)}`).includes(q)).slice(0, 8);   // szuka też po tłumaczeniach
  sBox.innerHTML = res.length
    ? res.map(e => `<a class="dd-item" href="${e.href}" data-focus="${esc(e.focus || "")}"><span class="tag">${e.type}</span>${e.icon || ""}<span><b>${esc(e.title)}</b>${e.sub ? `<br><small>${esc(e.sub)}</small>` : ""}</span></a>`).join("")
    : `<div class="dd-empty">Brak wyników dla „${esc(sInput.value)}"</div>`;
  sBox.hidden = false;
}
sInput.addEventListener("input", runSearch);
sInput.addEventListener("focus", runSearch);
sInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { const a = sBox.querySelector("a"); if (a) a.click(); }
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
    `<div class="dd-item notif-item ${a.level} ${read.includes(a.id) ? "read" : ""}" data-id="${a.id}">${alertBadge(a, 28)}<span><b>${a.title}</b><br><small>${a.text}</small><br><small class="muted">${ago(a.ts)}</small></span></div>`
  ).join("") : `<div class="dd-empty">Brak powiadomień</div>`;
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  $("notif-perm-state").textContent = perm === "granted" ? "Przeglądarka: włączone" : perm === "denied" ? "Przeglądarka: zablokowane" : "";
  $("notif-perm").hidden = perm !== "default";

  // Kafelek „Aktywne alerty" (Przegląd) pokazuje tę samą liczbę co lista „Wymaga uwagi" (w danych przykładowych liczymy ją z alertów)
  if (USE_MOCK && appData.kpis && $("kpi-alerts")) {
    appData.kpis.alerts = list.length;
    setText("kpi-alerts", list.length);
    setKpi("alerts", KPI_COLOR[list.length ? "crit" : "ok"], list.length ? "crit" : "ok", list.length ? "DO REAKCJI" : "BRAK");
  }
  // Kropka przy „Alerty" w menu: czerwona przy alercie krytycznym, pomarańczowa przy pozostałych
  const alertsDot = document.querySelector('nav a[data-id="alerts"] .navdot');
  if (alertsDot) { const lv = list.some(a => a.level === "crit") ? "crit" : list.length ? "warn" : ""; alertsDot.hidden = !lv; alertsDot.className = "navdot " + lv; }
  // Lista „Wymaga uwagi" (strona Alerty): najpierw krytyczne, potem ostrzeżenia; kliknięcie prowadzi do miejsca usterki
  if ($("attention-list")) {
    const hhmm = ts => new Date(ts).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
    const act = [...list].sort((a, b) => ((a.level === "crit" ? 0 : 1) - (b.level === "crit" ? 0 : 1)) || b.ts - a.ts);
    const nc = act.filter(a => a.level === "crit").length, nw = act.length - nc;
    $("attention-card").className = "card attention " + (nc ? "crit" : nw ? "warn" : "ok");
    $("attention-summary").innerHTML = act.length
      ? `${nc ? `<span class="badge crit">${nc} krytyczne</span> ` : ""}${nw ? `<span class="badge warn">${nw} do sprawdzenia</span>` : ""}`
      : `<span class="badge ok">Wszystko działa</span>`;
    $("attention-list").innerHTML = act.length ? act.map(a =>
      `<li class="att-item ${a.level}" data-id="${a.id}">${alertBadge(a, 36)}<div class="att-main"><b>${a.title}</b><p>${a.text}</p></div>
        <span class="badge ${a.level}">${a.level === "crit" ? "Krytyczne" : "Do sprawdzenia"}</span><time>${hhmm(a.ts)}</time></li>`
    ).join("") : `<li class="att-ok"><i class="ico ico-ok"></i> Brak usterek – monitorowane usługi działają prawidłowo.</li>`;
  }
}

$("bell").addEventListener("click", e => { e.stopPropagation(); $("notif-panel").hidden = !$("notif-panel").hidden; renderNotifs(); });
$("notif-readall").addEventListener("click", () => { setRead(allAlerts().map(a => a.id)); renderNotifs(); });
$("notif-perm").addEventListener("click", async () => { await Notification.requestPermission(); renderNotifs(); });
$("notif-panel").addEventListener("click", e => e.stopPropagation());
sBox.addEventListener("click", e => {
  e.stopPropagation();
  // Wynik z celem (dzień w kalendarzu, vendor, usługa, kanał): po przejściu element jest centrowany i podświetlany
  const a = e.target.closest("a[href]");
  if (!a) return;
  e.preventDefault(); sBox.hidden = true;
  const focus = a.dataset.focus;
  if (focus && new URL(a.href).pathname === location.pathname) { focusElement(focus); return; }
  if (focus) sessionStorage.setItem("pw_focus", focus);
  navigateTo(a.href);
});
document.addEventListener("click", e => { $("notif-panel").hidden = true; if (e.target !== sInput) sBox.hidden = true; });

// Toast + powiadomienie przeglądarki dla nowego alertu
function pushAlert(a) {
  a.ts = Date.now(); liveAlerts.unshift(a); renderNotifs();
  let box = $("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast " + a.level;
  t.innerHTML = `${alertBadge(a, 30)}<span><b>${a.title}</b><br><small>${a.text}</small></span>`;
  t.style.cursor = "pointer";
  t.addEventListener("click", () => { t.remove(); openAlert(a); });
  box.appendChild(t); setTimeout(() => t.remove(), 7000);
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(T(a.title), { body: T(a.text), icon: alertIconUrl(a), tag: a.id });
    n.onclick = () => { window.focus(); n.close(); openAlert(a); };
  }
}
window.pushAlert = pushAlert;   // docelowo wywoływane z backendu (WebSocket/SSE/polling)

// Symulacja nowego alertu (tylko tryb przykładowy)
if (USE_MOCK) setTimeout(() => pushAlert({ id: "sim-" + Date.now(), source: { kind: "channel", name: "TVN24" }, level: "crit", title: "Pik oglądalności: TVN24", text: "Obciążenie CDN przekroczyło 85%." }), 20000);
// ===== Vendorzy: diagnoza „nasza strona vs vendor", alerty pochodne, kropki w menu =====
const STATUS_LABEL = { ok: "Działa", degraded: "Degradacja", down: "Awaria", unknown: "Brak danych" };
const STATUS_LEVEL = { ok: "ok", degraded: "warn", down: "crit", unknown: "unk" };
const isBadStatus = s => s === "degraded" || s === "down";
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
  const ours = ourSignals(d), bad = (d.vendors || []).filter(v => isBadStatus(v.status));
  const names = bad.map(v => v.name).join(", ");
  if (ours.length && bad.length) return { level: "warn", title: `Prawdopodobnie po stronie vendora: ${names}`, text: `U nas: ${ours.join("; ")}. Jednocześnie ${names} zgłasza problem – warto najpierw sprawdzić vendora i rozważyć przełączenie ruchu.` };
  if (ours.length)               return { level: "crit", title: "Prawdopodobnie po naszej stronie", text: `U nas: ${ours.join("; ")}. Żaden vendor nie zgłasza problemu – sprawdź nasz origin, wdrożenia i konfigurację playera.` };
  if (bad.length)                return { level: "warn", title: `Problem u vendora (${names}), na razie bez wpływu na nasze metryki`, text: "Obserwuj – model może podnieść ryzyko, jeśli degradacja się utrzyma." };
  return { level: "ok", title: "Brak problemów po naszej stronie i u vendorów", text: "Wszystkie monitorowane usługi działają prawidłowo." };
}

function derivedAlerts() {
  const d = appData, out = [];
  (d.vendors || []).filter(v => isBadStatus(v.status)).forEach(v => out.push({
    id: `vendor-${v.name}-${v.status}`, source: { kind: "vendor", name: v.name }, level: STATUS_LEVEL[v.status],
    title: `${v.name} ${v.status === "down" ? "nie działa" : "– degradacja"}`, text: `${esc(v.component)}. ${esc(v.note)}`, minsAgo: v.sinceMin ?? (parseInt(v.since) || 1) }));
  if (d.player && d.player.bitrate < BITRATE_MIN) out.push({
    id: "player-bitrate-low", source: { kind: "channel", name: "Player" }, level: "warn", title: "Player: niski bitrate",
    text: `Średni bitrate ${d.player.bitrate} Mbps (próg ${BITRATE_MIN} Mbps).`, minsAgo: 6 });
  if (d.player && d.player.errors > ERRORS_MAX) out.push({
    id: "player-errors-high", source: { kind: "channel", name: "Player" }, target: { page: "pages/player.html", selector: "#pl-errors" }, level: "crit", title: "Player: wysoki odsetek błędów",
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

// Pole „Szukaj w historii" nie może tracić kursora przy przerysowaniu listy (odświeżanie co kilka sekund)
function captureSearchFocus() {
  const a = document.activeElement, k = a && a.dataset && a.dataset.hsearch;
  if (!k) return () => {};
  const pos = a.selectionStart;
  return () => {
    const el = document.querySelector(`[data-hsearch="${CSS.escape(k)}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* typ pola bez zaznaczenia */ } }
  };
}

function renderVendors() {
  const restoreFocus = captureSearchFocus();
  const v = appData.vendors || [], dg = diagnose(appData);
  if ($("verdict-box")) $("verdict-box").innerHTML =
    `<div class="verdict ${dg.level}"><div class="verdict-title">${dg.title}</div><div>${dg.text}</div></div>`;
  if ($("verdict-line")) $("verdict-line").innerHTML =
    `<a class="verdict-line ${dg.level}" href="${link("pages/vendors.html")}"><span class="navdot ${dg.level}"></span><b>Diagnoza:</b> ${dg.title}</a>`;
  if ($("vendors-grid")) $("vendors-grid").innerHTML = `<ul class="vlist">` + sortVendors(v).map(x => {
    const l = STATUS_LEVEL[x.status], open = vendorOpen.has(x.name), n = (x.outages || []).length;
    return `<li class="item vrow clickable" data-vendor="${esc(x.name)}" tabindex="0" aria-expanded="${open}">
      <div class="main">${alertBadge({ source: { kind: "vendor", name: x.name }, level: l }, 22)} <b>${esc(x.name)}</b> <span class="muted small">${esc(x.component)}</span>
        <div class="small">${n ? `<b class="${l}">${plProblems(n)}</b> · ` : ""}${esc(x.note)}${x.since !== "—" ? ` <span class="muted">(od ${x.since})</span>` : ""}</div></div>
      <span class="badge ${l}">${STATUS_LABEL[x.status]}</span>
      <span class="chev" aria-hidden="true">${open ? "▴" : "▾"}</span>
      ${open ? `<div class="detail">${vendorProblemsHtml(x)}${vendorHistoryHtml(x)}</div>` : ""}</li>`;
  }).join("") + `</ul>`;
  const withProblems = v.filter(x => (x.outages || []).length).length;
  setText("vendors-summary", withProblems ? `${withProblems} z aktywnymi problemami` : "brak aktywnych problemów");
  if ($("vendor-impact")) $("vendor-impact").innerHTML = v.map(x => {
    const l = STATUS_LEVEL[x.status];
    return `<tr><td>${x.name}</td><td><span class="badge ${l}">${STATUS_LABEL[x.status]}</span></td><td>${x.affects.join(", ")}</td><td>${isBadStatus(x.status) ? "Możliwy wpływ na te usługi" : x.status === "unknown" ? "Brak danych" : "—"}</td></tr>`;
  }).join("");
  if ($("vendor-our-signals")) {
    const s = ourSignals(appData);
    $("vendor-our-signals").innerHTML = s.length ? s.map(t => `<li class="warn">${t}</li>`).join("") : `<li class="ok">Nasze metryki w normie</li>`;
  }
  restoreFocus();
}

// ===== Kliknięcie w powiadomienie: przejście na stronę, wycentrowanie i podświetlenie elementu =====
function alertTarget(a) {
  if (a.target) return a.target;
  const s = a.source;
  if (!s) return null;
  if (s.kind === "vendor") return { page: "pages/vendors.html", selector: `[data-vendor="${s.name}"]` };
  if (s.kind === "channel") {
    if (_chNorm(s.name) === "player") return { page: "pages/player.html", selector: "#pl-bitrate" };
    return { page: "index.html", selector: `[data-ch="${s.name}"]` };
  }
  return null;
}

function focusElement(selector, tries = 30) {
  const el = document.querySelector(selector);
  if (!el) { if (tries > 0) setTimeout(() => focusElement(selector, tries - 1), 100); return; }   // dane mogą dojść asynchronicznie
  const box = el.closest(".cal-day, li.item, .card, .ch, tr") || el;
  box.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  box.classList.remove("pw-highlight"); void box.offsetWidth;   // restart animacji
  box.classList.add("pw-highlight");                            // 3 mignięcia × 0,5 s = 1,5 s
  setTimeout(() => box.classList.remove("pw-highlight"), 1500);
}

function openAlert(a) {
  setRead([...new Set([...getRead(), a.id])]); renderNotifs();
  $("notif-panel").hidden = true;
  const t = alertTarget(a);
  if (!t) return;
  const url = new URL(ROOT + t.page, location.href);
  if (url.pathname === location.pathname) focusElement(t.selector);
  else { sessionStorage.setItem("pw_focus", t.selector); navigateTo(url.href); }
}

const openAlertFromClick = e => {
  const row = e.target.closest("[data-id]");
  const a = row && allAlerts().find(x => x.id === row.dataset.id);
  if (a) { e.preventDefault(); openAlert(a); }
};
$("notif-list").addEventListener("click", openAlertFromClick);
if ($("attention-list")) $("attention-list").addEventListener("click", openAlertFromClick);

// ===== KPI na Przeglądzie: kolor = status =====
// Ryzyko: zielone <30%, pomarańczowe 30–79%, czerwone ≥80%. Alerty: czerwone gdy > 0.
// Event: kolor płynnie od chłodnego (niebieski, ≥ 6 h do startu) przez zielony i żółty do czerwonego (start).
const KPI_COLOR = { ok: "var(--ok)", warn: "var(--warn)", crit: "var(--crit)" };
const EVENT_HORIZON_MS = 6 * 3600e3;
let eventTimer;

// Ikony statusów: ok = zielone kółko, watch = żółta lornetka (wymaga uwagi), crit = czerwony wykrzyknik
const KPI_ICON = { ok: "ico-ok", watch: "ico-watch", crit: "ico-crit" };

function setKpi(id, color, icon, text) {
  const card = $("kpi-card-" + id);
  if (!card) return;
  card.style.setProperty("--kc", color);
  const s = card.querySelector(".kpi-status");
  if (s) s.innerHTML = (icon ? `<i class="ico ${KPI_ICON[icon]}"></i>` : "") + (text || "");
}

function eventColor(msLeft) {
  const t = Math.min(1, Math.max(0, msLeft / EVENT_HORIZON_MS));   // 1 = daleko, 0 = start
  return `hsl(${Math.round(t * 205)} 85% var(--ev-l, 45%))`;                    // 205° niebieski → 0° czerwony
}

function renderKpis(k) {
  const rl = k.risk >= 80 ? "crit" : k.risk >= 30 ? "warn" : "ok";
  setKpi("risk", KPI_COLOR[rl], { crit: "crit", warn: "watch", ok: "ok" }[rl], { crit: "KRYTYCZNE", warn: "PODWYŻSZONE", ok: "NISKIE" }[rl]);
  setKpi("alerts", KPI_COLOR[k.alerts > 0 ? "crit" : "ok"], k.alerts > 0 ? "crit" : "ok", k.alerts > 0 ? "DO REAKCJI" : "BRAK");
  // MTTD: do 10 min w normie, do 20 min wymaga uwagi, powyżej – krytyczne
  const ml = k.mttd <= 10 ? "ok" : k.mttd <= 20 ? "warn" : "crit";
  setKpi("mttd", KPI_COLOR[ml], { ok: "ok", warn: "watch", crit: "crit" }[ml], { ok: "W NORMIE", warn: "WYMAGA UWAGI", crit: "ZA DŁUGO" }[ml]);

  clearInterval(eventTimer);
  if (!k.eventAt) { setText("kpi-event", "—"); setKpi("event", "var(--muted)", null, ""); return; }
  setText("kpi-event-sub", k.eventName || "czas do startu");
  const at = new Date(k.eventAt).getTime(), pad = n => String(n).padStart(2, "0");
  const tick = () => {
    const ms = at - Date.now(), abs = Math.abs(ms);
    setText("kpi-event", ms > 0 ? `${pad(Math.floor(abs / 3600e3))}:${pad(Math.floor(abs % 3600e3 / 60000))}:${pad(Math.floor(abs % 60000 / 1000))}` : "TRWA");
    const col = ms > 0 ? eventColor(ms) : "var(--crit)";
    if (ms <= 0) setKpi("event", col, "crit", "NA ŻYWO");
    else if (ms < 3600e3) setKpi("event", col, "watch", "< 1 H");
    else if (ms < 2 * 3600e3) setKpi("event", col, "watch", "WKRÓTCE");
    else setKpi("event", col, "ok", "> 2 H");
    const bar = $("kpi-event-bar");
    if (bar) { bar.style.width = (100 - Math.min(100, Math.max(0, ms / EVENT_HORIZON_MS * 100))) + "%"; bar.style.background = col; }
  };
  tick(); eventTimer = setInterval(tick, 1000);
}

// ===== Historia vendora: statusy serwisów (komponentów) i ostatnie incydenty – rozwijane w kafelku =====
const autoOpened = new Set();   // vendorzy rozwinięci automatycznie z powodu aktywnego problemu
const compOpen = new Set();     // vendorzy z rozwiniętą sekcją „Serwisy"
const vendorOpen = new Set();   // nazwy vendorów z rozwiniętą historią (przetrwa odświeżanie co 60 s)
const COMP_STATUS = {
  operational: ["ok", "Działa"], degraded_performance: ["warn", "Degradacja"], partial_outage: ["warn", "Częściowa awaria"],
  major_outage: ["crit", "Awaria"], under_maintenance: ["unk", "Prace serwisowe"]
};
const IMPACT_LABEL = { none: ["ok", "Bez wpływu"], minor: ["warn", "Niski wpływ"], major: ["crit", "Wysoki wpływ"], critical: ["crit", "Krytyczny"], maintenance: ["unk", "Prace serwisowe"] };
const INC_STATUS = { resolved: "Rozwiązany", investigating: "Badany", identified: "Zidentyfikowany", monitoring: "Monitorowany", postmortem: "Podsumowanie", update: "Aktualizacja", scheduled: "Zaplanowany", in_progress: "W toku", completed: "Zakończony" };
const fmtDate = iso => new Date(iso).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" });

// ----- Historia incydentów jako oś czasu (wspólna dla dostawców i Downdetectora) -----
const HIST_STEP = 8;      // ile wpisów pokazujemy na raz; „Pokaż starsze" dokłada kolejne
const histShown = {};     // klucz (vendor / serwis) → liczba pokazanych wpisów
const MONTHS_PL = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const clip = (s, n) => { s = String(s || "").replace(/[#*_`]/g, "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).trimEnd() + "…" : s; };

// incidents: [{ name, impact, status, created, resolved, desc }] – od najnowszych
function timelineHtml(incidents, shown) {
  let month = "", html = "";
  incidents.slice(0, shown).forEach(i => {
    const d = new Date(i.created), m = `${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
    if (m !== month) { month = m; html += `<div class="tl-month">${m}</div>`; }
    const [l, t] = IMPACT_LABEL[i.impact] || ["unk", i.impact || "—"];
    const ongoing = !i.resolved && ["investigating", "identified", "monitoring", "in_progress"].includes(i.status);
    const dur = i.resolved ? fmtMins(Math.max(1, Math.round((new Date(i.resolved) - d) / 60000))) : "";
    html += `<div class="tl-item ${l}${ongoing ? " ongoing" : ""}">
      <div class="tl-head"><time>${d.toLocaleString(LOCALE, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
        <span class="badge ${l}">${t}</span>
        ${ongoing ? '<span class="tl-live">trwa</span>' : `<span class="tl-state">${INC_STATUS[i.status] || esc(i.status)}${dur ? ` · trwał ${dur}` : ""}</span>`}</div>
      <div class="tl-title">${esc(i.name)}</div>
      ${i.desc ? `<div class="tl-desc">${esc(clip(i.desc, 320))}</div>` : ""}</div>`;
  });
  return html;
}

// Sekcja historii z przyciskiem „Pokaż starsze" i linkiem do pełnej historii u źródła
const histQuery = {};     // klucz (vendor / serwis) → tekst wpisany w „Szukaj w historii"
const histSearchOpen = new Set();   // klucze z rozwiniętym polem szukania (domyślnie schowane pod lupką)

// Lupka przy „Historia incydentów": pokazuje pole szukania i ustawia w nim kursor; ponowne kliknięcie chowa je i czyści filtr
function toggleHistSearch(key, render) {
  if (histSearchOpen.has(key) || histQuery[key]) { histSearchOpen.delete(key); delete histQuery[key]; render(); return; }
  histSearchOpen.add(key); render();
  const el = document.querySelector(`[data-hsearch="${CSS.escape(key)}"]`);
  if (el) el.focus();
}

function historySectionHtml(key, incidents, fullUrl, fullLabel) {
  const q = norm((histQuery[key] || "").trim());
  const list = q ? incidents.filter(i => norm(`${i.name} ${i.desc || ""} ${fmtDate(i.created)}`).includes(q)) : incidents;
  const total = list.length, shown = Math.min(histShown[key] || HIST_STEP, total), rest = total - shown;
  const open = histSearchOpen.has(key) || !!q;
  return `<h4 class="hist-head">Historia incydentów <span class="tl-count">${q ? `${total} z ${incidents.length} pasuje` : `${shown} z ${total}`}</span>${incidents.length
      ? `<button class="icon-btn${open ? " on" : ""}" data-hs-toggle="${esc(key)}" title="Szukaj w historii" aria-label="Szukaj w historii" aria-expanded="${open}">${SEARCH_SVG}</button>` : ""}</h4>
    ${incidents.length && open ? `<input type="search" class="hist-search" data-hsearch="${esc(key)}" value="${esc(histQuery[key] || "")}" placeholder="Szukaj w historii (nazwa, opis, data)…" autocomplete="off">` : ""}
    ${total ? `<div class="timeline">${timelineHtml(list, shown)}</div>` : `<div class="muted small">${q ? "Brak zdarzeń pasujących do zapytania." : "Brak zdarzeń w historii."}</div>`}
    <div class="hist-actions">${rest > 0 ? `<button class="more-btn" data-more="${esc(key)}">Pokaż starsze (+${Math.min(HIST_STEP, rest)})</button>` : ""}
      ${fullUrl ? `<a class="link-small" href="${esc(fullUrl)}" target="_blank" rel="noopener">${fullLabel} ↗</a>` : ""}</div>`;
}

function vendorHistoryHtml(v) {
  const h = v.history;
  if (!h || h.loading) return `<div class="muted small">Ładowanie historii…</div>`;
  if (h.error) return `<div class="muted small">${esc(h.error)}</div><div class="hist-actions"><a class="link-small" href="${esc(v.statusUrl)}" target="_blank" rel="noopener">Strona statusu vendora ↗</a></div>`;
  const bad = h.components.filter(c => c.status !== "operational"), good = h.components.filter(c => c.status === "operational");
  const row = c => { const [l, t] = COMP_STATUS[c.status] || ["unk", c.status]; return `<tr><td title="${esc(c.note)}">${esc(c.name)}</td><td><span class="badge ${l}">${t}</span></td></tr>`; };
  const shown = [...bad, ...good.slice(0, Math.max(0, 10 - bad.length))];
  const rest = h.components.length - shown.length;
  const compOpenNow = compOpen.has(v.name);   // sekcja „Serwisy" jest zwijana (domyślnie zwinięta)
  return `${h.components.length ? `<h4 class="sub-toggle" data-sub="${esc(v.name)}" role="button" tabindex="0" aria-expanded="${compOpenNow}"><span class="chev">${compOpenNow ? "▴" : "▾"}</span> ${h.componentsTitle || "Serwisy"}: ${bad.length} z problemami, ${good.length} działa</h4>
    ${compOpenNow ? `<table class="vh-table"><tbody>${shown.map(row).join("")}</tbody></table>
    ${rest > 0 ? `<div class="muted small">…i ${rest} więcej (pełna lista na stronie statusu)</div>` : ""}` : ""}` : (h.note ? `<div class="muted small">${esc(h.note)}</div>` : "")}
    ${historySectionHtml(v.name, h.incidents, h.historyUrl || v.statusUrl, "Pełna historia u vendora")}`;
}

async function statuspageHistory(src) {
  const [sum, inc] = await Promise.all([fetchJson(src.base + "/api/v2/summary.json"), fetchJson(src.base + "/api/v2/incidents.json")]);
  return {
    historyUrl: src.base + "/history",
    components: (sum.components || []).filter(c => !c.group).map(c => ({ name: c.name, status: c.status })),
    incidents: (inc.incidents || []).slice(0, 50).map(i => ({ name: i.name, impact: i.impact, status: i.status, created: i.created_at, resolved: i.resolved_at,
      desc: stripHtml(((i.incident_updates || [])[0] || {}).body) }))
  };
}

async function awsHistory(src) {
  const r = await fetchSmart(src.url, { cache: "no-store" });
  const xml = new DOMParser().parseFromString(await r.text(), "text/xml");
  const items = [...xml.querySelectorAll("item")].map(it => {
    const guid = it.querySelector("guid")?.textContent || "";
    const key = (guid.split("#")[1] || guid).replace(/_\d+$/, "");
    return { key, title: it.querySelector("title")?.textContent || "", ts: new Date(it.querySelector("pubDate")?.textContent).getTime(),
      desc: stripHtml(it.querySelector("description")?.textContent), monitored: src.regions.some(rg => key.includes(rg)) };
  }).sort((a, b) => b.ts - a.ts);
  const latest = new Map();
  items.forEach(e => { if (!latest.has(e.key)) latest.set(e.key, e); });
  const sev = e => /operating normally|informational/i.test(e.title) ? "operational" : /disruption/i.test(e.title) ? "major_outage" : "degraded_performance";
  return {
    historyUrl: "https://health.aws.amazon.com/health/status",
    componentsTitle: "Regiony/usługi z ostatnich zdarzeń",
    components: [...latest.values()].map(e => ({ name: e.key + (e.monitored ? " ★" : ""), status: sev(e), note: e.title })),
    incidents: items.slice(0, 50).map(e => ({ name: `${e.key}: ${e.title}`, impact: { operational: "none", major_outage: "major", degraded_performance: "minor" }[sev(e)], status: "update", created: new Date(e.ts).toISOString(), resolved: null, desc: e.desc }))
  };
}

async function loadVendorHistory(v) {
  const src = VENDOR_SOURCES[v.name];
  if (!v.history) v.history = { loading: true };
  if (!src || src.type === "none") { v.history = { error: (src && src.note) || "Brak źródła historii." }; return; }
  try {
    v.history = src.type === "aws-rss" ? await awsHistory(src)
      : src.type === "statuspage" ? await statuspageHistory(src)
      : await feedHistory(src);
  } catch (e) {
    v.history = { error: /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? "Nie udało się pobrać historii z przeglądarki (blokada CORS lub brak sieci) – wymaga proxy po stronie serwera." : `Błąd pobierania historii: ${e.message}` };
  }
}

// ===== Płynne rozwijanie i zwijanie list =====
// Listy są przerysowywane w całości, więc animujemy wysokość panelu tuż po przerysowaniu (albo tuż przed zwinięciem).
const REDUCE_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLLAPSED = { height: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 };

// płynna zmiana wysokości panelu z fromH (0 = rozwijanie od zera) do jego nowej wysokości
function animateResize(el, fromH) {
  if (!el || REDUCE_MOTION) return;
  const toH = el.offsetHeight;
  if (Math.abs(toH - fromH) < 2) return;
  el.style.overflow = "hidden";
  const done = () => { el.style.overflow = ""; };
  el.animate([fromH === 0 ? COLLAPSED : { height: fromH + "px" }, { height: toH + "px" }], { duration: 280, easing: "ease" }).finished.then(done, done);
}

// płynne zwinięcie panelu; done() zmienia stan i przerysowuje listę (wywoływane też, gdy animacja zostanie przerwana)
function animateClose(el, done) {
  if (!el || REDUCE_MOTION) { done(); return; }
  el.style.overflow = "hidden";
  el.animate([{ height: el.offsetHeight + "px" }, COLLAPSED], { duration: 220, easing: "ease" }).finished.then(done, done);
}

// selektor panelu szczegółów danego wiersza listy
const detailSel = li => li.dataset.vendor
  ? `li[data-vendor="${CSS.escape(li.dataset.vendor)}"] > .detail`
  : `li[data-id="${CSS.escape(li.dataset.id)}"] > .detail`;

// przerysowanie z płynną zmianą wysokości panelu (zwijane sekcje, „Pokaż starsze", pole szukania, doczytana historia)
function renderResized(root, sel, render) {
  const el = sel ? root.querySelector(sel) : null, h = el ? el.offsetHeight : 0;
  render();
  if (sel) animateResize(root.querySelector(sel), h);
}

// rozwinięcie / zwinięcie wiersza; zwraca true, gdy wiersz został rozwinięty
function toggleRow(root, li, isOpen, setOpen, render) {
  const sel = detailSel(li);
  if (isOpen()) { animateClose(root.querySelector(sel), () => { setOpen(false); render(); }); return false; }
  setOpen(true); render(); animateResize(root.querySelector(sel), 0);
  return true;
}

const vendorsGridEl = $("vendors-grid");
// Cały wiersz dostawcy jest klikalny (poza rozwiniętym panelem); wszystko startuje zwinięte
async function toggleVendor(li) {
  const name = li.dataset.vendor, v = (appData.vendors || []).find(x => x.name === name);
  if (!v) return;
  const opened = toggleRow(vendorsGridEl, li, () => vendorOpen.has(name), on => on ? vendorOpen.add(name) : vendorOpen.delete(name), renderVendors);
  if (opened && !v.history) { await loadVendorHistory(v); renderResized(vendorsGridEl, detailSel(li), renderVendors); }   // historia doczytana – panel płynnie rośnie
}
if (vendorsGridEl) {
  const toggleSub = el => { const n = el.dataset.sub; compOpen.has(n) ? compOpen.delete(n) : compOpen.add(n); renderVendors(); };
  const panelOf = t => { const li = t.closest("li.item"); return li ? detailSel(li) : null; };
  vendorsGridEl.addEventListener("click", e => {
    const sub = e.target.closest("[data-sub]");
    if (sub) { renderResized(vendorsGridEl, panelOf(sub), () => toggleSub(sub)); return; }
    const hs = e.target.closest("[data-hs-toggle]");   // lupka: pokaż / schowaj szukanie w historii
    if (hs) { renderResized(vendorsGridEl, panelOf(hs), () => toggleHistSearch(hs.dataset.hsToggle, renderVendors)); return; }
    const more = e.target.closest("[data-more]");   // „Pokaż starsze" w historii incydentów
    if (more) { renderResized(vendorsGridEl, panelOf(more), () => { histShown[more.dataset.more] = (histShown[more.dataset.more] || HIST_STEP) + HIST_STEP; renderVendors(); }); return; }
    if (e.target.closest("a") || e.target.closest(".detail")) return;
    const li = e.target.closest(".vrow");
    if (li) toggleVendor(li);
  });
  vendorsGridEl.addEventListener("input", e => {   // „Szukaj w historii"
    const s = e.target.closest("[data-hsearch]");
    if (s) { histQuery[s.dataset.hsearch] = s.value; renderVendors(); }
  });
  vendorsGridEl.addEventListener("keydown", e => {
    if (e.key === "Escape" && e.target.dataset && e.target.dataset.hsearch) { renderResized(vendorsGridEl, panelOf(e.target), () => toggleHistSearch(e.target.dataset.hsearch, renderVendors)); return; }
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.dataset && e.target.dataset.sub) { e.preventDefault(); renderResized(vendorsGridEl, panelOf(e.target), () => toggleSub(e.target)); }
    else if (e.target.classList.contains("vrow")) { e.preventDefault(); toggleVendor(e.target); }
  });
}
// Historia dla źródeł bez listy komponentów: Google Cloud (ostatnie incydenty) i Azure (RSS zawiera tylko aktywne)
async function feedHistory(src) {
  if (src.type === "gcp-json") {
    const all = await fetchJson(src.url);
    return { components: [], historyUrl: "https://status.cloud.google.com/summary", incidents: all.slice(0, 50).map(i => ({
      name: `${(i.affected_products || []).map(p => p.title).slice(0, 2).join(", ") || i.service_name || "GCP"}: ${i.external_desc}`,
      impact: { SERVICE_OUTAGE: "critical", SERVICE_DISRUPTION: "minor", SERVICE_INFORMATION: "none" }[i.status_impact] || "none",
      status: i.end ? "resolved" : "investigating", created: i.begin, resolved: i.end || null,
      desc: i.most_recent_update && i.most_recent_update.text })) };
  }
  return { components: [], historyUrl: "https://azure.status.microsoft/en-us/status/history/", note: "Kanał RSS Azure zawiera tylko aktywne incydenty – starsze są na stronie historii Azure.", incidents: [] };
}

// ===== Dostawcy z aktywnymi problemami (jedna lista; problemy w rozwijanym panelu każdego dostawcy) =====
const OUT_LABEL = { down: ["crit", "Nie działa"], degraded: ["warn", "Degradacja"] };
const plProblems = n => `${n} ${n === 1 ? "aktywny problem" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "aktywne problemy" : "aktywnych problemów"}`;
// Kolejność alfabetyczna (po polsku, bez rozróżniania wielkości liter)
function sortVendors(vs) {
  return [...vs].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

function vendorProblemsHtml(v) {
  const list = v.outages || [];
  if (!list.length) return `<div class="muted small"><i class="ico ico-ok"></i> Brak aktywnych problemów.</div>`;
  return `<h4>Aktywne problemy (${list.length})</h4>` + list.map(p => {
    const [l, t] = OUT_LABEL[p.status] || ["unk", p.status];
    return `<div class="prob ${l}"><div class="prob-head"><span class="badge ${l}">${t}</span> <b>${esc(p.service)}</b>${p.ours ? ' <span class="badge ok">nasz region</span>' : ""}
      <span class="muted small">od ${fmtDate(p.since)} (${fmtMins(minsSince(p.since))} temu)</span></div>
      <div class="muted small">${esc(p.title)}</div>
      <div class="out-desc">${esc(p.description)}</div>
      <a class="link-small" href="${esc(p.url)}" target="_blank" rel="noopener">Otwórz u vendora ↗</a></div>`;
  }).join("");
}

// ===== Status vendorów pobierany na żywo z oficjalnych źródeł =====
// Statuspage (Akamai, Snowflake, Cloudflare): /api/v2/status.json; AWS: publiczny RSS status.aws.amazon.com.
// Uwaga: przeglądarka pobierze dane tylko ze źródeł z nagłówkiem CORS (Akamai, Snowflake, AWS).
// Cloudflare nie ma CORS na API statusu, a status.okta.com wymaga logowania – wtedy status = „Brak danych".
const USE_LIVE_VENDORS = true;
const VENDOR_REFRESH_MS = 60000;
const VENDOR_SOURCES = {
  AWS:        { type: "aws-rss", url: "https://status.aws.amazon.com/rss/all.rss", regions: ["eu-central-1", "eu-west-1", "global"] },
  Microsoft:  { type: "azure-rss", url: "https://azure.status.microsoft/en-us/status/feed/", page: "https://azure.status.microsoft/en-us/status/" },
  "Google Cloud": { type: "gcp-json", url: "https://status.cloud.google.com/incidents.json", page: "https://status.cloud.google.com/" },
  Akamai:     { type: "statuspage", base: "https://www.akamaistatus.com" },
  Cloudflare: { type: "statuspage", base: "https://www.cloudflarestatus.com" },
  Snowflake:  { type: "statuspage", base: "https://status.snowflake.com" },
  Okta:       { type: "none", note: "Brak publicznego API statusu (status.okta.com wymaga logowania) – użyj własnych health-checków." }
};
const SP_MAP = { none: "ok", maintenance: "ok", minor: "degraded", major: "down", critical: "down" };
const minsSince = t => Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000));
const fmtMins = m => m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`;

// Pobieranie: gdy strona działa przez lokalny serwer (server.ps1 / start-server.cmd), idzie przez jego proxy (/proxy?u=…),
// co omija blokadę CORS (Cloudflare, Microsoft). Przy otwarciu z dysku (file://) – bezpośrednio, tylko źródła z CORS.
const proxyAvailable = location.protocol.startsWith("http")
  ? fetch("/proxy?ping=1").then(r => r.ok).catch(() => false)
  : Promise.resolve(false);

async function fetchSmart(url, opts) {
  const viaProxy = await proxyAvailable;
  const r = await fetch(viaProxy ? "/proxy?u=" + encodeURIComponent(url) : url, opts);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r;
}

async function fetchJson(url) { return (await fetchSmart(url, { cache: "no-store" })).json(); }

async function liveStatuspage(src) {
  const [s, inc] = await Promise.all([
    fetchJson(src.base + "/api/v2/status.json"),
    fetchJson(src.base + "/api/v2/incidents/unresolved.json").catch(() => ({ incidents: [] }))
  ]);
  const status = SP_MAP[s.status.indicator] || "unknown";
  const incs = (inc.incidents || []).filter(i => i.impact !== "none");   // pomijamy komunikaty bez wpływu na działanie
  let note = s.status.description, sinceMin = null;
  if (status !== "ok" && incs.length) { note += " – " + incs[0].name; sinceMin = minsSince(incs[0].created_at); }
  // Gdy vendor deklaruje „wszystko działa", otwarte wpisy to komunikaty (np. porady bezpieczeństwa), a nie awarie – zostają tylko w historii
  const outages = status === "ok" ? [] : incs.map(i => ({
    service: i.components && i.components.length ? i.components.slice(0, 3).map(c => c.name).join(", ") + (i.components.length > 3 ? ` +${i.components.length - 3}` : "") : i.name,
    title: i.name, status: i.impact === "minor" ? "degraded" : "down", since: i.created_at,
    description: (i.incident_updates || []).map(u => `[${fmtDate(u.created_at)}] ${T(INC_STATUS[u.status] || u.status)}: ${stripHtml(u.body)}`).join("\n\n") || i.name,
    url: i.shortlink || src.base
  }));
  return { status, note, sinceMin, outages };
}

// Azure: kanał RSS zawiera tylko aktywne incydenty (pusty = brak problemów)
async function liveAzure(src) {
  const xml = new DOMParser().parseFromString(await (await fetchSmart(src.url, { cache: "no-store" })).text(), "text/xml");
  const outages = [...xml.querySelectorAll("item")].map(it => {
    const title = it.querySelector("title")?.textContent || "Incydent Azure";
    const desc = stripHtml(it.querySelector("description")?.textContent);
    return { service: title, title, status: /outage|unavailable|down\b/i.test(title + desc) ? "down" : "degraded",
      since: new Date(it.querySelector("pubDate")?.textContent.replace(/ Z$/, " GMT")).toISOString(), description: desc || title,
      url: it.querySelector("link")?.textContent || src.page };
  });
  const status = outages.some(o => o.status === "down") ? "down" : outages.length ? "degraded" : "ok";
  return { status, note: outages.length ? outages.map(o => o.title).join("; ") : "Brak aktywnych incydentów Azure.",
    sinceMin: outages.length ? minsSince(Math.min(...outages.map(o => new Date(o.since)))) : null, outages };
}

// Google Cloud: incidents.json – aktywny incydent = brak pola `end`
async function liveGcp(src) {
  const all = await fetchJson(src.url);
  const outages = all.filter(i => !i.end && i.status_impact !== "SERVICE_INFORMATION").map(i => ({
    service: (i.affected_products || []).map(p => p.title).slice(0, 3).join(", ") || i.service_name || "Google Cloud",
    title: i.external_desc, status: i.status_impact === "SERVICE_OUTAGE" ? "down" : "degraded", since: i.begin,
    description: (i.most_recent_update && i.most_recent_update.text) || i.external_desc, url: `https://status.cloud.google.com/incidents/${i.id}`
  }));
  const status = outages.some(o => o.status === "down") ? "down" : outages.length ? "degraded" : "ok";
  return { status, note: outages.length ? outages.map(o => o.title).join("; ") : "Brak aktywnych incydentów Google Cloud.",
    sinceMin: outages.length ? minsSince(Math.min(...outages.map(o => new Date(o.since)))) : null, outages };
}

// AWS: RSS ze wszystkimi regionami. Do tabeli problemów trafiają wszystkie aktywne zdarzenia (72 h),
// status vendora liczymy tylko z regionów, z których korzystamy (src.regions).
async function liveAws(src) {
  const xml = new DOMParser().parseFromString(await (await fetchSmart(src.url, { cache: "no-store" })).text(), "text/xml");
  const items = [...xml.querySelectorAll("item")].map(it => {
    const guid = it.querySelector("guid")?.textContent || "";
    const key = (guid.split("#")[1] || guid).replace(/_\d+$/, "");
    return { key, title: it.querySelector("title")?.textContent || "", ts: new Date(it.querySelector("pubDate")?.textContent).getTime(),
      desc: stripHtml(it.querySelector("description")?.textContent), ours: src.regions.some(rg => key.includes(rg)) };
  }).sort((a, b) => b.ts - a.ts);
  const byKey = new Map();
  items.forEach(e => byKey.has(e.key) ? byKey.get(e.key).push(e) : byKey.set(e.key, [e]));
  const outages = [];
  byKey.forEach((list, key) => {
    const cur = list[0];   // najnowsza aktualizacja danego regionu/usługi
    if (/operating normally/i.test(cur.title) || Date.now() - cur.ts > 72 * 3600e3) return;
    let start = cur.ts;    // początek = najstarsza aktualizacja przed ostatnim „operating normally"
    for (const e of list) { if (e !== cur && /operating normally/i.test(e.title)) break; start = e.ts; }
    outages.push({ service: key, title: cur.title, status: /disruption/i.test(cur.title) ? "down" : /informational/i.test(cur.title) ? "info" : "degraded",
      since: new Date(start).toISOString(), ours: cur.ours, url: "https://health.aws.amazon.com/health/status",
      description: list.slice(0, 4).map(e => `[${fmtDate(e.ts)}] ${e.title}\n${e.desc}`).join("\n\n") });
  });
  const mine = outages.filter(o => o.ours && o.status !== "info");
  const status = mine.some(o => o.status === "down") ? "down" : mine.length ? "degraded" : "ok";
  return {
    status,
    note: mine.length ? mine.map(o => `${o.service}: ${o.title}`).join("; ") : `Brak aktywnych zdarzeń w regionach: ${src.regions.join(", ")}.`,
    sinceMin: mine.length ? minsSince(Math.min(...mine.map(o => new Date(o.since)))) : null,
    outages: outages.filter(o => o.status !== "info")
  };
}

async function refreshVendor(v) {
  const src = VENDOR_SOURCES[v.name];
  if (!src || src.type === "none") { v.status = "unknown"; v.note = (src && src.note) || "Brak źródła statusu."; v.outages = []; return; }
  try {
    const r = src.type === "aws-rss" ? await liveAws(src) : src.type === "azure-rss" ? await liveAzure(src) : src.type === "gcp-json" ? await liveGcp(src) : await liveStatuspage(src);
    Object.assign(v, { status: r.status, note: r.note, sinceMin: r.sinceMin, since: r.sinceMin != null ? fmtMins(r.sinceMin) : "—", checked: Date.now(), outages: r.outages || [] });
  } catch (e) {
    v.status = "unknown"; v.checked = null; v.sinceMin = null; v.since = "—"; v.outages = [];
    v.note = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? "Nie udało się pobrać statusu (blokada CORS lub brak sieci). Uruchom stronę przez start-server.cmd, aby użyć lokalnego proxy." : `Błąd pobierania statusu: ${e.message}`;
  }
}

async function refreshVendors() {
  const vs = appData.vendors;
  if (!vs) return;
  await Promise.all(vs.map(refreshVendor));
  await Promise.all(vs.filter(v => vendorOpen.has(v.name)).map(loadVendorHistory));   // odśwież rozwiniętą historię
  setText("last-update", new Date().toLocaleString(LOCALE));
  renderVendors(); updateNavDots(); renderNotifs();
}

// Przed pierwszym pobraniem usuń dane przykładowe vendorów (dostępność/latency nie są dostępne ze stron statusu)
function resetVendorsForLive() {
  (mock.vendors || []).forEach(v => Object.assign(v, { status: "unknown", availability: null, latencyMs: null, baselineMs: null, uptime: null, since: "—", sinceMin: null, checked: null, outages: [], note: "Pobieranie statusu…" }));
}
if (USE_LIVE_VENDORS) resetVendorsForLive();

renderNotifs();

load();
if (USE_LIVE_VENDORS) { refreshVendors(); setInterval(refreshVendors, VENDOR_REFRESH_MS); }

// Po przejściu z powiadomienia: podświetl element na nowej stronie
const pendingFocus = sessionStorage.getItem("pw_focus");
if (pendingFocus) { sessionStorage.removeItem("pw_focus"); setTimeout(() => focusElement(pendingFocus), 380); }   // po animacji wejścia strony
