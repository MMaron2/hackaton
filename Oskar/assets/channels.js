// Baza ikon kanałów WBD (Polska + międzynarodowe) – nazwa → ikona.
// Domyślnie ikona to generowana plakietka (skrót + kolor). Aby użyć oficjalnego logo,
// wrzuć plik do assets/icons/ i wpisz ścieżkę w polu `logo`, np. logo: "assets/icons/tvn24.svg".
// Oficjalne logotypy należy brać wyłącznie z zatwierdzonych zasobów marki WBD.
const CHANNEL_DB = [
  // id, name, aliases, short (skrót w plakietce), bg, fg, logo
  { id: "tvn",          name: "TVN",                 aliases: ["tvn hd"],                    short: "tvn", bg: "#ffffff", fg: "#0a0a0b", logo: null },
  { id: "tvn24",        name: "TVN24",               aliases: ["tvn 24", "tvn24 hd"],        short: "24",  bg: "#d8232a", fg: "#ffffff", logo: null },
  { id: "tvn24bis",     name: "TVN24 BiS",           aliases: ["tvn24 bis"],                 short: "BiS", bg: "#a81b21", fg: "#ffffff", logo: null },
  { id: "tvn7",         name: "TVN7",                aliases: ["tvn 7"],                     short: "7",   bg: "#f0a30a", fg: "#1a1200", logo: null },
  { id: "ttv",          name: "TTV",                 aliases: [],                            short: "TTV", bg: "#7b3fe4", fg: "#ffffff", logo: null },
  { id: "tvnturbo",     name: "TVN Turbo",           aliases: ["turbo"],                     short: "TU",  bg: "#e8590c", fg: "#ffffff", logo: null },
  { id: "tvnstyle",     name: "TVN Style",           aliases: ["style"],                     short: "ST",  bg: "#d6336c", fg: "#ffffff", logo: null },
  { id: "tvnfabula",    name: "TVN Fabuła",          aliases: ["tvn fabula", "fabula"],      short: "FA",  bg: "#1c7ed6", fg: "#ffffff", logo: null },
  { id: "player",       name: "Player",              aliases: ["player.pl"],                 short: "pl",  bg: "#18e8a4", fg: "#04130d", logo: null },
  { id: "discovery",    name: "Discovery Channel",   aliases: ["discovery"],                 short: "D",   bg: "#0b5cff", fg: "#ffffff", logo: null },
  { id: "tlc",          name: "TLC",                 aliases: [],                            short: "TLC", bg: "#e03131", fg: "#ffffff", logo: null },
  { id: "id",           name: "Investigation Discovery", aliases: ["id", "investigation discovery"], short: "ID", bg: "#862e2e", fg: "#ffffff", logo: null },
  { id: "animalplanet", name: "Animal Planet",       aliases: [],                            short: "AP",  bg: "#2b8a3e", fg: "#ffffff", logo: null },
  { id: "dsci",         name: "Discovery Science",   aliases: ["science"],                   short: "DS",  bg: "#1864ab", fg: "#ffffff", logo: null },
  { id: "hgtv",         name: "HGTV",                aliases: [],                            short: "HG",  bg: "#37b24d", fg: "#04130d", logo: null },
  { id: "foodnetwork",  name: "Food Network",        aliases: ["food"],                      short: "FN",  bg: "#f76707", fg: "#ffffff", logo: null },
  { id: "travel",       name: "Travel Channel",      aliases: ["travel"],                    short: "TC",  bg: "#0c8599", fg: "#ffffff", logo: null },
  { id: "eurosport1",   name: "Eurosport 1",         aliases: ["eurosport", "eurosport1"],   short: "E1",  bg: "#1971c2", fg: "#ffffff", logo: null },
  { id: "eurosport2",   name: "Eurosport 2",         aliases: ["eurosport2"],                short: "E2",  bg: "#1c7ed6", fg: "#ffffff", logo: null },
  { id: "cartoon",      name: "Cartoon Network",     aliases: ["cn"],                        short: "CN",  bg: "#212529", fg: "#ffffff", logo: null },
  { id: "boomerang",    name: "Boomerang",           aliases: [],                            short: "B",   bg: "#4dabf7", fg: "#04223a", logo: null },
  { id: "warnertv",     name: "Warner TV",           aliases: ["warner"],                    short: "W",   bg: "#1d4ed8", fg: "#ffffff", logo: null },
  { id: "tcm",          name: "TCM",                 aliases: ["turner classic movies"],     short: "TCM", bg: "#495057", fg: "#ffffff", logo: null },
  { id: "cnn",          name: "CNN",                 aliases: ["cnn international"],         short: "CNN", bg: "#cc0000", fg: "#ffffff", logo: null },
  { id: "hbomax",       name: "HBO Max",             aliases: ["max", "hbo"],                short: "max", bg: "#5b2bd1", fg: "#ffffff", logo: null }
];

