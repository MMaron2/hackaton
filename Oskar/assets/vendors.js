// Strona Vendorzy: zakładki + lista Downdetector z historią statusów (dane SYMULOWANE).
// Aby podłączyć prawdziwe dane, ustaw DD_API na adres backendu zwracającego JSON:
// { "aws": 42, "azure": 20, ... }  – aktualna liczba zgłoszeń per serwis. Historia jest wtedy budowana z kolejnych odczytów.
(function () {
  // ---------- Zakładki ----------
  const tabs = document.querySelectorAll(".tab");
  function showTab(name) {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    $("tab-status").hidden = name !== "status";
    $("tab-dd").hidden = name !== "dd";
    history.replaceState(null, "", name === "dd" ? "#downdetector" : location.pathname + location.search);
    if (name === "dd") renderDd();
  }
  tabs.forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));

  // ---------- Downdetector ----------
  const DD_API = null;      // np. "/api/downdetector"
  const TICK_MS = 3000;
  const SERVICES = [
    { id: "aws", name: "AWS", base: 38 }, { id: "azure", name: "Microsoft Azure", base: 22 },
    { id: "m365", name: "Microsoft 365", base: 64 }, { id: "gcp", name: "Google Cloud", base: 14 },
    { id: "cloudflare", name: "Cloudflare", base: 27 }, { id: "player", name: "Player.pl", base: 19 }
  ];
  const CATS = ["Brak połączenia", "Logowanie", "Strona / aplikacja", "Serwer", "Powolne działanie", "Streaming"];
  const state = {}, ddOpen = new Set();
  let updated = Date.now();

  // Status wg krotności normy: ≥4× możliwa awaria, ≥2× wzrost
  const lvl = (v, base) => v >= base * 4 ? "crit" : v >= base * 2 ? "warn" : "ok";
  const TXT = { ok: "Normalnie", warn: "Wzrost zgłoszeń", crit: "Możliwa awaria" };

  // Epizod = okres podwyższonych zgłoszeń; opis składa się z najczęstszych kategorii problemów (symulowanych)
  function cats() {
    const c = [...CATS].sort(() => Math.random() - 0.5).slice(0, 3), a = Math.round(40 + Math.random() * 25), b = Math.round((100 - a) * 0.55);
    return [[c[0], a], [c[1], b], [c[2], 100 - a - b]];
  }
  const episodeText = (e, base) => `Wyraźny wzrost zgłoszeń użytkowników względem normy. Najczęściej zgłaszane problemy: ${e.cats.map(([n, p]) => `${n} (${p}%)`).join(", ")}.`;

  function nextValue(s, d) {
    let f = 1 + (Math.random() - 0.5) * 0.35;
    if (s.burst > 0) { s.burst--; f += (s.mult - 1) * Math.sin(Math.PI * (1 - s.burst / s.len)); }
    else if (Math.random() < 0.01) { s.len = 14 + Math.floor(Math.random() * 14); s.burst = s.len; s.mult = 3 + Math.random() * 5; }
    return Math.max(0, Math.round(d.base * f));
  }

  // Zapisuje początek, szczyt i koniec epizodu przy zmianie statusu
  function track(d, s, t) {
    const l = lvl(s.v, d.base), cur = s.eps.length && !s.eps[0].end ? s.eps[0] : null;
    if (l !== "ok") {
      if (!cur) s.eps.unshift({ start: t, end: null, level: l, peak: s.v, cats: cats() });
      else { cur.peak = Math.max(cur.peak, s.v); if (l === "crit") cur.level = "crit"; }
    } else if (cur) cur.end = t;
    if (s.eps.length > 80) s.eps.pop();
  }

  // Stan początkowy + przykładowa historia z ostatnich 30 dni
  SERVICES.forEach(d => {
    const s = state[d.id] = { v: d.base, prev: d.base, burst: 0, len: 1, mult: 1, eps: [] };
    const n = 12 + Math.floor(Math.random() * 14);
    for (let i = 0; i < n; i++) {
      const dur = (8 + Math.random() * 35) * 60000, start = Date.now() - (2 + Math.random() * 30 * 24) * 3600e3, ratio = 2.1 + Math.random() * 4.5;
      s.eps.push({ start, end: start + dur, level: ratio >= 4 ? "crit" : "warn", peak: Math.round(d.base * ratio), cats: cats() });
    }
    s.eps.sort((a, b) => b.start - a.start);
  });

  async function tick() {
    const t = Date.now();
    if (DD_API) {
      try { const data = await fetchJson(DD_API); SERVICES.forEach(d => { if (data[d.id] != null) { state[d.id].prev = state[d.id].v; state[d.id].v = data[d.id]; track(d, state[d.id], t); } }); } catch (e) { /* zostaw poprzednie */ }
    } else {
      SERVICES.forEach(d => { const s = state[d.id]; s.prev = s.v; s.v = nextValue(s, d); track(d, s, t); });
    }
    updated = t;
    if (!$("tab-dd").hidden) renderDd();
  }

  // Historia jako wspólna oś czasu (timeline z app.js): pokazuje HIST_STEP wpisów, „Pokaż starsze" dokłada kolejne
  function historyHtml(d) {
    const incidents = state[d.id].eps.map(e => ({
      name: TXT[e.level], impact: e.level === "crit" ? "major" : "minor", status: e.end ? "resolved" : "investigating",
      created: e.start, resolved: e.end, desc: episodeText(e, d.base)
    }));
    return historySectionHtml("dd:" + d.id, incidents, "https://downdetector.pl/", "Pełna historia w Downdetector");
  }

  function renderDd() {
    $("dd-updated").textContent = "· aktualizacja " + new Date(updated).toLocaleTimeString("pl-PL");
    $("dd-list").innerHTML = [...SERVICES].sort((a, b) => a.name.localeCompare(b.name, "pl")).map(d => {
      const s = state[d.id], l = lvl(s.v, d.base), open = ddOpen.has(d.id);
      return `<li class="item clickable ${l}" data-id="${d.id}" tabindex="0" aria-expanded="${open}">
        <div class="main">${alertBadge({ source: { kind: "vendor", name: d.name }, level: l }, 22)} <b>${d.name}</b>
          <div class="muted small">Zgłoszenia użytkowników</div></div>
        <span class="badge ${l}">${TXT[l]}</span>
        <span class="chev" aria-hidden="true">${open ? "▴" : "▾"}</span>
        ${open ? `<div class="detail">${historyHtml(d)}</div>` : ""}</li>`;
    }).join("");
  }

  // Cały wiersz jest klikalny (poza rozwiniętym panelem); wszystko startuje zwinięte
  const toggleDd = li => { ddOpen.has(li.dataset.id) ? ddOpen.delete(li.dataset.id) : ddOpen.add(li.dataset.id); renderDd(); };
  $("dd-list").addEventListener("click", e => {
    const more = e.target.closest("[data-more]");   // „Pokaż starsze"
    if (more) { histShown[more.dataset.more] = (histShown[more.dataset.more] || HIST_STEP) + HIST_STEP; renderDd(); return; }
    if (e.target.closest(".detail")) return;
    const li = e.target.closest("li.item");
    if (li) toggleDd(li);
  });
  $("dd-list").addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("li.item")) { e.preventDefault(); toggleDd(e.target); }
  });

  setInterval(tick, TICK_MS);
  renderDd();
  if (location.hash === "#downdetector") showTab("dd");
})();
