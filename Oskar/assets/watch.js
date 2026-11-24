// Strona „Obserwowane": przypinanie vendorów, kanałów i eventów (zapis w localStorage).
(function () {
  const KEY = "pw_watch";
  const load = () => { try { return Object.assign({ vendors: [], channels: [], events: [] }, JSON.parse(localStorage.getItem(KEY))); } catch (e) { return { vendors: [], channels: [], events: [] }; } };
  const save = () => localStorage.setItem(KEY, JSON.stringify(watch));
  const watch = load();
  const expanded = new Set();    // rozwinięte wiersze vendorów
  const pickerOpen = new Set();  // otwarte listy „Dodaj"

  const dayDiff = d => Math.round((new Date(d + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
  const when = n => n === 0 ? "dziś" : n === 1 ? "jutro" : `za ${n} dni`;

  // ---- Źródła pozycji do przypięcia ----
  const SECTIONS = {
    vendors: {
      title: "Vendorzy", icon: "vendor",
      options: () => (appData.vendors || []).map(v => ({ id: v.name, name: v.name, sub: v.component })),
      row: id => vendorRow(id)
    },
    channels: {
      title: "Kanały", icon: "channel",
      options: () => CHANNEL_DB.map(c => ({ id: c.name, name: c.name, sub: "" })),
      row: id => channelRow(id)
    },
    events: {
      title: "Eventy i święta", icon: "event",
      options: () => window.getCalendarItems(6).map(e => ({ id: e.id, name: e.name, sub: `${e.date} · ${e.kind}` })),
      row: id => eventRow(id)
    }
  };

  // ---- Wiersze ----
  function vendorRow(id) {
    const v = (appData.vendors || []).find(x => x.name === id);
    if (!v) return "";
    const l = STATUS_LEVEL[v.status], n = (v.outages || []).length, op = expanded.has(id);
    return `<li class="item clickable ${l}" data-sec="vendors" data-id="${esc(id)}" tabindex="0" aria-expanded="${op}">
      <div class="main">${alertBadge({ source: { kind: "vendor", name: id }, level: l }, 22)} <b>${esc(id)}</b> <span class="muted small">${esc(v.component)}</span>
        <div class="small">${n ? `<b class="${l}">${plProblems(n)}</b> · ` : ""}${esc(v.note)}${v.since !== "—" ? ` <span class="muted">(od ${v.since})</span>` : ""}</div></div>
      <span class="badge ${l}">${STATUS_LABEL[v.status]}</span>
      <button class="unpin" data-unpin title="Odepnij" aria-label="Odepnij">${icon("close")}</button><span class="chev" aria-hidden="true">${op ? "▴" : "▾"}</span>
      ${op ? `<div class="detail">${vendorProblemsHtml(v)}</div>` : ""}</li>`;
  }

  function channelRow(id) {
    const live = (appData.channels || []).find(c => _chNorm(c.name) === _chNorm(id));
    const l = live ? level(live.cdnLoad) : "unk";
    return `<li class="item ${live ? l : ""}" data-sec="channels" data-id="${esc(id)}">
      <div class="main">${channelIcon(id, 22)} <b>${esc(id)}</b>
        <div class="small muted">${live ? `${fmt(live.viewers)} widzów live · ${live.trend >= 0 ? "▲" : "▼"} ${Math.abs(live.trend)}%/15 min · ${live.bandwidth} Tbps` : "Brak danych live (kanał poza Top 5 ruchu)"}</div></div>
      ${live ? `<span class="badge ${l}">CDN ${live.cdnLoad}%</span>` : ""}
      <button class="unpin" data-unpin title="Odepnij" aria-label="Odepnij">${icon("close")}</button></li>`;
  }

  function eventRow(id) {
    const e = window.getCalendarItems(6).find(x => x.id === id);
    if (!e) return "";   // wydarzenie minęło lub spoza zakresu
    const n = dayDiff(e.date), l = e.kind === "Event" ? "warn" : e.kind === "Dzień wolny" ? "crit" : "unk";
    return `<li class="item" data-sec="events" data-id="${esc(id)}">
      <div class="main"><span class="cicon" style="width:22px;height:22px;font-size:10px;background:#2b303b;color:#fff">${e.date.slice(8)}</span> <b>${esc(e.name)}</b>
        <div class="small muted">${e.date} · ${when(n)}${e.note ? " · " + esc(e.note) : ""}</div></div>
      <span class="badge ${l}">${e.kind}</span>
      <button class="unpin" data-unpin title="Odepnij" aria-label="Odepnij">${icon("close")}</button></li>`;
  }

  // ---- Szkielet (budowany raz) ----
  const root = $("watch-root");
  root.innerHTML = Object.entries(SECTIONS).map(([k, s]) => `
    <div class="card watch-card" data-card="${k}">
      <h2>${s.title} <span class="muted small" data-count="${k}"></span>
        <button class="add-btn" data-add="${k}">＋ Dodaj</button></h2>
      <div class="picker" data-picker="${k}" hidden>
        <input type="search" placeholder="Szukaj…" data-search="${k}">
        <div class="opts" data-opts="${k}"></div>
      </div>
      <ul class="vlist" data-list="${k}"></ul>
    </div>`).join("");

  function renderPicker(k) {
    const q = norm(root.querySelector(`[data-search="${k}"]`).value);
    const opts = SECTIONS[k].options().filter(o => norm(o.name + " " + o.sub).includes(q));
    root.querySelector(`[data-opts="${k}"]`).innerHTML = opts.map(o =>
      `<label class="opt"><input type="checkbox" data-pick="${k}" data-id="${esc(o.id)}" ${watch[k].includes(o.id) ? "checked" : ""}>
        ${k === "vendors" ? alertBadge({ source: { kind: "vendor", name: o.name } }, 18) : k === "channels" ? channelIcon(o.name, 18) : ""}
        <span>${esc(o.name)}</span> <span class="muted small">${esc(o.sub)}</span></label>`).join("") || `<div class="muted small" style="padding:8px">Brak wyników.</div>`;
  }

  function renderLists() {
    let bad = 0;
    Object.entries(SECTIONS).forEach(([k, s]) => {
      const ids = k === "events" ? watch[k] : [...watch[k]].sort((a, b) => a.localeCompare(b, "pl"));
      const rows = ids.map(id => s.row(id)).filter(Boolean);
      root.querySelector(`[data-list="${k}"]`).innerHTML = rows.length ? rows.join("") : `<li class="muted small" style="padding:10px 6px">Nic nie przypięto – kliknij „＋ Dodaj".</li>`;
      root.querySelector(`[data-count="${k}"]`).textContent = `(${watch[k].length})`;
    });
    watch.vendors.forEach(id => { const v = (appData.vendors || []).find(x => x.name === id); if (v && (v.status === "down" || v.status === "degraded")) bad++; });
    $("watch-summary").innerHTML = bad
      ? `<div class="verdict crit"><div class="verdict-title">${bad} z obserwowanych vendorów ma problemy</div><div>Rozwiń wiersz vendora, aby zobaczyć opis problemu.</div></div>`
      : (watch.vendors.length ? `<div class="verdict ok"><div class="verdict-title">Obserwowani vendorzy działają prawidłowo</div></div>` : "");
  }

  // ---- Zdarzenia ----
  root.addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) {
      const k = add.dataset.add, p = root.querySelector(`[data-picker="${k}"]`);
      if (p.hidden) { p.hidden = false; renderPicker(k); animateResize(p, 0); p.querySelector("input").focus(); }   // płynne rozwinięcie listy „Dodaj"
      else animateClose(p, () => { p.hidden = true; });
      return;
    }
    if (e.target.closest("[data-pick]") || e.target.closest("[data-search]") || e.target.closest(".picker")) return;
    const li = e.target.closest("li.item");
    if (!li) return;
    const k = li.dataset.sec, id = li.dataset.id;
    if (e.target.closest("[data-unpin]")) {
      watch[k] = watch[k].filter(x => x !== id); save(); renderLists();
      const cb = root.querySelector(`[data-pick="${k}"][data-id="${CSS.escape(id)}"]`); if (cb) cb.checked = false;
      return;
    }
    if (e.target.closest("a") || e.target.closest(".detail") || k !== "vendors") return;
    toggleRow(root, li, () => expanded.has(id), on => on ? expanded.add(id) : expanded.delete(id), renderLists);   // płynne rozwijanie / zwijanie
  });

  root.addEventListener("change", e => {
    const cb = e.target.closest("[data-pick]");
    if (!cb) return;
    const k = cb.dataset.pick, id = cb.dataset.id;
    watch[k] = cb.checked ? [...new Set([...watch[k], id])] : watch[k].filter(x => x !== id);
    save(); renderLists();
  });

  root.addEventListener("input", e => { const s = e.target.closest("[data-search]"); if (s) renderPicker(s.dataset.search); });

  root.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("li.item.clickable")) { e.preventDefault(); e.target.click(); }
  });

  renderLists();
  setInterval(renderLists, 5000);   // odświeżanie statusów przypiętych pozycji (dane vendorów i tak aktualizują się co 60 s)
})();
