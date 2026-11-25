(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const hm = s => (s ? s.slice(11, 16) : '—');
  const d = s => (s ? new Date(s.replace(' ', 'T')) : null);
  const nf = (v, n = 0) => (v == null || Number.isNaN(+v) ? '—' : Number(v).toLocaleString('pl-PL', { maximumFractionDigits: n }));
  const num = v => (v == null ? '—' : Math.abs(v) >= 1000 ? nf(v, 0) : Math.abs(v) >= 100 ? nf(v, 0) : Math.abs(v) >= 10 ? nf(v, 1) : nf(v, 2));
  const LANE = { servers: 'Aplikacje i serwery', synth: 'Monitoring', vendors: 'Dostawcy', calls: 'Infolinia', analytics: 'Analityka', model: 'Model NR' };
  const SHORT = { 'Czas odpowiedzi': 'Czas odp.', 'Maks. czas odp.': 'Maks. odp.', 'Niepowodzenia': 'Błędy testów', 'Ruch wychodzący': 'Ruch wych.', 'Niezdrowe hosty': 'Niezdrowe', 'CPU średnio': 'CPU śr.', 'Poza normą': 'Poza normą' };
  const STC = { ok: 'ok', warn: 'warn', bad: 'bad', nodata: '' };
  let S = null, view = 'dashboard', built = null, scenList = null;

  /* ------------------------------------------------------------------------------ charts */
  function mini(s, color) {
    const n = s.a.length;
    if (n < 2) return '<svg viewBox="0 0 240 54"></svg>';
    const vals = [...s.a, ...s.e].filter(v => v != null), w = 240, h = 54, max = Math.max(...vals, 1e-9) * 1.1, min = Math.min(0, ...vals);
    const X = i => i / (n - 1) * w, Y = v => h - 3 - (v - min) / (max - min || 1) * (h - 8);
    const path = a => { let p = '', pen = false; a.forEach((v, i) => { if (v == null) { pen = false; return; } p += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true; }); return p; };
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${path(s.e)}" fill="none" stroke="${css('--muted')}" stroke-width="1.4" stroke-dasharray="3 3" opacity=".8"/><path d="${path(s.a)}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
  }

  /* ------------------------------------------------------------------------------ dashboard */
  function build() {
    $('#app').innerHTML = `<div id="banner"></div><div class="card" id="truthc" style="margin-top:16px" hidden></div>
      <div class="twocol" style="margin-top:16px">
        <div class="card"><h2>Usługi wewnętrzne <span class="sub" id="svc-sub">prawdziwe encje z New Relic: wartość (linia) i norma z tej samej pory doby (przerywana)</span><span class="spacer"></span><span id="seg-int" class="pill ok"></span></h2><div class="svcgrid" id="svcs"></div></div>
        <div class="stack"><div class="card" id="extc"><h2>Usługi zewnętrzne <span class="livetag"><i class="dot pulse"></i>NA ŻYWO</span><span class="sub">statusy i awarie dostawców, sondy osiągalności</span><span class="spacer"></span><span id="seg-ext" class="pill">łączenie…</span></h2><div id="ext"></div></div>
        <div class="card"><h2>Zgłoszenia i sygnały od użytkowników <span class="simtag">SYMULACJA</span><span class="spacer"></span><span id="seg-rep" class="pill ok"></span></h2><div class="muted small" style="margin:-4px 0 10px" id="rep-note">Generowane z prawdziwych sygnałów (wpływ na użytkowników). Eksport New Relic ich nie zawiera.</div><div id="calls"></div><div id="ga" style="margin-top:16px"></div></div></div></div>
      <div class="twocol" style="margin-top:16px"><div class="card" id="inc"></div><div class="stack"><div class="card"><h2>Źródła sygnałów</h2><div class="tiles" id="tiles"></div></div><div class="card"><h2>Dziennik powiadomień <span class="sub" id="feed-sub">czas odtwarzania</span></h2><div class="feed" id="feed"></div></div></div></div>`;
    $('#inc').onclick = e => { if (e.target.id === 'ack') post(mode === 'gen' ? '/api/gen/ack' : '/api/ack'); if (e.target.id === 'cp') navigator.clipboard && navigator.clipboard.writeText(e.target.dataset.t); };
    built = 'dashboard';
  }
  function renderBanner() {
    const inc = S.incident, j = S.scenario.jira;
    let cls = 'ok', ico = '✓', big = 'Wszystko w normie', txt = `Odtwarzanie ${hm(S.clock)}: żadna usługa ani dostawca nie odbiega od normy.`;
    if (inc) {
      const h = inc.hyps[0], over = inc.active_n === 0;
      cls = over ? 'info' : inc.sev === 'P1' ? 'bad' : 'warn'; ico = over ? '↘' : inc.sev === 'P1' ? '!' : '▲'; big = over ? 'Sygnały ustały' : inc.sev === 'P1' ? 'Awaria' : 'Problem';
      txt = `${h ? esc(h.title) : 'analizuję'} · źródła: ${inc.srcs.map(s => LANE[s]).join(', ')} · od ${inc.elapsed} min`;
    }
    if (S.ended) txt += ' · koniec odtwarzanego okna: kliknij „↻ Jeszcze raz”, żeby zobaczyć je od początku.';
    const nb = S.cards.filter(c => c.status === 'warn' || c.status === 'bad').length;
    $('#banner').innerHTML = `<div class="banner ${cls}"><div class="ico">${ico}</div><div><div class="big">${big}</div><div class="txt">${txt}</div></div><div class="stats"><div><b>${inc ? 1 : 0}</b><span>otwarte incydenty</span></div><div><b>${S.closed.length}</b><span>zamknięte</span></div><div><b>${nb}/${S.cards.filter(c => !c.nodata).length}</b><span>kart poza normą</span></div></div></div>`;
  }
  function card(c) {
    if (c.nodata) return `<div class="sv nodata"><div class="hd"><span class="dot"></span><strong>${esc(c.name)}</strong><span class="pill">brak danych</span></div><div class="src">W eksporcie tego okna nie ma metryk tej grupy (${esc(c.desc)}).</div></div>`;
    const col = c.status === 'bad' ? css('--bad') : c.status === 'warn' ? css('--warn') : css('--accent');
    return `<div class="sv ${STC[c.status]}"><div class="hd"><span class="dot ${STC[c.status]}"></span><strong>${esc(c.name)}</strong><span class="pill ${STC[c.status]}">${c.status === 'ok' ? 'w normie' : c.status === 'warn' ? 'poza normą' : 'alarm'}</span></div>
      <div class="nums">${c.nums.map(n => `<div><b>${typeof n.v === 'string' ? n.v : num(n.v)}</b><span>${esc(SHORT[n.l] || n.l)}${n.u ? ' · ' + esc(n.u) : ''}</span></div>`).join('')}</div>${mini(c.series, col)}
      ${c.why ? `<div class="why">${esc(c.why)}</div>` : ''}<div class="src">${esc(c.desc)}</div></div>`;
  }
  function renderCards() {
    const seg = (kind, id, pill) => {
      if (!$(id)) return;
      const cs = S.cards.filter(c => c.kind === kind), live = cs.filter(c => !c.nodata), bad = live.filter(c => c.status !== 'ok');
      $(id).innerHTML = cs.map(card).join('');
      $(pill).className = 'pill ' + (live.some(c => c.status === 'bad') ? 'bad' : bad.length ? 'warn' : 'ok'); $(pill).textContent = bad.length ? `${bad.length} z ${live.length} poza normą` : `${live.length} z ${live.length} w normie`;
    };
    seg('internal', '#svcs', '#seg-int'); seg('vendor', '#vend', '#seg-vm');
  }
  function renderReports() {
    const rows = Object.values(S.calls.topics), G = S.ga, alert = S.tiles.calls.state === 'alert', ga = S.tiles.analytics.state === 'alert', watch = rows.some(r => r.z >= 2);
    $('#seg-rep').className = 'pill ' + (alert || ga ? 'bad' : watch ? 'warn' : 'ok'); $('#seg-rep').textContent = alert || ga ? 'skok zgłoszeń' : watch ? 'rosnące zgłoszenia' : 'w normie';
    const mx = Math.max(1, ...rows.map(r => Math.max(r.n, r.exp)));
    $('#calls').innerHTML = `<h3 style="margin:0 0 8px">Infolinia <span class="muted small">połączenia w oknie ${S.scenario.interval} min kontra norma</span></h3>` + rows.map(r => `<div class="rep"><span>${esc(r.name)}</span><div class="bar"><i style="width:${r.exp / mx * 100}%" class="exp"></i><i style="width:${r.n / mx * 100}%" class="${r.z >= 4 ? 'bad' : r.z >= 2 ? 'warn' : ''}"></i></div><b class="${r.z >= 4 ? 'bad' : ''}">${r.n}</b><span class="muted small">norma ${nf(r.exp, 1)}</span></div>`).join('')
      + `<div class="small muted" style="margin-top:8px">Czas oczekiwania: <b>${S.calls.wait} s</b>, porzucone: <b>${Math.round(S.calls.aband * 100)}%</b></div>`;
    $('#ga').innerHTML = `<h3 style="margin:0 0 8px">Google Analytics <span class="muted small">zachowanie widzów</span></h3><div class="nums3"><div><b>${nf(G.users)}</b><span>aktywni użytkownicy (norma ok. ${nf(G.users_exp)})</span></div><div><b>${nf(G.starts)}</b><span>starty playera (norma ok. ${nf(G.starts_exp)})</span></div><div><b class="${G.rate >= .06 ? 'bad' : ''}">${(G.rate * 100).toFixed(1)}%</b><span>błędy playera (norma ok. 1,5%)</span></div></div>`;
  }
  function renderTruth() {
    const T = S.truth, el = $('#truthc');
    if (!T) { el.hidden = false; el.innerHTML = '<h2>Spokojny dzień <span class="sub">test fałszywych alarmów: w oknie nie było awarii</span></h2><div class="small muted">Hub nie powinien zgłosić incydentu. Liczba zgłoszonych incydentów: <b>' + (S.closed.length + (S.incident ? 1 : 0)) + '</b>.</div>'; return; }
    const j = T.jira, h = T.hub;
    el.hidden = false;
    el.innerHTML = `<h2>Porównanie z rzeczywistością <span class="sub">prawdziwy incydent z Jiry: ${esc(j.title)}</span><span class="spacer"></span><span class="pill">${esc(S.scenario.id)}</span></h2>
      <div class="truth"><div><b>${hm(T.onset)}</b><span>początek awarii${j.onset_owner ? ' (wg właściciela danych; w Jirze ' + hm(j.start) + ')' : ' (Jira)'}</span></div>
        <div class="${T.human_min >= 15 ? 'miss' : ''}"><b>${T.human_min <= 0 ? 'od razu' : T.human_min + ' min'}</b><span>do wykrycia przez ludzi (${esc(j.how)}), potwierdzenie ${hm(j.ack)}</span></div>
        <div class="${h ? (h.ttn < T.human_min ? 'good' : 'miss') : ''}"><b>${h ? (h.ttn <= 0 ? (h.ttn === 0 ? 'od razu' : -h.ttn + ' min przed') : h.ttn + ' min') : T.started ? 'czekam… ' + T.waiting + ' min' : 'jeszcze nie ruszyło'}</b><span>do pierwszego powiadomienia Huba${h && h.page ? ', pager ' + hm(h.page) : ''}</span></div>
        <div><b style="font-size:15px">${h && h.hyp ? esc(h.hyp) : '—'}</b><span>hipoteza Huba. Przyczyna w Jirze: ${esc(j.cause)}</span></div></div>
      ${!h && T.started && T.waiting > 20 ? '<div class="note-box small" style="margin-top:10px">W prawdziwych metrykach tego eksportu awaria nie zostawiła śladu (okno zawiera tylko część metryk), więc Hub jej nie widzi. To realne ograniczenie danych, nie błąd odtwarzania.</div>' : ''}`;
  }
  function draft(inc) {
    const h = inc.hyps[0];
    return `Obserwujemy problem w usługach. Najbardziej prawdopodobna przyczyna: ${h ? h.title : 'w trakcie ustalania'}. Zespół dyżurny zajmuje się sprawą, kolejna informacja za 15 min.`;
  }
  function renderInc() {
    const inc = S.incident;
    if (!inc) {
      const last = S.closed[0];
      $('#inc').innerHTML = `<h2>Centrum incydentów</h2><div class="empty" style="padding:26px 0"><div style="font-size:30px">✓</div><b>Brak otwartych incydentów</b><div class="muted small">Hub porównuje wszystkie źródła z normą i odezwie się, gdy coś się rozjedzie.</div></div>` + (S.closed.length ? `<h3 style="margin:8px 0">Ostatnio zamknięte</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Waga</th><th>Od</th><th>Przyczyna</th><th>Do potwierdzenia</th></tr></thead><tbody>${S.closed.map(c => `<tr><td>${c.id}</td><td><span class="sev ${c.sev}">${c.sev}</span></td><td>${hm(c.start)}</td><td>${esc(c.hyps[0] ? c.hyps[0].title : '—')}</td><td>${c.tta == null ? 'brak' : c.tta + ' min'}</td></tr>`).join('')}</tbody></table></div>` : '');
      return;
    }
    const over = inc.active_n === 0;
    $('#inc').innerHTML = `<div class="inc-head"><span class="sev ${inc.sev}">${inc.sev}</span><h3>Incydent #${inc.id}</h3>${inc.page ? `<span class="pill bad">pager wysłany ${hm(inc.page)}</span>` : '<span class="pill warn">ostrzeżenie na kanałach</span>'}${over ? '<span class="pill info">sygnały ustały</span>' : ''}${inc.ack ? `<span class="pill ok">potwierdzone ${hm(inc.ack)}</span>` : ''}<span class="muted small">pierwszy sygnał ${hm(inc.start)} · ${inc.elapsed} min temu</span></div>
      ${!inc.ack && inc.page ? `<div style="margin-bottom:10px"><button class="btn big primary" id="ack">Potwierdzam: zajmuję się tym</button> <span class="muted small">${inc.esc === 0 ? 'następny krok: II linia' : inc.esc === 1 ? 'następny krok: kierownik' : 'eskalowano do kierownika'}</span></div>` : ''}
      <h3 style="margin:8px 0">Hipotezy przyczyny</h3>${inc.hyps.map((h, i) => `<div class="hyp ${i === 0 ? 'top' : ''}"><div class="t"><span>${i + 1}. ${esc(h.title)}</span><span>${Math.round(h.conf * 100)}%</span></div><div style="height:6px;background:var(--panel);border-radius:3px;margin:6px 0"><div style="height:6px;width:${h.conf * 100}%;background:var(--accent);border-radius:3px"></div></div><ul>${h.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>${i === 0 ? `<div class="act">Co zrobić: ${esc(h.action)}</div>` : ''}</div>`).join('')}
      <h3 style="margin:12px 0 6px">Dowody z ${inc.srcs.length} źródeł <span class="muted small">(${inc.active_n} nadal aktywnych)</span></h3>${inc.evidence.slice(0, 14).map(e => `<div class="ev ${e.active ? '' : 'off'}"><span class="src ${e.lane}">${LANE[e.lane]}</span><span>${esc(e.detail)}</span><span class="muted">${hm(e.start)}${e.end ? '–' + hm(e.end) : ''}</span></div>`).join('')}
      <h3 style="margin:12px 0 6px">Szkic komunikatu dla interesariuszy</h3><div class="note-box" style="background:var(--panel2);border-color:var(--line)">${esc(draft(inc))} <button class="btn" id="cp" data-t="${esc(draft(inc))}">kopiuj</button></div>`;
  }
  function renderSide() {
    $('#tiles').innerHTML = Object.entries(S.tiles).map(([k, t]) => `<div class="tile ${t.state === 'alert' ? 'bad' : ''}"><span class="dot ${t.state === 'alert' ? 'bad' : 'ok'}"></span><div><b>${esc(t.name)}</b>${t.sim ? ' <span class="simtag">SYM.</span>' : ''}<small>${k === 'model' ? `ryzyko ${Math.round(S.nr.risk)}/100${S.nr.lvl ? ', najsilniej: ' + esc(S.nr.top) : ', brak odchyleń'}` : esc(t.text)}</small></div><span class="pill ${t.state === 'alert' ? 'bad' : 'ok'}">${t.state === 'alert' ? 'ALARM' : 'OK'}</span></div>`).join('');
    $('#feed').innerHTML = S.notes.length ? S.notes.slice().reverse().map(n => `<div class="msg ${n.level}"><span class="t">${hm(n.ts)}</span><b>${esc(n.tag)}</b><div>${esc(n.text)}</div>${n.sub ? `<div class="sub">${esc(n.sub)}</div>` : ''}</div>`).join('') : '<div class="muted small">Brak powiadomień.</div>';
  }

  /* ------------------------------------------------------------------------------ external providers: LIVE statuses (module status_uslug) */
  let X = null, xOff = 0, xAt = 0, xStale = false;
  const xOpen = new Set();
  const XL = { operational: 'Sprawny', maintenance: 'Konserwacja', degraded: 'Pogorszenie', partial: 'Awaria częściowa', major: 'Poważna awaria', unknown: 'Sprawdzanie…' };
  const XR = { unknown: -1, operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };
  const XI = { minor: 'drobny', major: 'poważny', critical: 'krytyczny', maintenance: 'konserwacja', info: 'informacja', information: 'informacja', performance: 'wydajność', disruption: 'zakłócenie', outage: 'przerwa', incident: 'incydent' };
  const XIL = { info: 'maintenance', information: 'maintenance', maintenance: 'maintenance', minor: 'degraded', performance: 'degraded', disruption: 'degraded', incident: 'degraded', major: 'partial', outage: 'partial', critical: 'major' };
  const xAge = ts => Math.max(0, (Date.now() + xOff - ts) / 1000);
  const xSince = ms => { if (!ms) return ''; const t = new Date(ms); return new Date().toDateString() === t.toDateString() ? 'od ' + t.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : 'od ' + t.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const xBars = h => [...h.slice(-20).padStart(20, '_')].map(c => `<i class="${c === '1' ? 'u' : c === '0' ? 'd' : ''}"></i>`).join('');
  const xProbe = p => `<li class="xpr lv-${p.level}"><span class="dot"></span><span class="pl" title="${esc(p.host)}">${esc(p.label)}</span><span class="bars" aria-hidden="true">${xBars(p.history)}</span><span class="ms${p.ok === false ? ' bad' : ''}">${p.ok === null ? '…' : p.ok ? p.ms + ' ms' : esc(p.error || 'błąd')}</span><span class="st">${p.status == null ? '—' : p.status}</span></li>`;
  function xProblems(P) {       // wszystkie aktywne awarie i zdarzenia: z feedów dostawców oraz z sond osiągalności
    const out = [];
    P.forEach(p => {
      (p.vendor ? p.vendor.incidents || [] : []).forEach(i => out.push({ p, lv: XIL[i.impact] || (p.level === 'unknown' ? 'degraded' : p.level), src: 'dostawca', imp: XI[i.impact] || i.impact, title: i.title, since: i.since }));
      p.probes.forEach(s => { if (XR[s.level] >= 2) out.push({ p, lv: s.level, src: 'sonda', imp: s.level === 'major' ? 'nie odpowiada' : 'pogorszenie', title: `${s.label}: ${s.ok === false ? (s.error || 'błąd') : s.ms + ' ms (wolna odpowiedź)'}`, since: null }); });
    });
    return out.sort((a, b) => XR[b.lv] - XR[a.lv] || (b.since || 0) - (a.since || 0));
  }
  function xRow(p) {
    const v = p.vendor, dsc = v ? esc(v.description) + (v.error ? ` (błąd feedu: ${esc(v.error)})` : '') : 'brak publicznego API statusu, tylko sondy';
    const inc = v && v.incidents.length ? '<ul class="xinc">' + v.incidents.map(i => `<li><b>${esc(XI[i.impact] || i.impact)}</b> ${esc(i.title)}${i.since ? ` <span class="muted">· ${esc(xSince(i.since))}</span>` : ''}</li>`).join('') + '</ul>' : '';
    const pr = p.probes.length ? '<ul class="xprobes">' + p.probes.map(xProbe).join('') + '</ul>' : '';
    const link = /^https?:/.test(p.pageUrl) ? `<a href="${esc(p.pageUrl)}" target="_blank" rel="noopener noreferrer">oficjalny status ↗</a>` : '';
    return `<details class="xp lv-${p.level}" data-id="${esc(p.id)}"${xOpen.has(p.id) ? ' open' : ''}><summary><span class="dot"></span><span class="xm"><b>${esc(p.name)}</b><small title="${esc(v ? v.description : '')}">${dsc}</small></span><span class="xb">${XL[p.level]}</span></summary><div class="xbody">${inc}${pr}<div class="xfoot"><span>${p.oldestCheckAt != null ? `sprawdzono <span data-ts="${p.oldestCheckAt}">…</span>` : 'sprawdzanie…'}${p.uptime != null && p.probes.length ? ` · sondy OK ${nf(p.uptime, 1)}%` : ''}</span>${link}</div></div></details>`;
  }
  function renderExternal() {
    const main = $('#ext'), full = $('#extall'); if (!main && !full) return;
    let cls = 'pill', txt, mainHtml, fullHtml;
    if (!X) { mainHtml = fullHtml = '<div class="empty">Łączenie z modułem statusów dostawców…</div>'; txt = 'łączenie…'; }
    else if (X.disabled) {
      const m = `Statusy dostawców na żywo są niedostępne: ${esc(X.note || 'moduł wyłączony')}.`;
      mainHtml = `<div class="note-box small">${m} Pomiary po naszej stronie są w zakładce <a href="#/uslugi">Usługi zewnętrzne</a>.</div>`; fullHtml = `<div class="note-box small">${m} Pomiary po naszej stronie poniżej działają bez nich.</div>`; txt = 'wyłączone';
    } else {
      const P = X.providers, known = P.filter(p => p.level !== 'unknown'), pend = P.length - known.length, bad = known.filter(p => XR[p.level] >= 2), okn = known.filter(p => XR[p.level] <= 1).length;
      const gv = (mode === 'gen' && gOk()) ? G.vendors : [], gp = gv.filter(v => v.status !== 'operational' || v.suspect).map(v => ({ p: { name: v.name + ' (generator)' }, lv: v.status === 'outage' ? 'major' : 'degraded', src: 'symulacja', imp: v.status === 'outage' ? 'awaria' : v.status === 'operational' ? 'podejrzenie' : 'pogorszenie', title: (v.message || 'Hub podejrzewa awarię mimo braku komunikatu dostawcy') + (v.status !== 'operational' ? ` (od ${hm(v.since)} czasu symulacji)` : ''), since: null }));
      const tot = P.length + gv.length, badN = bad.length + gp.length;
      if (X.hostNetworkIssue) { cls += ' warn'; txt = 'brak łączności hosta'; }
      else if (bad.some(p => XR[p.level] >= 3) || gp.some(x => x.lv === 'major')) { cls += ' bad'; txt = `${badN} z ${tot} z awarią`; }
      else if (badN) { cls += ' warn'; txt = `${badN} z ${tot} z pogorszeniem`; }
      else if (!known.length) txt = 'sprawdzanie…';
      else { cls += ' ok'; txt = `${okn + gv.length} z ${tot} sprawnych`; }
      const probs = X.hostNetworkIssue ? [] : xProblems(P).concat(gp).sort((a, b) => (b.src === 'symulacja') - (a.src === 'symulacja') || XR[b.lv] - XR[a.lv] || (b.since || 0) - (a.since || 0)), shown = probs.slice(0, 8), olds = P.map(p => p.oldestCheckAt);
      const stale = xStale ? '<div class="notice warn">Utracono połączenie z odczytem na żywo: dane poniżej mogą być nieaktualne.</div>' : '';
      const net = X.hostNetworkIssue ? `<div class="note-box small" style="margin-bottom:10px">Prawie wszystkie sondy zawodzą na poziomie sieci${X.hostIssueError ? ` (najczęstszy błąd: ${esc(X.hostIssueError)})` : ''}, więc problem leży raczej po stronie tego komputera lub sieci niż u dostawców. Statusy są ukryte do czasu odzyskania łączności.${X.hostIssueError === 'tls-cert' ? ' Serwer nie ufa certyfikatom: ustaw SSL_CERT_FILE na plik z zaufanym CA.' : ''}</div>` : '';
      const more = probs.length > shown.length ? `<div class="small muted">… i ${probs.length - shown.length} więcej w zakładce <a href="#/uslugi">Usługi zewnętrzne</a></div>` : '';
      const alerts = X.hostNetworkIssue ? '' : probs.length ? `<div class="xalerts"><h3>Aktywne awarie i zdarzenia <span class="muted small">(${probs.length})</span></h3>${shown.map(a => `<div class="xa lv-${a.lv}"><span class="dot"></span><div><b>${esc(a.p.name)}</b> <span class="xb">${esc(a.imp)}</span><span class="xsrc">${a.src}</span><div class="xt">${esc(a.title)}</div></div><span class="muted small">${esc(xSince(a.since))}</span></div>`).join('')}${more}</div>` : `<div class="xok">✓ ${pend ? `Brak awarii u sprawdzonych dostawców (sprawdzanie: ${pend}…)` : 'Brak zgłoszonych awarii dostawców'}</div>`;
      const oldest = olds.some(t => t == null) ? null : Math.min(...olds);
      const fresh = `<div class="xfresh small muted">${oldest == null ? 'Czekam na pierwsze sprawdzenia…' : `Najstarszy odczyt: <b data-age="${oldest}" data-target="${X.targetMs / 1000}">–</b>`} · odświeżanie co ${Math.round(X.intervalMs / 1000)} s. Dane z internetu na żywo, niezależne od odtwarzanego okna New Relic i niewpływające na incydenty Huba. Strony statusu dostawców aktualizują ludzie (bywają spóźnione o minuty), sondy pokazują osiągalność z tego komputera teraz.</div>`;
      mainHtml = stale + net + alerts;
      fullHtml = stale + net + `<div class="xlist">${P.map(xRow).join('')}</div>` + fresh;
    }
    ['#seg-ext', '#seg-ext2'].forEach(id => { const p = $(id); if (p) { p.className = cls; p.textContent = txt; } });
    if (main && main._h !== mainHtml) { main.innerHTML = mainHtml; main._h = mainHtml; }
    if (full && full._h !== fullHtml) { full.innerHTML = fullHtml; full._h = fullHtml; }
    xTick();
  }
  function buildUslugi() {
    const second = mode === 'gen'
      ? '<div class="card" style="margin-top:16px"><h2>Dostawcy z generatora awarii <span class="simtag">SYMULACJA</span><span class="sub">status ze strony dostawcy i efekt u zależnych usług</span><span class="spacer"></span><span id="seg-gv" class="pill ok"></span></h2><div class="svcgrid" id="gvend"></div></div>'
      : '<div class="card" style="margin-top:16px"><h2>Pomiary po naszej stronie: CloudFront, ALB, SDK <span class="sub">z odtwarzanego okna New Relic, nie komunikaty dostawców</span><span class="spacer"></span><span id="seg-vm" class="pill ok"></span></h2><div class="svcgrid" id="vend"></div></div>';
    $('#app').innerHTML = `<div class="card"><h2>Usługi zewnętrzne <span class="livetag"><i class="dot pulse"></i>NA ŻYWO</span><span class="sub">statusy i awarie dostawców, sondy osiągalności</span><span class="spacer"></span><span id="seg-ext2" class="pill">łączenie…</span></h2><div id="extall"></div></div>${second}`;
    built = 'uslugi';
  }
  function xTick() {
    if (X && !X.disabled) { const st = Date.now() - xAt > 12000; if (st !== xStale) { xStale = st; renderExternal(); return; } }
    document.querySelectorAll('#ext [data-ts], #extall [data-ts]').forEach(e => { const a = xAge(+e.dataset.ts), t = a < 1 ? 'przed chwilą' : Math.round(a) + ' s temu'; if (e.textContent !== t) e.textContent = t; });
    document.querySelectorAll('#ext [data-age], #extall [data-age]').forEach(e => { const a = xAge(+e.dataset.age), t = a.toFixed(1) + ' s'; if (e.textContent !== t) e.textContent = t; e.classList.toggle('late', a > +e.dataset.target); });
  }
  const onExt = m => { X = m; xAt = Date.now(); if (m.serverNow) xOff = m.serverNow - Date.now(); xStale = false; renderExternal(); };
  function connectExt() {
    fetch('/api/external').then(r => r.json()).then(m => { if (!X) onExt(m); }).catch(() => {});
    const es = new EventSource('/api/external/stream');
    es.onmessage = m => onExt(JSON.parse(m.data));
    es.onerror = () => setTimeout(() => { es.close(); connectExt(); }, 1500);
  }
  document.addEventListener('toggle', e => { const t = e.target; if (t.classList && t.classList.contains('xp')) { t.open ? xOpen.add(t.dataset.id) : xOpen.delete(t.dataset.id); } }, true);
  setInterval(xTick, 1000);

  /* ------------------------------------------------------------------------------ model trained on REAL New Relic data (replay) */
  let NRM = null, nrId = null, nrR = null, nrI = 0, nrTimer = null;
  const LVN = ['OK', 'Obserwuj', 'Ostrzeżenie', 'Alarm'], LVC = ['ok', 'info', 'warn', 'bad'];
  const mm = (a, b) => Math.round((d(b) - d(a)) / 60000);
  function nrChart() {
    const F = nrR.frames, n = F.length, W = 1100, H = 230, L = 34, Rr = 8, T = 10, B = 26, t0 = d(F[0].ts), t1 = d(F[n - 1].ts), X = t => L + (d(t) - t0) / (t1 - t0) * (W - L - Rr), Y = v => T + (100 - v) / 100 * (H - T - B);
    const bands = [[0, 50, 'ok'], [50, 75, 'info'], [75, 88, 'warn'], [88, 100, 'bad']].map(([a, b, c]) => `<rect x="${L}" y="${Y(b)}" width="${W - L - Rr}" height="${Y(a) - Y(b)}" fill="var(--${c === 'ok' ? 'ok' : c})" opacity=".07"/>`).join('');
    const pts = F.map(f => `${X(f.ts).toFixed(1)},${Y(f.risk).toFixed(1)}`).join(' ');
    let mi = 0; const mark = (ts, lab, col) => { if (!ts || d(ts) < t0 || d(ts) > t1) return ''; const x = X(ts); return `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="${col}" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${x + 4}" y="${T + 12 + 14 * (mi++)}" style="fill:${col};font-weight:700">${lab}</text>`; };
    const cx = X(F[nrI].ts);
    const ticks = [0, 25, 50, 75, 100].map(v => `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    const xt = [0, .25, .5, .75, 1].map(p => { const t = new Date(+t0 + p * (t1 - t0)); return `<text x="${L + p * (W - L - Rr)}" y="${H - 8}" text-anchor="middle">${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}</text>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ryzyko modelu w czasie">${bands}${ticks}${xt}<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>${mark(nrR.start, 'start (Jira)', 'var(--bad)')}${mark(nrR.detected, 'wykryli ludzie', 'var(--violet)')}${mark(nrR.warning || nrR.watch, 'model', 'var(--ok)')}<line x1="${cx}" x2="${cx}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-width="1.2" opacity=".7"/><circle cx="${cx}" cy="${Y(F[nrI].risk)}" r="4.5" fill="var(--ink)"/></svg>`;
  }
  function nrCursor() {
    const f = nrR.frames[nrI], r = nrR;
    $('#nr-chart').innerHTML = nrChart();
    $('#nr-slider').value = nrI;
    $('#nr-now').innerHTML = `<div class="inc-head"><h3>${f.ts.slice(11)}</h3><span class="pill ${LVC[f.lvl]}">${LVN[f.lvl]}</span><span class="muted">ryzyko <b>${f.risk}</b>/100 · odchylonych encji: <b>${f.n_anom}</b> · ${mm(r.start, f.ts) >= 0 ? mm(r.start, f.ts) + ' min po starcie awarii (Jira)' : -mm(r.start, f.ts) + ' min przed startem awarii (Jira)'}</span></div>`
      + (f.ents.length ? `<table><thead><tr><th>Co odbiega od normy</th><th>Metryka</th><th>Odchylenie</th><th>Wartość</th><th>Norma</th></tr></thead><tbody>${f.ents.slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || (b.b > 0 ? b.v / b.b : 1e9) - (a.b > 0 ? a.v / a.b : 1e9)).map(e => `<tr><td>${esc(e.e)}</td><td class="muted">${esc(e.m)}</td><td><b class="${Math.abs(e.z) >= 20 ? 'hot' : ''}">${Math.abs(e.z) >= 100 ? (e.z > 0 ? '≥ +100' : '≤ −100') : (e.z > 0 ? '+' : '') + e.z}σ</b></td><td>${e.v}</td><td class="muted">${e.b == null ? '—' : e.b}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Brak encji odbiegających od normy o więcej niż 6σ.</div>')
      + (f.grp.length ? `<h3 style="margin:12px 0 6px">Szerokość odchylenia <span class="muted small">(1,0 = próg zdrowego ruchu p99,9)</span></h3>${f.grp.map(g => `<div class="ev" style="grid-template-columns:1fr auto auto"><span>${esc(g.g)}</span><span class="muted">${g.n} z ${g.of} encji</span><b class="${g.r >= 1 ? 'hot' : ''}">×${g.r}</b></div>`).join('')}` : '')
      + (f.match && f.sim >= .3 ? `<div class="notice nr" style="margin-top:10px"><span>Podobne do znanego incydentu <b>${esc(f.match)}</b> (podobieństwo ${Math.round(f.sim * 100)}%).</span></div>` : '');
  }
  function nrVerdict() {
    const r = nrR, sig = r.warning || r.watch, human = mm(r.start, r.detected);
    let v;
    if (sig) { const lead = mm(sig, r.start); v = `<div class="notice nr ${r.warning ? 'warn' : ''}"><span>Model dał <b>${r.warning ? 'ostrzeżenie' : 'sygnał „obserwuj”'}</b> o <b>${sig.slice(11)}</b>, czyli <b>${lead > 0 ? lead + ' min przed' : lead === 0 ? 'równo ze' : -lead + ' min po'}</b> startem awarii w Jirze. ${r.onset_owner ? `Właściciel danych wskazuje, że metryki zaczęły się psuć już o <b>${r.onset_owner.slice(11)}</b> (${mm(r.onset_owner, sig) > 0 ? 'model zareagował ' + mm(r.onset_owner, sig) + ' min po tym' : 'model zareagował wcześniej'}). ` : ''}Ludzie wykryli ją ${human > 0 ? human + ' min po starcie' : human === 0 ? 'w chwili startu' : 'przed oficjalnym startem'}.</span></div>`; }
    else v = `<div class="notice nr" style="background:var(--bad-bg);border-color:var(--bad)"><span>Model <b>nie dał sygnału</b> (maks. ryzyko ${r.max_risk ?? '—'}/100). W tym oknie eksport zawiera ${r.block === 'NB' ? 'głównie testy syntetyczne (monitory), a nie hosty i aplikacje, więc awaria nie zmieniła mierzonych metryk' : 'metryki, ale odchylenie było poniżej progu zdrowego ruchu'}.</span></div>`;
    $('#nr-verdict').innerHTML = `<div style="margin-bottom:8px"><b>${esc(r.key)}</b> <span class="sev ${r.prio}">${r.prio}</span> <span class="muted">${esc(r.title)}</span></div><div class="small muted" style="margin-bottom:8px">Przyczyna w Jirze: ${esc(r.cause)} · usługa: ${esc(r.service)} · start ${r.start.slice(11)}, koniec ${r.end.slice(11)}, wykrycie ${r.detected.slice(11)}</div>` + v;
  }
  async function nrPick(id) {
    clearInterval(nrTimer); nrTimer = null; nrId = id;
    nrR = await (await fetch('/api/nr/replay?id=' + encodeURIComponent(id))).json();
    const F = nrR.frames, st = F.findIndex(f => f.ts >= nrR.start.slice(0, 16)); nrI = Math.max(0, st - 8);
    $('#nr-slider').max = F.length - 1; $('#nr-play').textContent = '▶ Odtwórz'; nrVerdict(); nrCursor();
  }
  async function renderNR() {
    $('#app').innerHTML = '<div class="empty">Ładowanie modelu z danych New Relic…</div>';
    const res = await fetch('/api/nr/model');
    if (!res.ok) { $('#app').innerHTML = `<div class="card"><h2>Model z danych New Relic</h2><div class="note-box">${esc((await res.json()).error)}</div></div>`; return; }
    NRM = await res.json(); const M = NRM.meta, V = NRM.valid, fa = V.false_alarms.reduce((a, r) => (r.level === 'warning' ? a.w.push(r) : a.o.push(r), a), { w: [], o: [] });
    const nbw = V.false_alarms.find(r => r.block === 'NB' && r.level === 'warning'), nbo = V.false_alarms.find(r => r.block === 'NB' && r.level === 'watch');
    const sig = V.incidents.filter(i => i.warning || i.watch).length;
    $('#app').innerHTML = `
      <div class="card"><h2>Model wytrenowany na prawdziwych danych New Relic <span class="pill ok">dane rzeczywiste</span></h2>
        <div class="grid g2"><dl class="kv"><dt>Dane</dt><dd>${nf(M.rows)} wierszy (${nf(M.rows_valued)} z wartością), ${M.groups} grup metryk, ${nf(M.entities)} encji z odchyleniami, ${M.span[0]} … ${M.span[1]}</dd><dt>Co model się nauczył</dt><dd>normę każdej encji (${esc(M.baseline)}) oraz próg zdrowej szerokości odchylenia każdej grupy (p99,9 z dni bez awarii)</dd><dt>Co uznaje za odchylenie</dt><dd>encja dalej niż ${M.z_anom}σ (odchylenie robustne) od normy; sygnał rośnie, gdy odchyla się wiele encji naraz</dd><dt>Czego nie umie</dt><dd>nazwać przyczyny: w tabeli jest tylko 9 incydentów, a eksport ma metryki tylko dla części z nich</dd></dl>
        <div><div class="notice nr ${sig >= 5 ? '' : 'warn'}"><span><b>Wynik na 9 incydentach:</b> sygnał z metryk dla <b>${sig}</b> z ${V.incidents.length} okien (pozostałe: eksport nie zawiera metryk, których awaria dotknęła). Fałszywe ostrzeżenia w dniach bez awarii: ${nbw ? nbw.per_day : '—'} na dobę (okno NB, ${nbw ? Math.round(nbw.healthy_days) : '—'} dni), sygnały „obserwuj”: ${nbo ? nbo.per_day : '—'} na dobę.</span></div></div></div></div>
      <div class="card" style="margin-top:16px"><h2>Powtórka incydentu <span class="sub">model liczy ryzyko z metryk i pokazuje, co odbiega od normy; ramki co 5 lub 10 min</span></h2>
        <div class="inc-head"><select id="nr-sel" class="fcsel" style="margin-left:0">${NRM.replays.map(r => `<option value="${esc(r.id)}">${esc(r.key)} (${r.block === 'NB' ? 'okno NB' : 'okno CUE'}): ${esc(r.title.slice(0, 70))}</option>`).join('')}</select><button class="btn" id="nr-play">▶ Odtwórz</button><input type="range" id="nr-slider" min="0" max="1" value="0" style="flex:1;min-width:160px"></div>
        <div id="nr-verdict" style="margin:10px 0"></div><div class="chart" id="nr-chart"></div>
        <div class="legend"><span><i style="background:var(--accent)"></i>ryzyko modelu (0–100)</span><span><i style="background:var(--bad)"></i>start awarii (Jira)</span><span><i style="background:var(--violet)"></i>wykrycie przez ludzi</span><span><i style="background:var(--ok)"></i>pierwszy sygnał modelu</span></div>
        <div id="nr-now" style="margin-top:12px"></div></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h2>Walidacja na 9 incydentach <span class="sub">model uczony bez etykiet awarii; okna awarii wyłączone z progów</span></h2><div class="table-wrap"><table><thead><tr><th>Incydent</th><th>Okno</th><th>Maks. ryzyko</th><th>Pierwszy sygnał</th><th>Względem startu</th></tr></thead><tbody>${V.incidents.map(i => { const s = i.warning || i.watch; return `<tr><td>${esc(i.key)}</td><td class="muted">${i.block === 'NB' ? 'NB' : 'CUE'}</td><td>${i.max_risk ?? '—'}</td><td>${s ? `<span class="pill ${i.warning ? 'warn' : 'info'}">${i.warning ? 'ostrzeżenie' : 'obserwuj'} ${s.slice(11)}</span>` : '<span class="pill">brak sygnału</span>'}</td><td>${s ? (mm(s, i.start) > 0 ? mm(s, i.start) + ' min przed' : mm(s, i.start) === 0 ? 'równo' : -mm(s, i.start) + ' min po') : '—'}</td></tr>`; }).join('')}</tbody></table></div><div class="small muted" style="margin-top:6px">Okno NB to głównie monitory syntetyczne, dlatego tam awarie prawie nie zmieniają mierzonych metryk. Dla AIIT-3006 eksport nie zawiera żadnych metryk (brak ramek).</div></div>
      <div class="card"><h2>Co odbiega przy awariach <span class="sub">grupy metryk, które przekroczyły próg wokół startu</span></h2><div class="table-wrap"><table><thead><tr><th>Metryka</th><th>Przekroczenia</th><th>Szczyt</th><th>Fałszywie w zdrowych dniach</th></tr></thead><tbody>${NRM.leads.slice(0, 10).map(l => `<tr><td>${esc(l.g)}</td><td><b>${l.hits}</b> z ${l.n}</td><td>×${l.peak}</td><td class="muted">${l.healthy}%</td></tr>`).join('')}</tbody></table></div><div class="small muted" style="margin-top:6px">To obserwacja z ${NRM.leads[0] ? NRM.leads[0].n : 0} incydentów z metrykami hostów i aplikacji, nie reguła statystyczna.</div></div></div>
      <div class="note-box" style="margin-top:16px">Uczciwie: model działa na prawdziwych metrykach, ale prawdziwe incydenty z tego eksportu dają sygnał tylko w oknach CUE (hosty, ALB, aplikacje). Wyniki dotyczą 9 incydentów i nie są statystyką. Na produkcji model liczyłby ryzyko z bieżącego strumienia New Relic; tu odtwarzamy historię.</div>`;
    $('#nr-sel').onchange = e => nrPick(e.target.value);
    $('#nr-slider').oninput = e => { nrI = +e.target.value; nrCursor(); };
    $('#nr-play').onclick = () => { if (nrTimer) { clearInterval(nrTimer); nrTimer = null; $('#nr-play').textContent = '▶ Odtwórz'; return; } if (nrI >= nrR.frames.length - 1) nrI = 0; $('#nr-play').textContent = '❚❚ Pauza'; nrTimer = setInterval(() => { if (nrI >= nrR.frames.length - 1) { clearInterval(nrTimer); nrTimer = null; $('#nr-play').textContent = '▶ Odtwórz'; return; } nrI++; nrCursor(); }, 450); };
    const first = NRM.replays.find(r => r.warning) || NRM.replays[0]; $('#nr-sel').value = first.id; nrPick(first.id);
  }


  /* ------------------------------------------------------------------------------ thresholds */
  async function renderThresholds() {
    $('#app').innerHTML = '<div class="empty">Ładowanie progów…</div>';
    const D = await (await fetch('/api/thresholds')).json(), C = D.cards, L = Object.values(D.learned), M = D.manual, NRL = D.nr || [];
    const max = Math.max(...L.map(x => x.thr), .01);
    $('#app').innerHTML = `
      <div class="card"><h2>Progi kart wyuczone z prawdziwych danych <span class="pill ok">z danych</span></h2>
        <p class="muted" style="margin:0 0 12px">Dla każdej karty i metryki: jaki odsetek jej encji (aplikacji, hostów, dystrybucji, monitorów) odbiega od własnej normy o więcej niż 6σ w <b>zdrowych</b> oknach (bez okien incydentów ±3 h/2 h). Próg to <b>p${(D.quant * 100).toString().replace('.', ',')}</b> tego odsetka (nie mniej niż 3%). Karta zmienia stan, gdy odsetek przekroczy próg w dwóch kolejnych oknach, a „alarm” przy 2× progu lub dwóch metrykach naraz.</p>
        <div class="table-wrap"><table><thead><tr><th>Karta</th><th>Metryka</th><th>Okno</th><th style="width:24%">Próg (odsetek encji)</th><th>Zdrowe okna: mediana / p99</th><th>Zdrowych okien</th></tr></thead><tbody>${L.sort((a, b) => a.card.localeCompare(b.card) || a.kind.localeCompare(b.kind) || a.thr - b.thr).map(x => `<tr><td>${esc(C[x.card].name)}</td><td class="muted">${esc(x.metric)}</td><td class="muted">${x.kind === 'NB' ? 'NB (10 min)' : 'CUE (5 min)'}</td>
          <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:8px;background:var(--panel2);border-radius:4px"><div style="width:${Math.max(3, x.thr / max * 100)}%;height:8px;background:${x.thr <= 0.0301 ? 'var(--warn)' : 'var(--accent)'};border-radius:4px"></div></div><b>${(x.thr * 100).toFixed(1)}%</b></div></td><td class="muted">${(x.med * 100).toFixed(1)}% / ${(x.p99 * 100).toFixed(1)}%</td><td class="muted">${nf(x.n)} (${x.days} dnia)</td></tr>`).join('')}</tbody></table></div>
        <div class="note-box small" style="margin-top:12px"><b>Fałszywe alerty kart przy tych progach</b> (zdrowe okna, bez dni z incydentami): ${(D.healthy || []).map(h => `${h.block}: ${h.episodes} epizodów w ${h.days} dnia (${String(h.per_day).replace('.', ',')}/dobę)`).join('; ')}. Pojedyncza karta bez potwierdzenia z innych źródeł daje tylko ostrzeżenie na kanałach, pager po 15 min.</div><div class="small muted" style="margin-top:8px">Pomarańczowy pasek: próg uczony byłby niższy niż 3%, użyto dolnego progu. Karta „Player i wideo” ma próg 100%: tylko 9 monitorów, które w zdrowych dniach często zawodzą naraz, więc praktycznie nie alarmuje.</div></div>
      <div class="card" style="margin-top:16px"><h2>Progi modelu NR (20 grup metryk) <span class="pill ok">z danych</span></h2><div class="table-wrap"><table><thead><tr><th>Grupa metryk</th><th>Okno</th><th>Próg</th><th>≈ encji</th><th>Zdrowych okien</th></tr></thead><tbody>${NRL.map(x => `<tr><td>${esc(x.g)}</td><td class="muted">${x.win}</td><td><b>${(x.thr * 100).toFixed(1)}%</b></td><td>${x.ent_at_thr < 1 ? '1 (dolny próg)' : '≈ ' + Math.round(x.ent_at_thr) + ' z ' + x.n_ent}</td><td class="muted">${nf(x.n_win)} (${x.days} dnia)</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><h2>Ustawione ręcznie <span class="pill warn">nie z danych</span></h2><div class="table-wrap"><table><thead><tr><th>Reguła</th><th>Wartość</th></tr></thead><tbody>
        <tr><td>Infolinia: skok względem normy</td><td><b>≥ ${M.calls_z}σ i ≥ ${M.calls_min} połączeń / 5 min</b></td></tr><tr><td>Analityka: błędy playera</td><td><b>≥ ${Math.round(M.ga_rate * 100)}%</b>, starty < ${Math.round(M.ga_ratio * 100)}% normy</td></tr>
        <tr><td>Pager</td><td><b>≥ ${M.page_lanes} źródła zgodne</b> albo po ${M.safeguard_min} min samego ostrzeżenia</td></tr><tr><td>Eskalacja</td><td><b>II linia po ${M.esc1_min} min, kierownik po ${M.esc2_min} min</b> bez potwierdzenia</td></tr>
        <tr><td>Zamknięcie incydentu</td><td><b>${M.close_min} min bez sygnałów</b></td></tr><tr><td>Odchylenie encji</td><td><b>≥ 6σ</b> (odchylenie robustne od normy z 7 dni)</td></tr><tr><td>Waga incydentu</td><td>P1: ≥3 źródła lub 2 źródła z alarmem; P2: 2 źródła lub alarm; P3: jedno źródło</td></tr></tbody></table></div>
        <p class="muted small" style="margin:10px 0 0">Reguły eskalacji i wagi to założenia procesu, a nie wynik uczenia.</p></div>`;
  }

  /* ------------------------------------------------------------------------------ data and sources */
  async function renderData() {
    $('#app').innerHTML = '<div class="empty">Ładowanie…</div>';
    const [D, SC] = await Promise.all([fetch('/api/thresholds').then(r => r.json()), fetch('/api/scenarios').then(r => r.json())]);
    $('#app').innerHTML = `<div class="card"><h2>Skąd pochodzą dane w pokazie</h2><div class="table-wrap"><table><thead><tr><th>Element</th><th>Źródło</th><th>Rzeczywiste?</th></tr></thead><tbody>
      ${Object.values(D.cards).map(c => `<tr><td>${esc(c.name)} <span class="muted small">(${c.kind === 'vendor' ? 'zewnętrzny' : 'wewnętrzny'})</span></td><td class="muted">${esc(c.desc)}</td><td><span class="pill ok">prawdziwe metryki New Relic</span></td></tr>`).join('')}
      <tr><td>Model NR (ryzyko, odchylenia)</td><td class="muted">progi i normy nauczone z 10,3 mln wierszy</td><td><span class="pill ok">z prawdziwych danych</span></td></tr>
      <tr><td>Infolinia</td><td class="muted">generowana z prawdziwego wpływu na użytkowników: wzór dobowy z ruchu CloudFront, wzrost po sygnałach, opóźnienie 10 min</td><td><span class="pill warn">symulacja</span></td></tr>
      <tr><td>Google Analytics</td><td class="muted">użytkownicy i starty z ruchu CloudFront, błędy playera rosną razem z wpływem na użytkowników</td><td><span class="pill warn">symulacja</span></td></tr>
      <tr><td>Tryb „Generator awarii”</td><td class="muted">usługi, dostawcy, infolinia, analityka i incydenty z Huba v2 (port 8642) czytającego generator (port 8641); awarie wstrzyknięte w generatorze zmieniają odczyty. Czas i daty to czas symulacji</td><td><span class="pill warn">symulacja</span></td></tr>
      <tr><td>Usługi zewnętrzne: statusy i awarie dostawców <span class="muted small">(AWS, Azure, Microsoft 365, Google Cloud, Cloudflare…)</span></td><td class="muted">moduł status_uslug: oficjalne feedy statusów dostawców i sondy osiągalności z tego komputera, odświeżane co kilka sekund; niezależne od odtwarzanego okna i nieużywane przez silnik incydentów</td><td><span class="pill ok">prawdziwe, na żywo</span></td></tr></tbody></table></div></div>
      <div class="card" style="margin-top:16px"><h2>Scenariusze: 9 prawdziwych incydentów i spokojny dzień</h2><div class="table-wrap"><table><thead><tr><th>Scenariusz</th><th>Start (Jira)</th><th>Przyczyna</th><th>Karty z danymi</th><th>Czy dane zawierają ślad?</th></tr></thead><tbody>${SC.map(s => `<tr><td><b>${esc(s.id)}</b> <span class="muted">${esc(s.title.slice(0, 60))}</span></td><td>${s.jira ? esc(s.jira.start) : '—'}</td><td>${s.jira ? esc(s.jira.cause) : '—'}</td><td class="muted">${s.has.length} z 10</td><td>${s.jira ? (s.signal ? '<span class="pill ok">tak</span>' : '<span class="pill">brak sygnału w eksporcie</span>') : '<span class="pill ok">test fałszywych alarmów</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="note-box small" style="margin-top:12px">Eksport New Relic zawiera pełne metryki (aplikacje, hosty, ALB, CloudFront, monitory) tylko dla 3 okien (AIIT-2686, AIIT-2987, MIT-31). Dla pozostałych 6 incydentów są wyłącznie monitory syntetyczne, w których awarie prawie nie zostawiły śladu, dlatego Hub ich nie widzi.</div></div>`;
  }

  /* ------------------------------------------------------------------------------ source: failure generator (Hub v2 reading the generator, simulated platform) */
  let mode = (() => { try { return localStorage.getItem('hub-mode') === 'gen' ? 'gen' : 'replay'; } catch (e) { return 'replay'; } })(), G = null, gTimer = null, gBusy = false, gAnchor = null;
  const GSRC = { servers: 'Serwery', status: 'Statusy', calls: 'Infolinia', analytics: 'Analityka', model: 'Model' };
  function gOk() { return !!(G && !G.offline && G.ready); }
  async function pollGen() {
    if (gBusy) return; gBusy = true;
    try { const r = await fetch('/api/gen/state'); G = r.ok ? await r.json() : { offline: true, error: 'Serwer pokazówki działa ze starym kodem (bez obsługi generatora). Zrestartuj: ./stop_all.command, potem ./start_all.command.' }; } catch (e) { G = { offline: true, error: 'Brak odpowiedzi serwera pokazówki.' }; }
    gBusy = false;
    if (G.clock && !gAnchor) gAnchor = G.clock;
    if (mode === 'gen') render();
  }
  function setMode(m) {
    mode = m; try { localStorage.setItem('hub-mode', m); } catch (e) { /* tryb prywatny przeglądarki */ }
    clearInterval(gTimer); gTimer = null;
    if (m === 'gen') { G = null; gAnchor = null; pollGen(); gTimer = setInterval(pollGen, 1000); }
    built = null; render();
  }
  function applyLabels() {
    const g = mode === 'gen', set = (id, t) => { const e = $(id); if (e && e.textContent !== t) e.textContent = t; };
    set('#svc-sub', g ? 'symulacja z generatora awarii: ruch (linia) kontra oczekiwany z modelu historycznego (przerywana)' : 'prawdziwe encje z New Relic: wartość (linia) i norma z tej samej pory doby (przerywana)');
    set('#rep-note', g ? 'Infolinia i Google Analytics z generatora awarii (symulacja).' : 'Generowane z prawdziwych sygnałów (wpływ na użytkowników). Eksport New Relic ich nie zawiera.');
    set('#feed-sub', g ? 'czas symulacji' : 'czas odtwarzania');
  }
  function gDraft(inc) {
    const h = inc.hyps[0], sv = [...new Set(inc.evidence.map(e => e.service).filter(Boolean))].map(k => (G.services.find(x => x.key === k) || {}).name).filter(Boolean);
    return `Obserwujemy problem w usługach: ${sv.join(', ') || 'serwisu'}. Najbardziej prawdopodobna przyczyna: ${h ? h.title : 'w trakcie ustalania'}. Zespół dyżurny zajmuje się sprawą, kolejna informacja za 15 min.`;
  }
  function gBanner() {
    const inc = G.incident;
    let cls = 'ok', ico = '✓', big = 'Wszystko działa', txt = `${G.services.length} usług w normie, dostawcy bez zgłoszeń. Czas symulacji ${hm(G.clock)}.`;
    if (!G.connected) { cls = 'off'; ico = '…'; big = 'Hub nie widzi generatora'; txt = esc(G.error || 'czekam na dane'); }
    else if (inc) {
      const h = inc.hyps[0], over = inc.active_n === 0;
      cls = over ? 'info' : inc.sev === 'P1' ? 'bad' : 'warn'; ico = over ? '↘' : inc.sev === 'P1' ? '!' : '▲'; big = over ? 'Sygnały ustały' : inc.sev === 'P1' ? 'Awaria' : 'Problem';
      txt = `${h ? esc(h.title) : 'analizuję'} · źródła: ${inc.srcs.map(s => GSRC[s]).join(', ') || '—'} · od ${inc.elapsed} min${over ? ' · obserwuję jeszcze 10 min przed zamknięciem' : ''}`;
    } else if (G.notices.length) { cls = 'info'; ico = '↗'; big = 'Podwyższona aktywność'; txt = esc(G.notices[0].text); }
    $('#banner').innerHTML = `<div class="banner ${cls}"><div class="ico">${ico}</div><div><div class="big">${big}</div><div class="txt">${txt}</div></div><div class="stats"><div><b>${inc ? 1 : 0}</b><span>otwarte incydenty</span></div><div><b>${G.closed.length}</b><span>zamknięte</span></div><div><b>${G.services.filter(x => x.status !== 'ok').length}/${G.services.length}</b><span>usług z problemem</span></div></div></div>`;
  }
  function gSvcs() {
    const nb = G.services.filter(x => x.status !== 'ok').length, pill = $('#seg-int');
    pill.className = 'pill ' + (G.services.some(x => x.status === 'bad') ? 'bad' : nb ? 'warn' : 'ok'); pill.textContent = nb ? `${nb} z ${G.services.length} z problemem` : `${G.services.length} z ${G.services.length} działa`;
    $('#svcs').innerHTML = G.services.map(s => {
      const l = s.last || {}, col = s.status === 'bad' ? css('--bad') : s.status === 'warn' ? css('--warn') : css('--accent');
      return `<div class="sv ${s.status}"><div class="hd"><span class="dot ${STC[s.status]}"></span><strong>${esc(s.name)}</strong><span class="pill ${STC[s.status]}">${s.status === 'ok' ? 'działa' : s.status === 'warn' ? 'problem' : 'awaria'}</span></div>
        <div class="nums"><div><b>${nf(l.rpm)}</b><span>req/min</span></div><div><b class="${l.resp > l.resp_exp * 1.8 ? 'bad' : ''}">${nf(l.resp)}</b><span>ms</span></div><div><b class="${l.err >= 3 ? 'bad' : ''}">${nf(l.err, 1)}%</b><span>błędy</span></div><div><b class="${l.cpu >= 90 ? 'bad' : l.cpu >= 75 ? 'hot' : ''}">${nf(l.cpu)}%</b><span>cpu</span></div></div>
        ${mini({ a: s.series.rpm, e: s.series.exp }, col)}${s.reasons.length ? `<div class="why bad">${esc(s.reasons[0])}</div>` : ''}${s.notice && s.notice.risk ? '<div class="note risk">Prognoza: ryzyko przeciążenia</div>' : ''}</div>`;
    }).join('');
  }
  function gVendors() {
    const el = $('#gvend'); if (!el) return;
    if (!gOk()) { el.innerHTML = '<div class="empty">Brak danych z Huba generatora.</div>'; return; }
    const V = G.vendors, bad = V.filter(v => v.status !== 'operational').length, sus = V.filter(v => v.suspect).length, pill = $('#seg-gv');
    pill.className = 'pill ' + (bad ? 'bad' : sus ? 'warn' : 'ok'); pill.textContent = bad ? `${bad} z ${V.length} z problemem` : sus ? 'podejrzenie awarii' : `${V.length} z ${V.length} działa`;
    el.innerHTML = V.map(v => {
      const b = v.status !== 'operational', deps = v.services.map(k => G.services.find(x => x.key === k)).filter(Boolean), n = deps.length ? deps[0].series.t.length : 0;
      const sum = f => Array.from({ length: n }, (_, i) => deps.reduce((s, x) => s + (x.series[f][i] || 0), 0));
      const last = deps.map(x => x.last || {}), err = Math.max(0, ...last.map(l => l.err || 0)), hit = deps.filter(x => x.status !== 'ok').length, rpm = last.reduce((s, l) => s + (l.rpm || 0), 0);
      const cls = b ? (v.status === 'outage' ? 'bad' : 'warn') : v.suspect ? 'warn' : '', col = cls === 'bad' ? css('--bad') : cls === 'warn' ? css('--warn') : css('--accent');
      return `<div class="sv ${cls}"><div class="hd"><span class="dot ${cls || 'ok'}"></span><strong>${esc(v.name)}</strong><span class="pill ${b ? 'bad' : 'ok'}">${b ? esc(v.status) : 'operational'}</span></div>
        <div class="nums"><div><b>${deps.length}</b><span>zależne usługi</span></div><div><b>${nf(rpm)}</b><span>req/min</span></div><div><b class="${cls && err >= 3 ? 'bad' : ''}">${nf(err, 1)}%</b><span>błędy (maks.)</span></div><div><b class="${cls && hit ? 'bad' : ''}">${hit}/${deps.length}</b><span>z problemem</span></div></div>
        ${mini({ a: sum('rpm'), e: sum('exp') }, col)}
        <div class="why ${b ? 'bad' : ''}">${b ? esc(v.message) + ' (od ' + hm(v.since) + ')' : v.suspect ? '' : 'bez zgłoszeń dostawcy'}</div>${v.suspect ? '<div class="note risk">Hub podejrzewa awarię mimo braku komunikatu</div>' : ''}
        <div class="small muted" style="margin-top:6px">Wykres: ruch usług zależnych (efekt, nie metryka dostawcy). Zależne: ${deps.map(x => esc(x.name)).join(', ')}.</div></div>`;
    }).join('');
  }
  function gReports() {
    const C = G.calls || { info: {}, wait: {} }, A = G.ga || {}, rows = Object.values(C.info), alert = G.tiles.calls.state === 'alert', ga = G.tiles.analytics.state === 'alert', watch = rows.some(r => r.z >= 2), pill = $('#seg-rep');
    pill.className = 'pill ' + (alert || ga ? 'bad' : watch ? 'warn' : 'ok'); pill.textContent = alert || ga ? 'skok zgłoszeń' : watch ? 'rosnące zgłoszenia' : 'w normie';
    const mx = Math.max(1, ...rows.map(r => Math.max(r.sum5, r.exp)));
    $('#calls').innerHTML = '<h3 style="margin:0 0 8px">Infolinia <span class="muted small">połączenia w ostatnich 5 min kontra norma</span></h3>' + (rows.length ? rows.map(r => `<div class="rep"><span>${esc(r.name)}</span><div class="bar"><i style="width:${r.exp / mx * 100}%" class="exp"></i><i style="width:${r.sum5 / mx * 100}%" class="${r.z >= 4 ? 'bad' : r.z >= 2 ? 'warn' : ''}"></i></div><b class="${r.z >= 4 ? 'bad' : ''}">${r.sum5}</b><span class="muted small">norma ${r.exp}</span></div>`).join('')
      + `<div class="small muted" style="margin-top:8px">Czas oczekiwania: <b>${C.wait.wait_s ?? '—'} s</b>, porzucone: <b>${C.wait.abandoned == null ? '—' : Math.round(C.wait.abandoned * 100) + '%'}</b></div>` : '<div class="muted">Brak danych z infolinii.</div>');
    const rate = A.rate != null ? A.rate * 100 : null;
    $('#ga').innerHTML = `<h3 style="margin:0 0 8px">Google Analytics <span class="muted small">zachowanie widzów w ostatniej minucie</span></h3><div class="nums3"><div><b>${nf(A.users || 0)}</b><span>aktywni użytkownicy (norma ok. ${nf(A.users_exp || 0)})</span></div><div><b>${nf(A.starts || 0)}</b><span>starty playera (norma ok. ${nf(A.exp_starts || 0)})</span></div><div><b class="${A.rate >= .06 ? 'bad' : ''}">${rate == null ? '—' : rate.toFixed(1)}%</b><span>błędy playera (norma ${A.base_rate != null ? (A.base_rate * 100).toFixed(1) : '—'}%)</span></div></div>`;
  }
  function gInc() {
    const inc = G.incident;
    if (!inc) {
      $('#inc').innerHTML = '<h2>Centrum incydentów</h2><div class="empty" style="padding:26px 0"><div style="font-size:30px">✓</div><b>Brak otwartych incydentów</b><div class="muted small">Hub porównuje wszystkie źródła z oczekiwanym zachowaniem i odezwie się, gdy coś się rozjedzie. Wstrzyknij awarię w panelu generatora.</div></div>' + (G.closed.length ? `<h3 style="margin:8px 0">Ostatnio zamknięte</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Waga</th><th>Od</th><th>Przyczyna</th><th>Do potwierdzenia</th></tr></thead><tbody>${G.closed.slice().reverse().map(c => `<tr><td>${c.id}</td><td><span class="sev ${c.sev}">${c.sev}</span></td><td>${hm(c.start)}</td><td>${esc(c.hyps[0] ? c.hyps[0].title : '—')}</td><td>${c.tta == null ? 'brak' : c.tta + ' min'}</td></tr>`).join('')}</tbody></table></div>` : '');
      return;
    }
    const st = inc.ack ? 'podjęty' : inc.page ? 'pager wysłany' : 'wiadomość na kanale', nextEsc = inc.ack ? null : inc.page ? (inc.esc < 1 ? [5, 'II linia'] : inc.esc < 2 ? [15, 'kierownik'] : null) : [15, 'awans do pagera'];
    const since = nextEsc ? Math.max(0, nextEsc[0] - Math.round((d(G.clock) - d(inc.page || inc.head)) / 60000)) : null, dr = gDraft(inc);
    $('#inc').innerHTML = `<div class="inc-head"><span class="sev ${inc.sev}">${inc.sev}</span><h3>Incydent #${inc.id}</h3><span class="pill ${inc.ack ? 'ok' : inc.page ? 'bad' : 'warn'}">${st}</span>${inc.active_n === 0 ? '<span class="pill info">sygnały ustały</span>' : ''}<span class="muted small">pierwszy sygnał ${hm(inc.head)} · ${inc.elapsed} min temu${inc.page ? ' · pager ' + hm(inc.page) : ''}${inc.ack ? ' · potwierdzone ' + hm(inc.ack) + ' (' + esc(inc.ack_by) + ')' : ''}</span></div>
      ${!inc.ack ? `<div style="margin-bottom:10px"><button class="btn big primary" id="ack">Potwierdzam: zajmuję się tym</button>${since != null ? ` <span class="muted small">następny krok za ${since} min: ${nextEsc[1]}</span>` : ''}</div>` : ''}
      <h3 style="margin:8px 0">Hipotezy przyczyny</h3>${inc.hyps.slice(0, 3).map((h, i) => `<div class="hyp ${i === 0 ? 'top' : ''}"><div class="t"><span>${i + 1}. ${esc(h.title)}</span><span>${Math.round(h.conf * 100)}%</span></div><div style="height:6px;background:var(--panel);border-radius:3px;margin:6px 0"><div style="height:6px;width:${h.conf * 100}%;background:var(--accent);border-radius:3px"></div></div><ul>${h.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul><div class="act">Co zrobić: ${esc(h.action)}</div></div>`).join('')}
      <h3 style="margin:12px 0 6px">Dowody z ${inc.srcs.length} źródeł <span class="muted small">(${inc.active_n} nadal aktywnych)</span></h3>${inc.evidence.slice(0, 12).map(e => `<div class="ev ${e.active ? '' : 'off'}"><span class="src ${e.source}">${GSRC[e.source] || esc(e.source)}</span><span>${esc(e.detail)}</span><span class="muted">${hm(e.start)}${e.active ? '' : '–' + hm(e.end)}</span></div>`).join('')}
      <h3 style="margin:12px 0 6px">Szkic komunikatu dla interesariuszy</h3><div class="note-box" style="background:var(--panel2);border-color:var(--line)">${esc(dr)} <button class="btn" id="cp" data-t="${esc(dr)}">kopiuj</button></div>`;
  }
  function gSide() {
    $('#tiles').innerHTML = ['status', 'servers', 'calls', 'analytics', 'model'].map(k => {
      const t = G.tiles[k], src = G.sources[k] || {}, stale = !!src.stale, c = stale || t.state === 'alert' ? 'bad' : t.state === 'watch' ? 'warn' : 'ok';
      return `<div class="tile ${stale ? 'bad' : t.state === 'alert' ? 'bad' : ''}"><span class="dot ${c}"></span><div><b>${GSRC[k]}</b> <span class="simtag">SYM.</span><small>${stale ? 'BRAK DANYCH od ' + src.age + ' min: źródło nie odpowiada' : esc(t.text)}</small></div><span class="pill ${c}">${stale ? 'NIE ODPOWIADA' : t.state === 'alert' ? 'ALARM' : t.state === 'watch' ? 'UWAGA' : 'OK'}</span></div>`;
    }).join('');
    $('#feed').innerHTML = G.notes.length ? G.notes.slice(-60).reverse().map(n => `<div class="msg ${n.level}"><span class="t">${hm(n.ts)}</span><b>${esc(n.tag)}</b><div>${esc(n.text)}</div>${n.sub ? `<div class="sub">${esc(n.sub)}</div>` : ''}</div>`).join('') : '<div class="muted small">Cisza. Wszystko w normie.</div>';
  }
  function renderGen() {
    if (G && G.gen_urls) $('#gpanel').href = G.gen_urls.generator;
    if (gOk()) {
      const sp = G.gen_speed, off = Math.abs(Date.now() - Date.parse(G.clock)) / 60000, shifted = rdate(G.clock) !== odate(G.clock);
      $('#gen-info').textContent = `czas symulacji: ${rdate(G.clock)} ${hm(G.clock)}` + (sp == null ? '' : sp === 1 && off < 3 && !shifted ? ' · 1×, zgodny z czasem rzeczywistym' : sp === 1 ? ' · 1×, ale zegar generatora nie zgadza się z czasem rzeczywistym' : ` · przyspieszenie ${sp}×`) + (shifted ? ` (data generatora: ${odate(G.clock)})` : '');
      document.querySelectorAll('#gspeed button').forEach(b => b.classList.toggle('on', +b.dataset.s === sp));
      $('#clock').title = `Czas rzeczywisty. Czas symulacji generatora: ${rdate(G.clock)} ${hm(G.clock)} (daty przesunięte na dziś, oryginał: ${odate(G.clock)})`;
      $('#g-auto').checked = !!(G.cfg && G.cfg.auto_ack);
    } else $('#gen-info').textContent = '';
    if (view === 'dashboard') {
      if (built !== 'dashboard') build();
      applyLabels(); $('#truthc').hidden = true;
      if (!gOk()) {
        const big = !G ? 'Łączenie z Hubem generatora…' : G.offline ? 'Brak połączenia z Hubem generatora' : 'Hub generatora się uruchamia', txt = !G ? 'pobieram stan' : G.offline ? `${esc(G.error)} Możesz też przełączyć źródło na „Odtwarzanie New Relic”.` : esc(G.error || 'uruchamia model i pobiera dane historyczne z generatora');
        $('#banner').innerHTML = `<div class="banner off"><div class="ico">…</div><div><div class="big">${big}</div><div class="txt">${txt}</div></div></div>`;
        renderExternal(); return;
      }
      gBanner(); gSvcs(); renderExternal(); gReports(); gInc(); gSide();
    } else {
      if (built !== 'uslugi') buildUslugi();
      gVendors(); renderExternal();
    }
  }

  /* ------------------------------------------------------------------------------ wiring */
  function controls() {
    if (!S) return;
    $('#play').textContent = S.ended ? '↻ Jeszcze raz' : S.paused ? '▶ Wznów' : '❚❚ Pauza';
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.s === S.speed));
    const t0 = d(S.scenario.t0), t1 = d(S.scenario.t1), now = d(S.clock);
    $('#prog-fill').style.width = (S.idx / Math.max(1, S.n - 1) * 100) + '%';
    const j = S.truth && S.truth.onset ? d(S.truth.onset) : null;
    $('#prog-mark').style.left = j ? ((j - t0) / (t1 - t0) * 100) + '%' : '-10px';
    $('#prog-txt').textContent = `czas odtwarzania: ${rdate(S.clock)} ${hm(S.clock)} (oryginał: ${odate(S.clock)})`;
    $('#t-auto').checked = !!S.cfg.auto_ack;
    if (scenList && $('#scen').value !== S.scenario.id) $('#scen').value = S.scenario.id;
  }
  function render() {
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === view));
    const live = ['dashboard', 'uslugi'].includes(view), g = mode === 'gen';
    $('#ctl').hidden = !live; $('#ctl-replay').hidden = g; $('#ctl-gen').hidden = !g;
    document.querySelectorAll('#src button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    $('#modepill').className = 'pill ' + (g ? 'sim' : 'live'); $('#modetxt').textContent = g ? 'GENERATOR · SYMULACJA' : 'ODTWARZANIE';
    if (g && live) return renderGen();
    if (!S) return;
    $('#clock').title = `Czas rzeczywisty. Czas odtwarzania: ${rdate(S.clock)} ${hm(S.clock)} (daty przesunięte na dziś, oryginał: ${odate(S.clock)})`;
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === view));
    controls();
    if (view === 'dashboard') {
      if (built !== 'dashboard') build();
      applyLabels(); renderBanner(); renderTruth(); renderCards(); renderExternal(); renderReports(); renderInc(); renderSide();
    } else if (view === 'uslugi') {
      if (built !== 'uslugi') buildUslugi();
      renderCards(); renderExternal();
    } else if (built !== view) { built = view; ({ nr: renderNR, progi: renderThresholds, dane: renderData })[view](); }
  }
  function route() { const v = (location.hash.replace('#/', '') || 'dashboard'); view = ['dashboard', 'uslugi', 'nr', 'progi', 'dane'].includes(v) ? v : 'dashboard'; built = null; render(); }
  const pad2 = n => String(n).padStart(2, '0');
  /* Daty odtwarzanego okna pokazujemy przesunięte o całe dni tak, by dzień incydentu (start w Jirze) wypadł dzisiaj; godziny bez zmian.
     To tylko wyświetlanie: dane, godziny i wyniki są prawdziwe z grudnia 2025, a oryginalna data jest zawsze obok lub w podpowiedzi. */
  const dayMs = x => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  const odate = s => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
  function rdate(s) {
    const sc = S && S.scenario, n = new Date(), anchor = mode === 'gen' ? (gAnchor || s) : (sc.jira ? sc.jira.start : sc.t0), shift = Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - dayMs(anchor)) / 864e5), t = new Date(dayMs(s) + shift * 864e5);
    return `${pad2(t.getUTCDate())}.${pad2(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
  }
  function realClock() { const n = new Date(); $('#clock').textContent = `${pad2(n.getDate())}.${pad2(n.getMonth() + 1)} ${pad2(n.getHours())}:${pad2(n.getMinutes())}`; }
  realClock(); setInterval(realClock, 1000);
  window.addEventListener('hashchange', route);
  $('#scen').onchange = e => { post('/api/control', { scenario: e.target.value }); built = null; };
  $('#restart').onclick = () => post('/api/control', { restart: 1 });
  $('#play').onclick = () => post('/api/control', S.ended ? { restart: 1 } : { pause: !S.paused });
  $('#speed').onclick = e => { if (e.target.dataset.s) post('/api/control', { speed: +e.target.dataset.s }); };
  $('#t-auto').onchange = e => post('/api/control', { auto_ack: e.target.checked });
  $('#src').onclick = e => { const m = e.target.dataset.m; if (m && m !== mode) setMode(m); };
  $('#gspeed').onclick = e => { if (e.target.dataset.s) post('/api/gen/generator', { action: 'speed', value: +e.target.dataset.s }); };
  $('#g-auto').onchange = e => post('/api/gen/control', { auto_ack: e.target.checked });
  async function init() {
    scenList = await (await fetch('/api/scenarios')).json();
    $('#scen').innerHTML = scenList.map(s => `<option value="${esc(s.id)}">${esc(s.id === 'QUIET' ? 'Spokojny dzień (test fałszywych alarmów)' : s.id + ' · ' + s.jira.start.slice(0, 10) + ' · ' + s.title.slice(0, 55))}${s.jira ? (s.signal ? '' : ' [brak sygnału w danych]') : ''}</option>`).join('');
  }
  function connect() {
    const es = new EventSource('/api/stream');
    es.onmessage = m => { S = JSON.parse(m.data); if (scenList && !$('#scen').value) $('#scen').value = S.scenario.id; render(); };
    es.onerror = () => setTimeout(() => { es.close(); connect(); }, 1500);
  }
  init().then(() => { route(); connect(); connectExt(); if (mode === 'gen') { pollGen(); gTimer = setInterval(pollGen, 1000); } });
})();
