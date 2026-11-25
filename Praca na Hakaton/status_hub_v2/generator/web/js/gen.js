(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const post = b => fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const hm = s => s.slice(11, 16);
  const nf = (v, d = 0) => Number(v).toLocaleString('pl-PL', { maximumFractionDigits: d });
  let S = null, built = false;
  const TARGET_KIND = { vendor_outage: 'vendor', dns_outage: 'dns', host_cpu_spike: 'host', host_down: 'host', memory_leak: 'host', slow_db: 'svc', player_bug: 'player', traffic_surge: 'svc' };
  const HINT = {
    vendor_outage: 'Błędy 5xx i spadek zasięgu usług zależnych od dostawcy. Dostawca ogłasza problem z opóźnieniem albo wcale.',
    host_cpu_spike: 'Jeden serwer ma wysokie CPU i wolne odpowiedzi, reszta usługi działa.', host_down: 'Serwer przestaje odpowiadać, ruch przejmują pozostałe.',
    memory_leak: 'Pamięć serwera rośnie, po 93% odpowiedzi zwalniają i pojawiają się błędy.', slow_db: 'Rosną czasy odpowiedzi i błędy usługi, bez komunikatu dostawcy.',
    player_bug: 'Błąd tylko w playerze: serwery wyglądają zdrowo, ale rosną błędy w analityce i telefony na infolinię.', dns_outage: 'Część użytkowników nie dociera do żadnej usługi, mało błędów po stronie serwerów.',
    traffic_surge: 'Nieplanowany napływ ruchu (np. wiadomość z ostatniej chwili). Bez skalowania usługa się przeciąża.' };

  function spark(a, color, max) {
    if (!a.length) return '';
    const m = max || Math.max(...a, 1), w = 200, h = 34;
    const pts = a.map((v, i) => `${(i / Math.max(1, a.length - 1) * w).toFixed(1)},${(h - 3 - v / m * (h - 6)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8"/></svg>`;
  }

  function build() {
    $('#app').innerHTML = `<div class="layout"><div class="stack">
      <div class="card"><h2>Platforma na żywo <span class="sub">to, co zobaczyłby monitoring</span></h2><div class="grid g2" id="plat"></div></div>
      <div class="card"><h2>Dostawcy <span class="sub">stan prawdziwy kontra komunikat na stronie statusu</span></h2><div class="grid g4" id="vend"></div></div>
      <div class="card"><h2>Infolinia i analityka</h2><div class="grid g2"><div id="calls"></div><div id="ga"></div></div>
        <h3 style="margin:14px 0 8px">Awaria źródła danych (test odporności Hubu)</h3><div class="toggles" id="outs"></div></div></div>
      <div class="stack">
        <div class="card form"><h2>Wstrzyknij awarię</h2>
          <div class="row one"><div><label class="l">Typ</label><select id="f-type" style="width:100%"></select></div></div>
          <div class="small muted" id="f-hint" style="margin:-4px 0 10px"></div>
          <div class="row"><div><label class="l">Cel</label><select id="f-target" style="width:100%"></select></div><div id="f-ann-w"><label class="l">Komunikat dostawcy</label><select id="f-ann" style="width:100%"><option value="auto">po 8–25 min (losowo)</option><option value="silent">dostawca milczy</option><option value="5">po 5 min</option><option value="15">po 15 min</option></select></div></div>
          <div class="row one"><div><label class="l">Nasilenie: <b id="f-sv-v">0,8</b></label><input type="range" id="f-sv" min="0.2" max="1" step="0.05" value="0.8"></div></div>
          <div class="row"><div><label class="l">Czas trwania [min]</label><input type="number" id="f-dur" value="20" min="2" style="width:100%"></div><div><label class="l">Narastanie [min]</label><input type="number" id="f-ramp" value="2" min="0.5" step="0.5" style="width:100%"></div></div>
          <button class="btn primary" id="f-go" style="width:100%">Wstrzyknij awarię</button></div>
        <div class="card"><h2>Gotowe scenariusze</h2><div class="scen" id="scen"></div></div>
        <div class="card"><h2>Aktywne awarie <button class="btn sm danger" id="clr" style="margin-left:auto">zakończ wszystkie</button></h2><div id="active"></div></div>
        <div class="card"><h2>Kalendarz programu <span class="sub">wydarzenia podnoszą ruch</span></h2><div id="cal"></div>
          <div class="row" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-top:10px;align-items:end"><div><label class="l">Typ</label><select id="e-type" style="width:100%"></select></div><div><label class="l">Za [min]</label><input type="number" id="e-in" value="20" min="1" style="width:100%"></div><div><label class="l">Czas [min]</label><input type="number" id="e-dur" value="60" min="10" style="width:100%"></div><button class="btn" id="e-add">Dodaj</button></div></div>
      </div></div>`;
    $('#f-type').innerHTML = Object.entries(S.types).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#e-type').innerHTML = Object.entries(S.event_types).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#scen').innerHTML = Object.entries(S.scenarios).map(([k, v]) => `<button class="btn" data-s="${k}">${esc(v)}</button>`).join('') + `<button class="btn" id="fs">Finał programu za 25 min (test prognozy obciążenia)</button>`;
    $('#scen').onclick = e => { if (e.target.dataset.s) post({ action: 'scenario', name: e.target.dataset.s }); };
    $('#fs').onclick = () => post({ action: 'final_soon' });
    $('#speed').innerHTML = [[1, '1×'], [10, '10×'], [60, '60×'], [300, '300×']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
    $('#speed').onclick = e => { if (e.target.dataset.v) post({ action: 'speed', value: +e.target.dataset.v }); };
    $('#pause').onclick = () => post({ action: 'pause', value: !S.paused });
    $('#reset').onclick = () => { if (confirm('Wyzerować symulację i wszystkie awarie?')) post({ action: 'reset' }); };
    $('#clr').onclick = () => post({ action: 'clear' });
    const targets = () => {
      const k = TARGET_KIND[$('#f-type').value], T = S.targets;
      const list = k === 'vendor' ? T.vendor.map(v => [v, S.vendor_names[v]]) : k === 'dns' ? [['dns', 'DNS']] : k === 'host' ? T.host.map(h => [h, h]) : k === 'player' ? [['player', S.service_names.player]] :
        T.service.filter(s => s !== 'dam' || true).map(s => [s, S.service_names[s]]);
      $('#f-target').innerHTML = list.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
      $('#f-hint').textContent = HINT[$('#f-type').value];
      $('#f-ann-w').style.visibility = ['vendor', 'dns'].includes(k) ? 'visible' : 'hidden';
    };
    $('#f-type').onchange = targets; targets();
    $('#f-sv').oninput = e => { $('#f-sv-v').textContent = Number(e.target.value).toLocaleString('pl-PL'); };
    $('#f-go').onclick = () => post({ action: 'inject', type: $('#f-type').value, target: $('#f-target').value, severity: +$('#f-sv').value, duration: +$('#f-dur').value, ramp: +$('#f-ramp').value, announce: $('#f-ann').value });
    $('#e-add').onclick = () => post({ action: 'event', type: $('#e-type').value, in_min: +$('#e-in').value, duration: +$('#e-dur').value });
    $('#active').onclick = e => { if (e.target.dataset.stop) post({ action: 'stop', id: +e.target.dataset.stop }); };
    $('#plat').onclick = e => { if (e.target.dataset.sc) post({ action: 'scale', service: e.target.dataset.sc, factor: +e.target.dataset.f }); };
    $('#outs').onclick = e => { if (e.target.dataset.o) post({ action: 'outage', source: e.target.dataset.o, on: e.target.dataset.on !== '1' }); };
    built = true;
  }

  function render() {
    $('#clock').textContent = S.clock.slice(0, 10).split('-').reverse().join('.') + ' ' + hm(S.clock);
    $('#pause').textContent = S.paused ? '▶ Wznów' : '❚❚ Pauza';
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.speed));
    $('#plat').innerHTML = S.services.map(s => `<div class="svc ${s.health}"><div class="top"><span class="dot ${s.health === 'up' ? 'ok' : s.health === 'degraded' ? 'warn' : 'bad'}"></span><strong>${esc(s.name)}</strong><span class="pill ${s.health === 'up' ? 'ok' : s.health === 'degraded' ? 'warn' : 'bad'}">${s.health === 'up' ? 'działa' : s.health === 'degraded' ? 'pogorszona' : 'niedostępna'}</span></div>
      <div class="nums"><div><b>${nf(s.rpm)}</b><span>req/min</span></div><div><b>${nf(s.resp)}</b><span>ms</span></div><div><b>${nf(s.err, 1)}%</b><span>błędy</span></div><div><b>${nf(s.cpu)}%</b><span>cpu</span></div></div>
      ${spark(s.spark, 'var(--accent)')}<div class="hosts">${s.hosts.map(h => `<span class="host ${!h.up ? 'down' : h.cpu > 85 || h.mem > 90 ? 'hot' : ''}" title="cpu ${h.cpu}% pamięć ${h.mem}%">${h.id} ${h.up ? nf(h.cpu) + '%' : 'DOWN'}</span>`).join('')}</div>
      <div class="scale">pojemność: ${[1, 1.5, 2, 3].map(f => `<button class="btn sm ${Math.abs(s.scale - f) < .15 ? 'on' : ''}" data-sc="${s.key}" data-f="${f}">×${f}</button>`).join('')}</div></div>`).join('');
    $('#vend').innerHTML = S.vendors.map(v => `<div class="vend"><strong>${esc(v.name)}</strong><div class="row"><span class="muted">stan prawdziwy</span><span class="pill ${v.true > 0.05 ? 'bad' : 'ok'}">${v.true > 0.05 ? 'awaria ' + Math.round(v.true * 100) + '%' : 'OK'}</span></div>
      <div class="row"><span class="muted">strona statusu</span><span class="pill ${v.pub === 'operational' ? 'ok' : 'warn'}">${v.pub === 'operational' ? 'operational' : v.pub}</span></div>${v.true > 0.05 && v.pub === 'operational' ? '<div class="small" style="color:var(--warn)">dostawca jeszcze milczy</div>' : ''}</div>`).join('');
    const tp = { player: 'Player nie działa', access: 'Brak dostępu', account: 'Logowanie/płatności', other: 'Inne' };
    $('#calls').innerHTML = `<h3>Infolinia (ostatnia minuta)</h3>${Object.entries(S.calls).map(([k, v]) => `<div class="ev"><span>${tp[k]}</span><b>${v}</b></div>`).join('')}`;
    $('#ga').innerHTML = `<h3>Analityka (ostatnia minuta)</h3><div class="ev"><span>aktywni użytkownicy</span><b>${nf(S.ga.active_users)}</b></div><div class="ev"><span>starty playera</span><b>${nf(S.ga.player_starts)}</b></div><div class="ev"><span>błędy playera</span><b>${nf(S.ga.player_errors)} (${nf(S.ga.player_err_rate * 100, 1)}%)</b></div>`;
    $('#outs').innerHTML = [['metrics', 'Metryki serwerów'], ['callcenter', 'Infolinia'], ['analytics', 'Analityka'], ['status', 'Statusy']].map(([k, l]) => `<button class="btn sm ${S.outage[k] ? 'danger' : ''}" data-o="${k}" data-on="${S.outage[k] ? 1 : 0}">${S.outage[k] ? '✖ ' : ''}${l}: ${S.outage[k] ? 'AWARIA' : 'działa'}</button>`).join('');
    const act = S.failures.filter(f => f.active), past = S.failures.filter(f => !f.active).slice(-4).reverse();
    $('#active').innerHTML = (act.map(f => `<div class="fail active"><span class="dot bad pulse"></span><div class="t"><b>${esc(f.label)}</b>: ${esc(f.target)}<small>od ${hm(f.start)} do ${hm(f.end)} · nasilenie ${f.severity}${f.announce !== 'auto' && ['vendor_outage', 'dns_outage'].includes(f.type) ? ' · komunikat: ' + (f.announce === 'silent' ? 'brak' : 'po ' + f.announce + ' min') : ''}</small></div><button class="btn sm" data-stop="${f.id}">zakończ</button></div>`).join('') || '<div class="empty">Brak aktywnych awarii.</div>') +
      (past.length ? '<h3 style="margin:12px 0 6px">Zakończone</h3>' + past.map(f => `<div class="ev"><span>${esc(f.label)}: ${esc(f.target)}</span><span class="muted">${hm(f.start)}–${hm(f.end)}</span></div>`).join('') : '');
    $('#cal').innerHTML = S.events.map(e => `<div class="ev"><span><b>${esc(e.title)}</b><br><span class="muted">${esc(S.event_types[e.type])} · ${e.services.map(x => S.service_names[x]).join(', ')}</span></span><span style="text-align:right">${e.start.slice(8, 10)}.${e.start.slice(5, 7)}<br>${hm(e.start)}–${hm(e.end)}</span></div>`).join('') || '<div class="empty">Brak wydarzeń.</div>';
  }

  function connect() {
    const es = new EventSource('/api/stream');
    es.onmessage = m => { S = JSON.parse(m.data); if (!built) build(); render(); };
    es.onerror = () => { setTimeout(() => { es.close(); connect(); }, 1500); };
  }
  connect();
})();
