(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const hm = s => (s ? s.slice(11, 16) : '—');
  const d = s => (s ? new Date(s) : null);
  const nf = (v, n = 0) => Number(v).toLocaleString('pl-PL', { maximumFractionDigits: n });
  const SRC = { servers: 'Serwery', status: 'Statusy', calls: 'Infolinia', analytics: 'Analityka', model: 'Model' };
  const STC = { ok: 'ok', warn: 'warn', bad: 'bad' };
  const DEMO = /[?&]demo=1/.test(location.search);
  let S = null, view = 'dashboard', built = null, sel = 'player', modelData = null;

  /* ------------------------------------------------------------------------------ charts */
  function mini(s, color, mk) {
    const n = s.rpm.length;
    if (n < 2) return '';
    const w = 240, h = 54, max = Math.max(...s.rpm, ...s.exp, 1) * 1.08, X = i => i / (n - 1) * w, Y = v => h - 3 - v / max * (h - 8);
    const path = a => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    const mi = mk && s.t ? s.t.indexOf(mk) : -1, mline = mi >= 0 ? `<line x1="${X(mi).toFixed(1)}" x2="${X(mi).toFixed(1)}" y1="0" y2="${h}" stroke="${css('--bad')}" stroke-width="1.2" stroke-dasharray="2 2"/>` : '';
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${path(s.exp)}" fill="none" stroke="${css('--muted')}" stroke-width="1.4" stroke-dasharray="3 3" opacity=".8"/><path d="${path(s.rpm)}" fill="none" stroke="${color}" stroke-width="2"/>${mline}</svg>`;
  }

  function fcChart(el, key) {
    const F = S.forecast[key];
    if (!F.past.t.length) { el.innerHTML = '<div class="empty">Brak danych z serwerów do prognozy</div>'; return; }
    const W = Math.max(420, el.clientWidth), H = 260, m = { l: 52, r: 14, t: 16, b: 30 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const pt = F.past.t.map(d), ft = F.future.map(x => d(x.ts)), t0 = +pt[0], t1 = +ft[ft.length - 1], now = +d(S.clock);
    const vals = [...F.past.rpm, ...F.past.exp, ...F.future.map(x => x.exp), ...F.future.map(x => x.base)], max = Math.max(...vals, 1) * 1.1;
    const X = t => m.l + (t - t0) / (t1 - t0) * pw, Y = v => m.t + ph - v / max * ph;
    const path = (ts, vs) => ts.map((t, i) => `${i ? 'L' : 'M'}${X(+t).toFixed(1)} ${Y(vs[i]).toFixed(1)}`).join(' ');
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Prognoza obciążenia">`;
    for (let v = 0; v <= 3; v++) { const y = m.t + ph - v / 3 * ph; s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}" stroke="${css('--line')}"/><text x="${m.l - 8}" y="${y + 4}" text-anchor="end">${nf(max * v / 3 / 1000, 1)}k</text>`; }
    for (let t = Math.ceil(t0 / 3600000) * 3600000; t <= t1; t += 3600000) { const x = X(t); s += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${m.t + ph}" stroke="${css('--line')}" opacity=".5"/><text x="${x}" y="${H - 10}" text-anchor="middle">${new Date(t).getHours()}:00</text>`; }
    S.events.filter(e => e.services.includes(key)).forEach(e => {
      const a = Math.max(X(+d(e.start)), m.l), b = Math.min(X(+d(e.end)), m.l + pw);
      if (b > a) s += `<rect x="${a}" y="${m.t}" width="${b - a}" height="${ph}" fill="${css('--info')}" opacity=".13"/><text x="${a + 6}" y="${m.t + 14}" style="fill:${css('--info')};font-weight:700">${esc(e.title.length > 34 ? e.title.slice(0, 33) + '…' : e.title)}</text>`;
    });
    s += `<path d="${path(pt, F.past.base)}" fill="none" stroke="${css('--muted')}" stroke-dasharray="1 4" stroke-width="1.6"/><path d="${path(ft, F.future.map(x => x.base))}" fill="none" stroke="${css('--muted')}" stroke-dasharray="1 4" stroke-width="1.6"/>`;
    s += `<path d="${path(pt, F.past.exp)}" fill="none" stroke="${css('--info')}" stroke-dasharray="5 4" stroke-width="1.8"/><path d="${path(ft, F.future.map(x => x.exp))}" fill="none" stroke="${css('--info')}" stroke-dasharray="5 4" stroke-width="2.2"/>`;
    s += `<path d="${path(pt, F.past.rpm)}" fill="none" stroke="${css('--accent')}" stroke-width="2.4"/><line x1="${X(now)}" x2="${X(now)}" y1="${m.t}" y2="${m.t + ph}" stroke="${css('--ink')}" stroke-width="1.4"/><text x="${X(now) + 5}" y="${m.t + ph - 6}" style="fill:${css('--ink')};font-weight:700">teraz</text></svg>`;
    el.innerHTML = s;
  }

  /* ------------------------------------------------------------------------------ dashboard */
  function build() {
    $('#app').innerHTML = `<div id="banner"></div>
      <div class="twocol" style="margin-top:16px">
        <div class="card segc"><h2>Usługi wewnętrzne <span class="sub">ruch rzeczywisty (linia) kontra oczekiwany z modelu (przerywana)</span><span class="spacer"></span><span id="seg-int" class="pill ok"></span></h2><div class="svcgrid" id="svcs"></div></div>
        <div class="card segc"><h2>Usługi zewnętrzne <span class="sub">dostawcy: status z ich stron i efekt u zależnych usług</span><span class="spacer"></span><span id="seg-ext" class="pill ok"></span></h2><div class="svcgrid" id="vend"></div></div></div>
      <div class="card segc" style="margin-top:16px"><h2>Zgłoszenia i sygnały od użytkowników <span class="sub">infolinia i Google Analytics</span><span class="spacer"></span><span id="seg-rep" class="pill ok"></span></h2><div class="grid g2"><div id="calls"></div><div id="ga"></div></div></div>
      <div class="cols" style="margin-top:16px"><div class="stack"><div class="card" id="inc"></div><div class="card"><h2>Prognoza obciążenia <span class="sub">historia + kalendarz</span><span class="seg fcsel" id="fcsel"></span></h2><div class="chart" id="fc"></div>
        <div class="legend"><span><i style="background:var(--accent)"></i>ruch rzeczywisty</span><span><i style="background:var(--info)"></i>oczekiwany (model + kalendarz)</span><span><i style="background:var(--muted)"></i>normalny bez wydarzeń</span><span><i style="background:var(--info);opacity:.3;height:10px"></i>wydarzenie z kalendarza</span></div></div></div>
        <div class="stack"><div class="card"><h2>Źródła sygnałów</h2><div class="tiles" id="tiles"></div></div><div class="card"><h2>Komunikaty modelu</h2><div id="notices"></div></div><div class="card"><h2>Dziennik powiadomień</h2><div class="feed" id="feed"></div></div></div></div>
      <div class="card" id="truthc" style="margin-top:16px" hidden><h2>Prawda z generatora <span class="sub">tylko tryb demo: porównanie wykrycia z wstrzykniętą awarią</span></h2><div class="table-wrap" id="truth"></div></div>`;
    $('#fcsel').onclick = e => { if (e.target.dataset.k) { sel = e.target.dataset.k; renderFc(); } };
    $('#inc').onclick = e => { if (e.target.id === 'ack') post('/api/ack'); if (e.target.id === 'cp') navigator.clipboard && navigator.clipboard.writeText(e.target.dataset.t); };
    built = 'dashboard';
  }

  function draft(inc) {
    const h = inc.hyps[0], sv = [...new Set(inc.evidence.map(e => e.service).filter(Boolean))].map(k => S.services.find(x => x.key === k)?.name).filter(Boolean);
    return `Obserwujemy problem w usługach: ${sv.join(', ') || 'serwisu'}. Najbardziej prawdopodobna przyczyna: ${h ? h.title : 'w trakcie ustalania'}. Zespół dyżurny zajmuje się sprawą, kolejna informacja za 15 min.`;
  }

  function renderBanner() {
    const inc = S.incident;
    let cls = 'ok', ico = '✓', big = 'Wszystko działa', txt = `${S.services.length} usług w normie, dostawcy bez zgłoszeń. Ostatnia aktualizacja ${hm(S.clock)} (czas systemowy).`;
    if (!S.connected) { cls = 'off'; ico = '…'; big = 'Brak połączenia ze źródłem'; txt = esc(S.error || 'czekam na dane'); }
    else if (inc) {
      const h = inc.hyps[0];
      const over = inc.active_n === 0;
      cls = over ? 'info' : inc.sev === 'P1' ? 'bad' : 'warn'; ico = over ? '↘' : inc.sev === 'P1' ? '!' : '▲'; big = over ? 'Sygnały ustały' : inc.sev === 'P1' ? 'Awaria' : 'Problem';
      txt = `${h ? esc(h.title) : 'analizuję'} · źródła: ${inc.srcs.map(s => SRC[s]).join(', ') || '—'} · od ${inc.elapsed} min${over ? ' · obserwuję jeszcze 10 min przed zamknięciem' : ''}`;
    } else if (S.notices.length) { cls = 'info'; ico = '↗'; big = 'Podwyższona aktywność'; txt = esc(S.notices[0].text); }
    const open = inc ? 1 : 0;
    $('#banner').innerHTML = `<div class="banner ${cls}"><div class="ico">${ico}</div><div><div class="big">${big}</div><div class="txt">${txt}</div></div>
      <div class="stats"><div><b>${open}</b><span>otwarte incydenty</span></div><div><b>${S.closed.length}</b><span>zamknięte</span></div><div><b>${S.services.filter(x => x.status !== 'ok').length}/${S.services.length}</b><span>usług z problemem</span></div></div></div>`;
  }

  function renderSvcs() {
    const nb = S.services.filter(x => x.status !== 'ok').length;
    $('#seg-int').className = 'pill ' + (S.services.some(x => x.status === 'bad') ? 'bad' : nb ? 'warn' : 'ok'); $('#seg-int').textContent = nb ? `${nb} z ${S.services.length} z problemem` : `${S.services.length} z ${S.services.length} działa`;
    $('#svcs').innerHTML = S.services.map(s => {
      const l = s.last || {}, col = s.status === 'bad' ? css('--bad') : s.status === 'warn' ? css('--warn') : css('--accent');
      return `<div class="sv ${s.status}"><div class="hd"><span class="dot ${STC[s.status]}"></span><strong>${esc(s.name)}</strong><span class="pill ${STC[s.status]}">${s.status === 'ok' ? 'działa' : s.status === 'warn' ? 'problem' : 'awaria'}</span></div>
        <div class="nums"><div><b>${nf(l.rpm)}</b><span>req/min</span></div><div><b class="${l.resp > l.resp_exp * 1.8 ? 'bad' : ''}">${nf(l.resp)}</b><span>ms</span></div><div><b class="${l.err >= 3 ? 'bad' : ''}">${nf(l.err, 1)}%</b><span>błędy</span></div><div><b class="${l.cpu >= 90 ? 'bad' : l.cpu >= 75 ? 'hot' : ''}">${nf(l.cpu)}%</b><span>cpu</span></div></div>
        ${mini(s.series, col)}${s.reasons.length ? `<div class="why bad">${esc(s.reasons[0])}</div>` : ''}${s.notice && s.notice.risk ? '<div class="note risk">Prognoza: ryzyko przeciążenia (szczegóły w komunikatach modelu)</div>' : ''}</div>`;
    }).join('');
  }

  function renderVendors() {
    const bad = S.vendors.filter(v => v.status !== 'operational').length, sus = S.vendors.filter(v => v.suspect).length;
    $('#seg-ext').className = 'pill ' + (bad ? 'bad' : sus ? 'warn' : 'ok'); $('#seg-ext').textContent = bad ? `${bad} z ${S.vendors.length} z problemem` : sus ? 'podejrzenie awarii' : `${S.vendors.length} z ${S.vendors.length} działa`;
    $('#vend').innerHTML = S.vendors.map(v => {
      const b = v.status !== 'operational', deps = v.services.map(k => S.services.find(x => x.key === k)).filter(Boolean), n = deps.length ? deps[0].series.t.length : 0;
      const sum = f => Array.from({ length: n }, (_, i) => deps.reduce((s, d) => s + (d.series[f][i] || 0), 0));
      const agg = { t: deps.length ? deps[0].series.t : [], rpm: sum('rpm'), exp: sum('exp') };
      const last = deps.map(d => d.last || {}), err = Math.max(0, ...last.map(l => l.err || 0)), hit = deps.filter(d => d.status !== 'ok').length, rpm = last.reduce((s, l) => s + (l.rpm || 0), 0);
      const cls = b ? (v.status === 'outage' ? 'bad' : 'warn') : v.suspect ? 'warn' : '', col = cls === 'bad' ? css('--bad') : cls === 'warn' ? css('--warn') : css('--accent');
      return `<div class="sv ${cls}"><div class="hd"><span class="dot ${cls || 'ok'}"></span><strong>${esc(v.name)}</strong><span class="pill ${b ? 'bad' : 'ok'}">${b ? v.status : 'operational'}</span></div>
        <div class="nums"><div><b>${deps.length}</b><span>zależne usługi</span></div><div><b>${nf(rpm)}</b><span>req/min</span></div><div><b class="${cls && err >= 3 ? 'bad' : ''}">${nf(err, 1)}%</b><span>błędy (maks.)</span></div><div><b class="${cls && hit ? 'bad' : ''}">${hit}/${deps.length}</b><span>z problemem</span></div></div>
        ${mini(agg, col, b ? hm(v.since) : null)}
        <div class="why ${b ? 'bad' : ''}">${b ? esc(v.message) + ' (od ' + hm(v.since) + ')' : v.suspect ? '' : 'bez zgłoszeń dostawcy'}</div>${v.suspect ? '<div class="note risk">Hub podejrzewa awarię mimo braku komunikatu</div>' : ''}
        <div class="small muted" style="margin-top:6px">Wykres: ruch usług zależnych (efekt, nie metryka dostawcy). Zależne: ${deps.map(d => esc(d.name)).join(', ')}.</div></div>`;
    }).join('');
  }

  function renderReports() {
    const C = S.calls || { info: {}, wait: {} }, G = S.ga || {}, rows = Object.values(C.info), alert = S.tiles.calls.state === 'alert', ga = S.tiles.analytics.state === 'alert';
    const watch = rows.some(r => r.z >= 2);
    $('#seg-rep').className = 'pill ' + (alert || ga ? 'bad' : watch ? 'warn' : 'ok'); $('#seg-rep').textContent = alert || ga ? 'skok zgłoszeń' : watch ? 'rosnące zgłoszenia' : 'w normie';
    const mx = Math.max(1, ...rows.map(r => Math.max(r.sum5, r.exp)));
    $('#calls').innerHTML = `<h3 style="margin:0 0 8px">Infolinia <span class="muted small">połączenia w ostatnich 5 min kontra norma</span></h3>` + (rows.length ? rows.map(r => `<div class="rep"><span>${esc(r.name)}</span><div class="bar"><i style="width:${r.exp / mx * 100}%" class="exp"></i><i style="width:${r.sum5 / mx * 100}%" class="${r.z >= 4 ? 'bad' : r.z >= 2 ? 'warn' : ''}"></i></div><b class="${r.z >= 4 ? 'bad' : ''}">${r.sum5}</b><span class="muted small">norma ${r.exp}</span></div>`).join('')
      + `<div class="small muted" style="margin-top:8px">Czas oczekiwania: <b>${C.wait.wait_s ?? '—'} s</b>, porzucone: <b>${C.wait.abandoned == null ? '—' : Math.round(C.wait.abandoned * 100) + '%'}</b></div>` : '<div class="muted">Brak danych z infolinii.</div>');
    const rate = G.rate != null ? G.rate * 100 : null;
    $('#ga').innerHTML = `<h3 style="margin:0 0 8px">Google Analytics <span class="muted small">zachowanie widzów w ostatniej minucie</span></h3>
      <div class="nums4"><div><b>${nf(G.users || 0)}</b><span>aktywni użytkownicy (norma ok. ${nf(G.users_exp || 0)})</span></div><div><b>${nf(G.starts || 0)}</b><span>starty playera (norma ok. ${nf(G.exp_starts || 0)})</span></div><div><b class="${G.rate >= .06 ? 'bad' : ''}">${rate == null ? '—' : rate.toFixed(1)}%</b><span>błędy playera (norma ${G.base_rate != null ? (G.base_rate * 100).toFixed(1) : '—'}%)</span></div></div>
      <div class="small muted" style="margin-top:8px">${ga ? esc(S.tiles.analytics.text) : 'Błędy playera i spadek startów to sygnały, które widzi użytkownik, zanim zgłosi problem.'}</div>`;
  }

  function renderInc() {
    const inc = S.incident;
    if (!inc) {
      $('#inc').innerHTML = `<h2>Centrum incydentów</h2><div class="empty" style="padding:26px"><div style="font-size:34px">✓</div><b>Brak otwartych incydentów</b><div class="small">Hub porównuje wszystkie źródła z oczekiwanym zachowaniem i odezwie się, gdy coś się rozjedzie.</div></div>` +
        (S.closed.length ? `<h3 style="margin:8px 0">Ostatnio zamknięte</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Waga</th><th>Od</th><th>Przyczyna</th><th>Do potwierdzenia</th></tr></thead><tbody>${S.closed.map(c => `<tr><td>${c.id}</td><td><span class="sev ${c.sev}">${c.sev}</span></td><td>${hm(c.start)}</td><td>${esc(c.hyps[0] ? c.hyps[0].title : '—')}</td><td>${c.tta == null ? 'brak' : c.tta + ' min'}</td></tr>`).join('')}</tbody></table></div>` : '');
      return;
    }
    const st = inc.ack ? 'podjęty' : inc.page ? 'pager wysłany' : 'wiadomość na kanale';
    const nextEsc = inc.ack ? null : inc.page ? (inc.esc < 1 ? [5, 'II linia'] : inc.esc < 2 ? [15, 'kierownik'] : null) : [15, 'awans do pagera'];
    const since = nextEsc ? Math.max(0, nextEsc[0] - Math.round((d(S.clock) - d(inc.page || inc.head)) / 60000)) : null;
    const dr = draft(inc);
    $('#inc').innerHTML = `<div class="inc-head"><span class="sev ${inc.sev}">${inc.sev}</span><h3>Incydent #${inc.id}</h3><span class="pill ${inc.ack ? 'ok' : inc.page ? 'bad' : 'warn'}">${st}</span>${inc.active_n === 0 ? '<span class="pill info">sygnały ustały</span>' : ''}<span class="muted small">pierwszy sygnał ${hm(inc.head)} · ${inc.elapsed} min temu${inc.page ? ' · pager ' + hm(inc.page) : ''}${inc.ack ? ' · potwierdzone ' + hm(inc.ack) + ' (' + esc(inc.ack_by) + ')' : ''}</span></div>
      ${!inc.ack ? `<div style="margin-bottom:12px"><button class="btn primary big" id="ack">Potwierdzam: zajmuję się tym</button>${since != null ? ` <span class="small muted">następny krok za ${since} min: ${nextEsc[1]}</span>` : ''}</div>` : ''}
      <h3 style="margin:6px 0 8px">Hipotezy przyczyny</h3>${inc.hyps.slice(0, 3).map((h, i) => `<div class="hyp ${i === 0 ? 'top' : ''}"><div class="t"><span>${i + 1}. ${esc(h.title)}</span><span>${Math.round(h.conf * 100)}%</span></div><div class="bar" style="margin-top:6px"><i style="width:${h.conf * 100}%"></i></div>
        <ul>${h.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul><div class="act">Co zrobić: ${esc(h.action)}</div></div>`).join('')}
      <h3 style="margin:12px 0 4px">Dowody z ${inc.srcs.length} źródeł <span class="muted" style="text-transform:none;letter-spacing:0">(${inc.active_n} nadal aktywnych)</span></h3>${inc.evidence.slice(0, 12).map(e => `<div class="ev ${e.active ? '' : 'off'}"><span class="src ${e.source}">${SRC[e.source]}</span><span>${esc(e.detail)}</span><span class="muted">${hm(e.start)}${e.active ? '' : '–' + hm(e.end)}</span></div>`).join('')}
      <h3 style="margin:12px 0 6px">Szkic komunikatu dla interesariuszy</h3><div class="note-box" style="background:var(--panel2);border-color:var(--line)">${esc(dr)} <button class="btn sm" id="cp" data-t="${esc(dr)}">kopiuj</button></div>`;
  }

  function renderSide() {
    const order = ['status', 'servers', 'calls', 'analytics', 'model'];
    $('#tiles').innerHTML = order.map(k => {
      const t = S.tiles[k], src = S.sources[k];
      const stale = src && src.stale;
      return `<div class="tile ${stale ? 'alert' : t.state}"><span class="dot ${stale ? 'bad' : t.state === 'alert' ? 'bad' : t.state === 'watch' ? 'warn' : 'ok'}"></span><div><b>${SRC[k]}</b><small>${stale ? 'BRAK DANYCH od ' + src.age + ' min: źródło nie odpowiada' : esc(t.text)}</small></div><span class="pill ${stale ? 'bad' : t.state === 'alert' ? 'bad' : t.state === 'watch' ? 'warn' : 'ok'}">${stale ? 'NIE ODPOWIADA' : t.state === 'alert' ? 'ALARM' : t.state === 'watch' ? 'UWAGA' : 'OK'}</span></div>`;
    }).join('');
    $('#notices').innerHTML = S.notices.length ? S.notices.map(n => `<div class="notice ${n.level === 'warn' ? 'warn' : ''}"><b>${esc(n.tag)}</b>${esc(n.text)}</div>`).join('') : '<div class="empty">Brak komunikatów. Ruch zgodny z prognozą.</div>';
    $('#feed').innerHTML = [...S.notes].reverse().map(n => `<div class="msg ${n.level}"><span class="t">${hm(n.ts)}</span><strong>${esc(n.tag)}</strong><div>${esc(n.text)}</div>${n.sub ? `<div class="sub">${esc(n.sub)}</div>` : ''}</div>`).join('') || '<div class="empty">Cisza. Wszystko w normie.</div>';
  }

  function renderFc() {
    $('#fcsel').innerHTML = S.services.map(s => `<button data-k="${s.key}" class="${s.key === sel ? 'on' : ''}">${esc(s.name)}</button>`).join('');
    fcChart($('#fc'), sel);
  }

  function renderTruth() {
    $('#truthc').hidden = !(DEMO && S.demo && S.truth.length);
    if (DEMO && S.demo) $('#truth').innerHTML = `<table class="truth"><thead><tr><th>Wstrzyknięto</th><th>Cel</th><th>O</th><th>Wykrycie przez Hub</th><th>Hipoteza</th><th>Do potwierdzenia</th></tr></thead><tbody>${S.truth.map(t => `<tr><td>${esc(t.label)}</td><td>${esc(t.target)}</td><td>${hm(t.start)}</td>
      <td>${t.detected ? `<span class="pill ok">po ${t.ttn} min</span> incydent #${t.inc}` : `<span class="pill ${t.waiting > 8 ? 'bad' : 'warn'}">jeszcze nie${t.waiting != null ? ' (' + t.waiting + ' min)' : ''}</span>`}</td><td>${t.detected ? (t.hyp_ok ? '<span class="pill ok">trafna</span>' : '<span class="pill warn">inna</span>') : '—'}</td><td>${t.tta == null ? '—' : t.tta + ' min'}</td></tr>`).join('')}</tbody></table>`;
  }

  /* ------------------------------------------------------------------------------ other views */
  async function renderModel() {
    $('#app').innerHTML = '<div class="empty">Ładowanie modelu…</div>';
    if (!modelData) modelData = await (await fetch('/api/model')).json();
    const M = modelData, names = Object.fromEntries((S ? S.services : []).map(s => [s.key, s.name]));
    const typ = { final: 'Finał programu', premiere: 'Premiera', sport: 'Transmisja sportowa' };
    $('#app').innerHTML = `<div class="grid g2"><div class="card"><h2>Czego model się nauczył</h2><dl class="kv"><dt>Dane historyczne</dt><dd>${M.info.weeks} tygodni, ${nf(M.info.hours)} godzin-usług, ${M.info.events} wydarzeń</dd><dt>Sezonowość</dt><dd>mediana dla każdej godziny tygodnia (bez godzin z wydarzeniami)</dd><dt>Wydarzenia</dt><dd>mnożnik ruchu per typ wydarzenia i usługa</dd><dt>Obciążenie</dt><dd>jak rosną czasy odpowiedzi i CPU przy ×1, ×2, ×3 normalnego ruchu</dd></dl>
      <div class="note-box" style="margin-top:12px"><b>Uwaga:</b> historia jest wygenerowana przez generator awarii (symulacja). Dokładność poniżej pokazuje, że metoda działa, a nie jak dokładna będzie na prawdziwym ruchu. Narastanie ruchu 20 min przed wydarzeniem i opadanie 30 min po nim to założenie, którego nie da się nauczyć z danych godzinowych.</div></div>
      <div class="card"><h2>Dokładność prognozy ruchu <span class="sub">pominięcie jednego wydarzenia na raz</span></h2><div class="table-wrap"><table><thead><tr><th>Usługa</th><th>Błąd w godzinach normalnych</th><th>Błąd w czasie wydarzeń: z kalendarzem</th><th>bez kalendarza</th></tr></thead><tbody>${Object.entries(M.validation).map(([k, v]) => `<tr><td>${esc(names[k] || k)}</td><td>${v.mape_normal}%</td><td>${v.mape_event_with_calendar == null ? '—' : '<b>' + v.mape_event_with_calendar + '%</b>'}</td><td>${v.mape_event_baseline_only == null ? '—' : v.mape_event_baseline_only + '%'}</td></tr>`).join('')}</tbody></table></div><div class="small muted" style="margin-top:6px">Mediana błędu bezwzględnego godzinowego ruchu. Usługi bez wydarzeń w historii: brak oceny.</div></div></div>
      <div class="card" style="margin-top:16px"><h2>Wpływ wydarzeń na ruch <span class="sub">nauczone z historii (mediana mnożnika)</span></h2><div class="table-wrap"><table class="mult"><thead><tr><th>Typ</th>${M.svc.map(s => `<th>${esc(names[s] || s)}</th>`).join('')}</tr></thead><tbody>${Object.entries(M.mult).map(([ty, o]) => `<tr><td>${typ[ty] || ty}</td>${M.svc.map(s => `<td class="v">${o[s] ? '×' + o[s].value + ' <span class="muted small">(' + o[s].n + ' wyd.)</span>' : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><h2>Zachowanie przy rosnącym obciążeniu <span class="sub">${esc(names.player || 'Player')}</span></h2><div class="table-wrap"><table><thead><tr><th>Ruch względem normalnego</th><th>Czas odpowiedzi względem normalnego</th><th>CPU ponad normę</th></tr></thead><tbody>${M.bins.map((b, i) => `<tr><td>×${b.lo} – ${b.hi > 50 ? '∞' : '×' + b.hi}</td><td>×${M.bin_resp.player[i]}</td><td>+${M.bin_cpu.player[i]} pkt</td></tr>`).join('')}</tbody></table></div><div class="small muted" style="margin-top:6px">Na tej podstawie Hub przewiduje CPU przed wydarzeniem i rozróżnia „więcej ruchu” (oczekiwane) od „awarii” (odchylenie od oczekiwanego).</div></div>`;
  }


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

  /* ------------------------------------------------------------------------------ thresholds: learned from data vs set by hand */
  async function renderThresholds() {
    $('#app').innerHTML = '<div class="empty">Ładowanie progów…</div>';
    const D = await (await fetch('/api/thresholds')).json(), L = D.learned || [], T = D.manual || {};
    const max = Math.max(...L.map(x => x.thr), .01);
    const manual = [
      ['Błędy 5xx usługi', `≥ ${T.err}%`, 'serwery', 'ruch z błędami, który użytkownik widzi'], ['Czas odpowiedzi', `≥ ${T.resp_ratio}× oczekiwanego`, 'serwery', 'oczekiwany = norma godziny tygodnia z modelu'],
      ['CPU usługi', `≥ ${T.cpu_sat}%`, 'serwery', 'nasycenie przy wzroście ruchu'], ['Spadek ruchu', `< ${Math.round(T.drop * 100)}% oczekiwanego`, 'serwery', 'usługa przestaje obsługiwać użytkowników'],
      ['Serwer „gorący”', `+${T.host_hot} pkt CPU ponad średnią usługi`, 'serwery', 'jeden host odstaje od pozostałych'], ['Pamięć hosta', `≥ ${T.mem}%`, 'serwery', 'wyciek pamięci'],
      ['Infolinia', `≥ ${T.calls_z}σ i ≥ ${T.calls_min} połączeń / 5 min`, 'infolinia', 'skok zgłoszeń na temat względem normy'], ['Błędy playera (GA)', `≥ ${Math.round(T.ga_rate * 100)}% lub starty < ${Math.round(T.ga_ratio * 100)}% normy`, 'analityka', 'widz nie może odtworzyć materiału'],
      ['Pager / eskalacja', '5 min / 15 min', 'proces', 'czas na potwierdzenie ostrzeżenia, potem II linia'], ['Odchylenie encji (model NR)', '≥ 6σ', 'model NR', 'odchylenie robustne od normy z tej samej pory doby'],
      ['Poziomy modelu NR', 'obserwuj 1×, ostrzeżenie 2×, alarm 3× próg grupy', 'model NR', 'krotność progu wyuczonego z danych'], ['Dolny próg grupy (model NR)', '3% encji', 'model NR', 'żeby 1 encja w małej grupie nie dawała alarmu']];
    $('#app').innerHTML = `
      <div class="card"><h2>Progi wyuczone z prawdziwych danych New Relic <span class="pill ok">z danych</span></h2>
        <p class="muted" style="margin:0 0 12px">Dla każdej grupy metryk model policzył, jaki odsetek encji (hostów, ALB, aplikacji, monitorów) odbiega od swojej normy o więcej niż 6σ w <b>zdrowych</b> oknach (bez okien incydentów ±3 h/2 h). Próg to <b>p99,9</b> tego odsetka: w 999 na 1000 zdrowych okien jest niższy. Gdy odsetek go przekroczy, grupa „krzyczy”.</p>
        <div class="table-wrap"><table><thead><tr><th>Grupa metryk</th><th>Okno</th><th style="width:26%">Próg (odsetek encji)</th><th>≈ encji</th><th>Zdrowe okna: mediana / p99</th><th>Zdrowych okien</th></tr></thead><tbody>${L.map(x => `<tr><td>${esc(x.g)}</td><td class="muted">${x.win}</td>
          <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:8px;background:var(--panel2);border-radius:4px"><div style="width:${Math.max(3, x.thr / max * 100)}%;height:8px;background:${x.floor ? 'var(--warn)' : 'var(--accent)'};border-radius:4px"></div></div><b>${(x.thr * 100).toFixed(1)}%</b></div></td>
          <td>${x.ent_at_thr < 1 ? '1 (dolny próg)' : '≈ ' + Math.round(x.ent_at_thr) + ' z ' + x.n_ent}</td><td class="muted">${(x.med * 100).toFixed(1)}% / ${(x.p99 * 100).toFixed(1)}%</td><td class="muted">${nf(x.n_win)} (${x.days} dnia)</td></tr>`).join('')}</tbody></table></div>
        <div class="small muted" style="margin-top:8px">Pomarańczowy pasek: próg nauczony byłby niższy niż 3%, więc użyto dolnego progu (1 encja wystarczy). Próg szerokości to jedyna rzecz, której model nauczył się z danych. Źródło: ${nf((D.meta || {}).rows || 0)} wierszy, ${(D.meta || {}).span ? D.meta.span.join(' … ') : ''}.</div></div>
      <div class="card" style="margin-top:16px"><h2>Progi ustawione ręcznie <span class="pill warn">nie z danych</span></h2>
        <p class="muted" style="margin:0 0 12px">Reguły głównego silnika alarmów oraz parametry modelu NR. Dobrałem je na symulatorze i na kilku incydentach, nie są wyliczone z prawdziwych danych. Przed produkcją trzeba je skalibrować.</p>
        <div class="table-wrap"><table><thead><tr><th>Sygnał</th><th>Próg</th><th>Źródło</th><th>Znaczenie</th></tr></thead><tbody>${manual.map(m => `<tr><td>${esc(m[0])}</td><td><b>${esc(m[1])}</b></td><td class="muted">${m[2]}</td><td class="muted">${esc(m[3])}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function renderSources() {
    const rows = [['status', 'Statusy dostawców i kontrole zdrowia usług', '/api/status', 'strony statusu dostawców (np. AWS Health, Statuspage) i endpointy /health'], ['servers', 'Logi i metryki serwerów: CPU, pamięć, czas odpowiedzi, błędy 5xx, ruch', '/api/metrics', 'New Relic (NRQL) lub CloudWatch'],
      ['calls', 'Infolinia: połączenia wg tematu, czas oczekiwania', '/api/callcenter', 'system telefoniczny / CRM'], ['analytics', 'Analityka (Google Analytics): użytkownicy, starty i błędy playera', '/api/analytics', 'Google Analytics Realtime API'], ['model', 'Model obciążenia z danych historycznych i kalendarza programu', '/api/history + /api/calendar', 'hurtownia danych / New Relic (historia), kalendarz ramówki']];
    $('#app').innerHTML = `<div class="card"><h2>Źródła danych <span class="sub">połączone z: ${esc(S.source)}</span></h2><div class="table-wrap"><table><thead><tr><th>Źródło</th><th>Opis</th><th>Dziś (prototyp)</th><th>Na produkcji</th><th>Ostatnie dane</th><th>Stan</th></tr></thead><tbody>${rows.map(([k, n, ep, prod]) => { const s = S.sources[k]; return `<tr><td><b>${SRC[k]}</b></td><td>${n}</td><td><code>${ep}</code> generatora (symulacja)</td><td>${prod}</td><td>${s ? (s.age == null ? '—' : s.age + ' min temu') : 'przy starcie'}</td><td>${s ? (s.stale ? '<span class="pill bad">NIE ODPOWIADA</span>' : '<span class="pill ok">działa</span>') : '<span class="pill ok">wczytany</span>'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="note-box" style="margin-top:14px">W prototypie wszystkie źródła pochodzą z <b>generatora awarii</b> (drugiej aplikacji) i są symulowane. Silnik Huba czyta je przez prosty interfejs HTTP, więc na produkcji wymienia się tylko klasę źródła (<code>hub/sources.py</code>), a nie reguły ani dashboard. Wyłącz dowolne źródło w generatorze (sekcja „Awaria źródła danych”), żeby zobaczyć alert o milczącym źródle.</div></div>`;
  }

  /* ------------------------------------------------------------------------------ wiring */
  function render() {
    if (!S) return;
    const ok = S.connected;
    $('#conn').className = 'pill ' + (ok ? 'ok' : 'bad'); $('#conn').textContent = ok ? 'źródło: generator (symulacja)' : 'brak połączenia ze źródłem';
    if (S.ready) $('#clock').textContent = S.clock.slice(8, 10) + '.' + S.clock.slice(5, 7) + ' ' + hm(S.clock);
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === view));
    if (!S.ready) { $('#app').innerHTML = `<div class="banner off"><div class="ico">…</div><div><div class="big">Łączenie ze źródłem</div><div class="txt">${esc(S.error || 'uruchamiam model i pobieram dane historyczne')}</div></div></div>`; built = null; return; }
    if (view === 'dashboard') { if (built !== 'dashboard') build(); renderBanner(); renderVendors(); renderSvcs(); renderReports(); renderInc(); renderSide(); renderFc(); renderTruth(); }
    else if (built !== view) { built = view; (view === 'model' ? renderModel : view === 'nr' ? renderNR : view === 'progi' ? renderThresholds : renderSources)(); }
  }
  function route() { const v = (location.hash.replace('#/', '') || 'dashboard'); view = ['dashboard', 'model', 'nr', 'progi', 'zrodla'].includes(v) ? v : 'dashboard'; built = null; render(); }
  window.addEventListener('hashchange', route);
  if (DEMO) $('#demo-ctl').hidden = false;
  post('/api/control', { demo: DEMO });
  $('#t-demo').onchange = e => post('/api/control', { demo: e.target.checked });
  $('#t-auto').onchange = e => post('/api/control', { auto_ack: e.target.checked });
  function connect() {
    const es = new EventSource('/api/stream');
    es.onmessage = m => { S = JSON.parse(m.data); if (S.cfg) { $('#t-auto').checked = !!S.cfg.auto_ack; } render(); };
    es.onerror = () => setTimeout(() => { es.close(); connect(); }, 1500);
  }
  route(); connect();
})();
