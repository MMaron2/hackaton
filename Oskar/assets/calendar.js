// Kalendarz na kolejne 3 miesiące (od następnego miesiąca) ze świętami państwowymi i obchodami w Polsce.
// Święta ruchome (Wielkanoc, Zielone Świątki, Boże Ciało, Tłusty Czwartek) liczone algorytmem – działa dla dowolnego roku.
// Eventy: tablica CALENDAR_EVENTS poniżej (przykładowe) – docelowo z tabeli EVENTS w Snowflake (GET /api/events).
(function () {
  const MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
  const DOW = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
  const pad = n => String(n).padStart(2, "0");
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  // Niedziela Wielkanocna – algorytm Meeusa/Jonesa/Butchera
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451), t = h + l - 7 * m + 114;
    return new Date(y, Math.floor(t / 31) - 1, (t % 31) + 1);
  }

  // off = dzień ustawowo wolny od pracy; short = skrót do komórki kalendarza
  function holidaysFor(y) {
    const m = new Map(), e = easter(y);
    const add = (d, name, off, short) => m.set(key(d), { name, off, short: short || name });
    add(new Date(y, 0, 1), "Nowy Rok", true);
    add(new Date(y, 0, 6), "Trzech Króli", true);
    add(e, "Wielkanoc", true);
    add(addDays(e, 1), "Poniedziałek Wielkanocny", true, "Pon. Wielkanocny");
    add(new Date(y, 4, 1), "Święto Pracy", true);
    add(new Date(y, 4, 3), "Święto Konstytucji 3 Maja", true, "3 Maja");
    add(addDays(e, 49), "Zielone Świątki", true);
    add(addDays(e, 60), "Boże Ciało", true);
    add(new Date(y, 7, 15), "Wniebowzięcie NMP", true, "15 Sierpnia");
    add(new Date(y, 10, 1), "Wszystkich Świętych", true);
    add(new Date(y, 10, 11), "Narodowe Święto Niepodległości", true, "11 Listopada");
    add(new Date(y, 11, 24), "Wigilia Bożego Narodzenia", true, "Wigilia");
    add(new Date(y, 11, 25), "Boże Narodzenie", true);
    add(new Date(y, 11, 26), "Drugi dzień Bożego Narodzenia", true, "Św. Szczepana");
    // obchody w dni robocze
    add(addDays(e, -52), "Tłusty Czwartek", false);
    add(addDays(e, -46), "Środa Popielcowa", false);
    add(new Date(y, 0, 21), "Dzień Babci", false);
    add(new Date(y, 0, 22), "Dzień Dziadka", false);
    add(new Date(y, 1, 14), "Walentynki", false);
    add(new Date(y, 11, 6), "Mikołajki", false);
    add(new Date(y, 11, 31), "Sylwester", false);
    return m;
  }

  // Przykładowe eventy (do podmiany danymi z backendu)
  const CALENDAR_EVENTS = window.CALENDAR_EVENTS || [
    { date: "2026-12-12", name: "Event sportowy (przykład)", note: "Spodziewany duży ruch na kanałach sportowych" },
    { date: "2026-12-31", name: "Transmisja sylwestrowa (przykład)", note: "Szczyt ruchu około północy" },
    { date: "2027-01-17", name: "Turniej tenisowy – start (przykład)", note: "Wzrost ruchu na Eurosport 1" },
    { date: "2027-02-07", name: "Finał ligi (przykład)", note: "Szczyt ruchu wieczorem" }
  ];

  function render(containerId, monthsCount) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const today = new Date(), todayKey = key(today);
    const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);   // następny miesiąc
    const last = new Date(first.getFullYear(), first.getMonth() + monthsCount, 0);

    const hol = new Map();
    for (let y = first.getFullYear(); y <= last.getFullYear(); y++) holidaysFor(y).forEach((v, k) => hol.set(k, v));
    const evs = new Map();
    CALENDAR_EVENTS.forEach(e => evs.set(e.date, [...(evs.get(e.date) || []), e]));

    const nrm = s => String(s).toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");   // szukanie bez polskich znaków
    const attr = s => nrm(s).replace(/"/g, "");
    let html = `<div class="cal-searchbar"><input type="search" id="cal-search" class="cal-search" placeholder="Szukaj eventu lub święta (nazwa albo data, np. 24.12)…" autocomplete="off"><span class="muted small" id="cal-search-info"></span></div>
      <div class="cal-legend"><span><i class="lg hol"></i>Dzień wolny (święto)</span><span><i class="lg obs"></i>Obchody</span><span><i class="lg wk"></i>Weekend</span><span><i class="lg ev"></i>Event</span><span><i class="lg td"></i>Dziś</span></div><div class="cal-months">`;

    for (let mi = 0; mi < monthsCount; mi++) {
      const ms = new Date(first.getFullYear(), first.getMonth() + mi, 1);
      const daysIn = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
      const offset = (ms.getDay() + 6) % 7;   // poniedziałek = 0
      html += `<div class="cal-month"><h3>${MONTHS[ms.getMonth()]} ${ms.getFullYear()}</h3><div class="cal-grid">` +
        DOW.map(d => `<div class="cal-dow">${d}</div>`).join("") + "<div></div>".repeat(offset);
      for (let d = 1; d <= daysIn; d++) {
        const dt = new Date(ms.getFullYear(), ms.getMonth(), d), k = key(dt), wd = (dt.getDay() + 6) % 7;
        const h = hol.get(k), ev = evs.get(k) || [];
        const cls = ["cal-day", h && h.off ? "hol" : h ? "obs" : "", wd >= 5 ? "wk" : "", ev.length ? "ev" : "", k === todayKey ? "td" : ""].join(" ");
        const tip = [h && `${h.name}${h.off ? " – dzień wolny, spodziewany podwyższony ruch" : ""}`, ...ev.map(e => `${e.name}: ${e.note}`)].filter(Boolean).join("\n");
        const text = (h || ev.length) ? attr(`${h ? h.name : ""} ${ev.map(e => e.name).join(" ")} ${k} ${pad(d)}.${pad(ms.getMonth() + 1)}`) : "";
        html += `<div class="${cls}" data-date="${k}" data-text="${text}" title="${tip.replace(/"/g, "&quot;")}"><span class="n">${d}</span>` +
          (h ? `<span class="lbl">${h.short}</span>` : "") + ev.map(e => `<span class="lbl evl">${e.name.replace(/ \(przykład\)/, "")}</span>`).join("") + "</div>";
      }
      html += "</div></div>";
    }
    html += "</div>";

    // Lista świąt i eventów w zakresie
    const items = [];
    hol.forEach((v, k) => { if (k >= key(first) && k <= key(last)) items.push({ k, name: v.name, kind: v.off ? "Dzień wolny" : "Obchody", busy: v.off }); });
    CALENDAR_EVENTS.forEach(e => { if (e.date >= key(first) && e.date <= key(last)) items.push({ k: e.date, name: e.name, kind: "Event", busy: true, note: e.note }); });
    items.sort((a, b) => a.k.localeCompare(b.k));
    html += `<table class="cal-list"><thead><tr><th>Data</th><th>Dzień</th><th>Nazwa</th><th>Rodzaj</th><th>Prognoza ruchu</th></tr></thead><tbody>` +
      items.map(i => {
        const dt = new Date(i.k + "T00:00:00");
        return `<tr data-text="${attr(`${i.name} ${i.kind} ${i.k} ${i.k.slice(8)}.${i.k.slice(5, 7)} ${i.note || ""}`)}"><td>${i.k}</td><td>${DOW[(dt.getDay() + 6) % 7]}</td><td>${i.name}</td><td>${i.kind}</td><td>${i.busy ? (i.note || "Podwyższony ruch (dzień wolny)") : "Normalny"}</td></tr>`;
      }).join("") + "</tbody></table>";

    root.innerHTML = html;

    // Szukanie: filtruje listę pod kalendarzem, pasujące dni dostają ramkę, pozostałe są przygaszone
    const inp = root.querySelector("#cal-search"), info = root.querySelector("#cal-search-info");
    inp.addEventListener("input", () => {
      const q = nrm(inp.value.trim());
      let n = 0;
      root.querySelectorAll(".cal-list tbody tr").forEach(tr => { const hit = !q || tr.dataset.text.includes(q); tr.hidden = !hit; if (q && hit) n++; });
      root.querySelectorAll(".cal-day").forEach(c => {
        const hit = !!q && !!c.dataset.text && c.dataset.text.includes(q);
        c.classList.toggle("match", hit); c.classList.toggle("dim", !!q && !hit);
      });
      info.textContent = q ? (n ? `Znaleziono: ${n}` : "Brak wyników") : "";
    });
  }

  render("calendar", 3);

  // Lista świąt i eventów od dziś na monthsCount miesięcy – używana przez stronę „Obserwowane"
  window.getCalendarItems = function (monthsCount) {
    const t = new Date(), first = new Date(t.getFullYear(), t.getMonth(), t.getDate()), last = new Date(t.getFullYear(), t.getMonth() + monthsCount + 1, 0);
    const hol = new Map();
    for (let y = first.getFullYear(); y <= last.getFullYear(); y++) holidaysFor(y).forEach((v, k) => hol.set(k, v));
    const items = [];
    hol.forEach((v, k) => { if (k >= key(first) && k <= key(last)) items.push({ id: "hol:" + k, date: k, name: v.name, kind: v.off ? "Dzień wolny" : "Obchody", note: v.off ? "Podwyższony ruch (dzień wolny)" : "" }); });
    CALENDAR_EVENTS.forEach(e => { if (e.date >= key(first) && e.date <= key(last)) items.push({ id: "ev:" + e.date + ":" + e.name, date: e.date, name: e.name, kind: "Event", note: e.note }); });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  };
})();