const _chNorm = s => String(s).toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const CHANNEL_INDEX = new Map();
CHANNEL_DB.forEach(c => [c.name, c.id, ...c.aliases].forEach(k => CHANNEL_INDEX.set(_chNorm(k), c)));

// Zwraca rekord kanału po nazwie/aliasie (albo null)
function findChannel(name) { return CHANNEL_INDEX.get(_chNorm(name)) || null; }

// Zwraca HTML ikony do wstawienia obok nazwy. Brak kanału w bazie → neutralna plakietka z inicjałami.
function channelIcon(name, size = 22) {
  const c = findChannel(name);
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (c && c.logo) {
    const root = (typeof ROOT !== "undefined" ? ROOT : "");
    return `<img class="cicon" style="${style}" src="${root}${c.logo}" alt="${c.name}" title="${c.name}">`;
  }
  const short = c ? c.short : String(name).split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase();
  const bg = c ? c.bg : "#3a3b40", fg = c ? c.fg : "#ffffff";
  return `<span class="cicon" style="${style};background:${bg};color:${fg}" title="${c ? c.name : name}">${short}</span>`;
}

// ===== Plakietki powiadomień (panel, toasty, powiadomienia przeglądarki) =====
// Źródło alertu: { kind: "channel" | "vendor", name } – brak źródła → plakietka z poziomem alertu.
const VENDOR_DB = {
  aws:        { short: "aws", bg: "#ff9900", fg: "#1a1200" },
  akamai:     { short: "Ak",  bg: "#0096d6", fg: "#ffffff" },
  cloudflare: { short: "CF",  bg: "#f38020", fg: "#ffffff" },
  snowflake:  { short: "SF",  bg: "#29b5e8", fg: "#04223a" },
  okta:       { short: "OK",  bg: "#007dc1", fg: "#ffffff" },
  microsoft:  { short: "MS",  bg: "#0078d4", fg: "#ffffff" },
  "microsoft azure": { short: "Az", bg: "#0078d4", fg: "#ffffff" },
  "microsoft 365": { short: "365", bg: "#d83b01", fg: "#ffffff" },
  "google cloud": { short: "GC", bg: "#4285f4", fg: "#ffffff" }
};
const LEVEL_BADGE = {
  crit: { short: "!", bg: "#ff5c5c", fg: "#ffffff" },
  warn: { short: "!", bg: "#f5a623", fg: "#1a1200" },
  ok:   { short: "i", bg: "#18e8a4", fg: "#04130d" }
};

function alertBadgeSpec(a) {
  const s = a.source;
  if (s && s.kind === "channel") { const c = findChannel(s.name); if (c) return c; }
  if (s && s.kind === "vendor") { const v = VENDOR_DB[_chNorm(s.name)]; if (v) return v; }
  return LEVEL_BADGE[a.level] || LEVEL_BADGE.ok;
}

// HTML plakietki (panel powiadomień i toasty)
function alertBadge(a, size = 28) {
  if (a.source && a.source.kind === "channel") return channelIcon(a.source.name, size);
  const sp = alertBadgeSpec(a);
  return `<span class="cicon" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${sp.bg};color:${sp.fg}">${sp.short}</span>`;
}

// URL ikony (data: SVG) dla powiadomień przeglądarki – Notification API przyjmuje tylko adres obrazka
function alertIconUrl(a) {
  const sp = alertBadgeSpec(a);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="26" fill="${sp.bg}"/>` +
    `<text x="64" y="64" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI,Arial,sans-serif" font-weight="800" font-size="${sp.short.length > 2 ? 44 : 60}" fill="${sp.fg}">${sp.short}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
