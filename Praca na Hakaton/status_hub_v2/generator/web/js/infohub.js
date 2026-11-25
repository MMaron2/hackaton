/* Dodatki InfoHub (z folderu Oskar) dla stron Status Hub: pokazówka v3, Hub v2 i panel generatora.
   Jeden wspólny plik, ładowany PRZED skryptem aplikacji (hub.js / gen.js). Nie zmienia kodu aplikacji:
   - podsłuchuje dane, które aplikacja i tak pobiera (EventSource, fetch), więc nie otwiera dodatkowych połączeń,
   - dokłada do nagłówka: wyszukiwarkę, dzwonek powiadomień, wybór języka i przełącznik motywu,
   - okna i wykresy zostają tam, gdzie były.
   Każdy błąd w tym pliku jest łapany, żeby nie zatrzymać aplikacji. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.IH_T ? window.IH_T(s) : s);
  const norm = s => String(s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* tryb prywatny */ } } };
  const safe = fn => (...a) => { try { return fn(...a); } catch (e) { console.warn('[infohub]', e); } };
  const ICON = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'
  };
  const icon = n => `<svg class="ih-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  /* ------------------------------------------------------------ podsłuch danych aplikacji */
  const data = { state: null, ext: null, gen: null };   // state: /api/stream, ext: statusy dostawców, gen: stan Huba generatora (tryb „Generator awarii" w v3)
  const feed = safe((kind, d) => { if (!d || typeof d !== 'object') return; data[kind] = d; onData(); });
  const kindOf = url => (/\/api\/external/.test(url) ? 'ext' : /\/api\/gen\/state/.test(url) ? 'gen' : /\/api\/stream/.test(url) ? 'state' : null);
  try {
    const ES = window.EventSource;
    if (ES) {
      const Tap = function (url, opts) {
        const es = new ES(url, opts), k = kindOf(String(url));
        if (k) es.addEventListener('message', m => { try { feed(k, JSON.parse(m.data)); } catch (e) { /* nie-JSON */ } });
        return es;
      };
      Tap.prototype = ES.prototype; Tap.CONNECTING = ES.CONNECTING; Tap.OPEN = ES.OPEN; Tap.CLOSED = ES.CLOSED;
      window.EventSource = Tap;
    }
    const F = window.fetch;
    if (F) window.fetch = function (...a) {
      const p = F.apply(this, a);
      try {
        const k = kindOf(String((a[0] && a[0].url) || a[0]));
        if (k && k !== 'state') p.then(r => { if (r.ok) r.clone().json().then(d => feed(k, d)).catch(() => {}); }).catch(() => {});
      } catch (e) { /* zostaw oryginalne zachowanie */ }
      return p;
    };
  } catch (e) { console.warn('[infohub] podsłuch danych niedostępny', e); }

  // aktywny stan: w v3 tryb „Generator awarii" czyta stan Huba generatora, w pozostałych przypadkach zwykły strumień
  const active = () => (ls.get('hub-mode') === 'gen' && data.gen && data.gen.ready ? data.gen : data.state) || {};

  /* ------------------------------------------------------------ motyw jasny / ciemny */
  const root = document.documentElement;
  function setTheme(t) {
    root.classList.remove('auto', 'light', 'dark'); root.classList.add(t); ls.set('hub-theme', t);
    const b = $('#ih-theme'); if (b) { b.innerHTML = icon(t === 'light' ? 'moon' : 'sun'); b.title = T(t === 'light' ? 'Przełącz na tryb ciemny' : 'Przełącz na tryb jasny'); }
  }
  const startTheme = ls.get('hub-theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  root.classList.remove('auto'); root.classList.add(startTheme);   // od razu, żeby strona nie mignęła w złym kolorze

  /* ------------------------------------------------------------ podświetlenie i przejścia */
  // Treść odświeża się co chwilę, więc ramkę rysujemy na wierzchu i przez 1,5 s podążamy za elementem
  function flash(find) {
    let el = find(); if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const box = document.createElement('div'); box.className = 'ih-flash'; document.body.appendChild(box);
    const t0 = performance.now();
    (function follow() {
      el = find() || el;
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      if (performance.now() - t0 < 1500) requestAnimationFrame(follow); else box.remove();
    })();
  }
  const firstText = el => { const n = [...el.childNodes].find(x => x.nodeType === 3 && x.nodeValue.trim()); return (n ? n.nodeValue : el.textContent).trim(); };
  const byName = name => () => {
    const hit = $$('.sv .hd strong, details.xp summary b, .tile b, .fail b, .card > h2').find(e => firstText(e) === name);
    return hit ? hit.closest('.sv, details.xp, .tile, .fail, .card') : null;
  };
  const bySel = sel => () => $(sel);
  function go(hash, find) {
    if (hash && $(`#tabs a[href="${hash}"]`) && location.hash !== hash) { location.hash = hash; setTimeout(() => flash(find), 350); }
    else flash(find);
  }
  window.addEventListener('hashchange', safe(() => { const a = $('#app'); if (!a) return; a.classList.remove('ih-enter'); void a.offsetWidth; a.classList.add('ih-enter'); }));

  /* ------------------------------------------------------------ nagłówek: narzędzia */
  const bar = $('.topbar');
  if (!bar) return;
  const tools = document.createElement('div');
  tools.className = 'ih-tools';
  tools.innerHTML = `
    <div class="ih-wrap"><label class="ih-search">${icon('search')}<input id="ih-q" type="search" placeholder="Szukaj usługi, dostawcy, zakładki…" autocomplete="off"></label><div class="ih-drop" id="ih-results" hidden></div></div>
    <div class="ih-wrap"><button class="ih-btn" id="ih-bell" type="button" title="Powiadomienia" aria-label="Powiadomienia">${icon('bell')}<span class="ih-count" id="ih-count" hidden>0</span></button>
      <div class="ih-drop" id="ih-panel" hidden><div class="ih-head"><b>Powiadomienia</b><button class="ih-link" id="ih-perm" type="button">Włącz powiadomienia przeglądarki</button></div><div id="ih-list"></div></div></div>
    <select class="ih-lang" id="ih-lang" aria-label="Język / Language / Sprache"><option value="pl">PL</option><option value="en">EN</option><option value="de">DE</option></select>
    <button class="ih-btn" id="ih-theme" type="button"></button>`;
  const clock = $('#clock', bar);
  if (clock) bar.insertBefore(tools, clock); else bar.appendChild(tools);
  setTheme(startTheme);
  $('#ih-theme').onclick = () => setTheme(root.classList.contains('light') ? 'dark' : 'light');
  $('#ih-lang').value = window.IH_LANG || 'pl';
  $('#ih-lang').onchange = e => { ls.set('hub-lang', e.target.value); location.reload(); };

  /* ------------------------------------------------------------ wyszukiwarka */
  const STATUS = { ok: 'w normie', warn: 'poza normą', bad: 'alarm', operational: 'Sprawny', degraded: 'Pogorszenie', partial: 'Awaria częściowa', major: 'Poważna awaria', outage: 'Awaria', maintenance: 'Konserwacja', unknown: 'Sprawdzanie…' };
  function buildIndex() {
    const out = [], seen = new Set(), add = it => { const k = it.type + '|' + it.title; if (it.title && !seen.has(k)) { seen.add(k); out.push(it); } };
    const A = active(), hasTab = h => !!$(`#tabs a[href="${h}"]`), dash = hasTab('#/dashboard') ? '#/dashboard' : null, ext = hasTab('#/uslugi') ? '#/uslugi' : dash;
    $$('#tabs a').forEach(a => add({ type: 'Zakładka', title: a.textContent.trim(), run: () => { location.hash = a.getAttribute('href'); } }));
    (A.cards || []).forEach(c => add({ type: c.kind === 'vendor' ? 'Dostawca (pomiar)' : 'Usługa', title: c.name, sub: c.nodata ? 'brak danych' : STATUS[c.status] || '', run: () => go(c.kind === 'vendor' ? ext : dash, byName(c.name)) }));
    (A.services || []).forEach(s => add({ type: 'Usługa', title: s.name, sub: STATUS[s.status] || s.status || '', run: () => go(dash, byName(s.name)) }));
    (A.vendors || []).forEach(v => add({ type: 'Dostawca', title: v.name, sub: STATUS[v.status] || v.status || '', run: () => go(ext, byName(v.name)) }));
    ((data.ext && data.ext.providers) || []).forEach(p => add({ type: 'Dostawca', title: p.name, sub: STATUS[p.level] || '', run: () => go(ext, bySel(`details.xp[data-id="${CSS.escape(p.id)}"]`)) }));
    if (A.incident) add({ type: 'Incydent', title: `Incydent #${A.incident.id}`, sub: (A.incident.hyps && A.incident.hyps[0] && A.incident.hyps[0].title) || '', run: () => go(dash, bySel('#inc')) });
    (A.closed || []).forEach(c => add({ type: 'Incydent', title: `Incydent #${c.id} (zamknięty)`, sub: (c.hyps && c.hyps[0] && c.hyps[0].title) || '', run: () => go(dash, bySel('#inc')) }));
    $$('.card > h2').forEach(h => { const t = firstText(h); add({ type: 'Okno', title: t, run: () => flash(() => $$('.card > h2').find(x => firstText(x) === t)?.closest('.card') || null) }); });
    return out;
  }
  const q = $('#ih-q'), box = $('#ih-results');
  let results = [];
  const runSearch = safe(() => {
    const s = norm(q.value.trim());
    if (!s) { box.hidden = true; return; }
    results = buildIndex().filter(e => norm(`${e.title} ${e.type} ${e.sub || ''} ${T(e.title)} ${T(e.type)}`).includes(s)).slice(0, 9);
    box.innerHTML = results.length
      ? results.map((e, i) => `<a class="ih-item" href="#" data-i="${i}"><span class="ih-tag">${esc(e.type)}</span><span><b>${esc(e.title)}</b>${e.sub ? `<br><small>${esc(e.sub)}</small>` : ''}</span></a>`).join('')
      : `<div class="ih-empty">Brak wyników</div>`;
    box.hidden = false;
  });
  const pick = safe(i => { const r = results[i]; box.hidden = true; q.blur(); if (r) r.run(); });
  q.addEventListener('input', runSearch); q.addEventListener('focus', runSearch);
  q.addEventListener('keydown', e => { if (e.key === 'Enter') pick(0); if (e.key === 'Escape') { box.hidden = true; q.blur(); } });
  box.addEventListener('click', e => { const a = e.target.closest('[data-i]'); if (a) { e.preventDefault(); pick(+a.dataset.i); } });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });

  /* ------------------------------------------------------------ powiadomienia: dzwonek, toasty, przeglądarka */
  const LV = { bad: 'bad', page: 'bad', alert: 'bad', crit: 'bad', error: 'bad', warn: 'warn', watch: 'warn', ok: 'ok', good: 'ok' };
  const hm = s => (typeof s === 'string' && s.length >= 16 ? s.slice(11, 16) : '');
  let seen = null, lastLen = 0, lastSrc = null, unread = 0, notes = [];
  function currentNotes() {
    const A = active();
    if (Array.isArray(A.notes)) return A.notes.map(n => ({ ts: n.ts, level: LV[n.level] || 'info', tag: n.tag || '', text: n.text || '', sub: n.sub || '' }));
    if (Array.isArray(A.failures)) return A.failures.filter(f => f.active).map(f => ({ ts: f.start, level: 'bad', tag: 'Wstrzyknięta awaria', text: `${f.label}: ${f.target}`, sub: '' }));   // panel generatora
    return [];
  }
  const toIncident = () => go($('#tabs a[href="#/dashboard"]') ? '#/dashboard' : null, () => $('#inc') || $('#feed') || $('#active'));
  function toast(n) {
    let wrap = $('#ih-toasts'); if (!wrap) { wrap = document.createElement('div'); wrap.id = 'ih-toasts'; document.body.appendChild(wrap); }
    const t = document.createElement('div'); t.className = 'ih-toast ' + n.level;
    t.innerHTML = `<span class="ih-lv ${n.level}"></span><span><b>${esc(T(n.tag))}</b><br><small>${esc(n.text)}</small></span>`;
    t.onclick = () => { t.remove(); toIncident(); };
    wrap.appendChild(t); setTimeout(() => t.remove(), 7000);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { const nt = new Notification(T(n.tag) || 'Status Hub', { body: n.text, tag: n.ts + n.tag }); nt.onclick = () => { window.focus(); nt.close(); toIncident(); }; } catch (e) { /* np. brak wsparcia w tym kontekście */ }
    }
  }
  function renderBell() {
    const c = $('#ih-count'); c.textContent = unread > 99 ? '99+' : unread; c.hidden = unread === 0;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    $('#ih-perm').hidden = perm !== 'default';
    const html = notes.length ? notes.slice(-40).reverse().map(n => `<div class="ih-item" data-note><span class="ih-lv ${n.level}"></span><span><b>${esc(n.tag)}</b> <small>${esc(hm(n.ts))}</small><br><small>${esc(n.text)}</small></span></div>`).join('') : '<div class="ih-empty">Brak powiadomień</div>';
    const list = $('#ih-list'); if (list._h !== html) { list.innerHTML = html; list._h = html; }
  }
  const onData = safe(() => {
    notes = currentNotes();
    const keys = notes.map(n => `${n.ts}|${n.tag}|${n.text}`), src = ls.get('hub-mode') === 'gen' ? 'gen' : 'state';
    if (seen === null || keys.length < lastLen || src !== lastSrc) { seen = new Set(keys); unread = 0; }   // start, restart odtwarzania albo zmiana źródła: bez zalewu toastów
    else {
      const fresh = notes.filter((n, i) => !seen.has(keys[i]));
      keys.forEach(k => seen.add(k));
      if (fresh.length) { unread += fresh.length; fresh.slice(-3).forEach(toast); }
    }
    lastLen = keys.length; lastSrc = src; renderBell();
  });
  $('#ih-bell').onclick = e => { e.stopPropagation(); const p = $('#ih-panel'); p.hidden = !p.hidden; if (!p.hidden) { unread = 0; renderBell(); } };
  $('#ih-perm').onclick = safe(async () => { await Notification.requestPermission(); renderBell(); });
  $('#ih-list').addEventListener('click', e => { if (e.target.closest('[data-note]')) { $('#ih-panel').hidden = true; toIncident(); } });
  $('#ih-panel').addEventListener('click', e => e.stopPropagation());
  box.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', e => { $('#ih-panel').hidden = true; if (e.target !== q) box.hidden = true; });
  renderBell();

  /* ------------------------------------------------------------ klikalne liczniki w banerze stanu */
  document.addEventListener('click', safe(e => {
    const cell = e.target.closest('.banner .stats > div'); if (!cell) return;
    const i = [...cell.parentNode.children].indexOf(cell);
    flash(i < 2 ? bySel('#inc') : () => $('#svcs') && $('#svcs').closest('.card'));
  }));

  window.InfoHubAddon = { feed, data };   // do testów i ewentualnej integracji
})();
