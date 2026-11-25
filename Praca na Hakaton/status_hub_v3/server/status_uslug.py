#!/usr/bin/env python3
"""status_uslug - monitoring statusu usług zewnętrznych (AWS, Microsoft, Google Cloud, Cloudflare, GitHub...) w JEDNYM pliku.

Tylko biblioteka standardowa Pythona (3.9+), zero zależności. Użycie jako biblioteka albo jako mikroserwis z panelem.

Dwa niezależne źródła prawdy dla każdego dostawcy:
  * feed dostawcy - to, co publikuje na swojej stronie statusu (bywa spóźniony o minuty względem realnej awarii),
  * sondy HTTP    - rzeczywista osiągalność publicznych endpointów z TEGO hosta, teraz.

Świeżość: każde źródło ma własny wątek i odświeża się co `interval_s` (domyślnie 8 s) na stałym rytmie. Wiek wyniku tuż przed
kolejnym odświeżeniem to ok. interwał + różnica czasów odpowiedzi, więc 8 s zostawia zapas do celu 10 s. Każdy element niesie własny
znacznik `checkedAt`, więc konsument widzi faktyczny wiek danych zamiast go zakładać.

--- Jako biblioteka ---------------------------------------------------------------------------------------------------------
    from status_uslug import Monitor
    m = Monitor()                  # domyślnie 11 dostawców, interwał 8 s; Monitor(providers=[...], interval_s=5)
    m.start()                      # wątki w tle (daemon); m.stop() je zatrzymuje; działa też jako `with Monitor() as m:`
    snap = m.snapshot()            # słownik gotowy do json.dumps (schemat: patrz niżej)
    m.dirty                        # threading.Event ustawiany po każdym sprawdzeniu (do własnego rozgłaszania zmian)

--- Jako mikroserwis ---------------------------------------------------------------------------------------------------------
    python3 status_uslug.py                        # panel + API na http://127.0.0.1:8780
    python3 status_uslug.py serve --port 9000 --interval 5 --providers moje.json
    python3 status_uslug.py check                  # pomiar świeżości w procesie (kod wyjścia 0 = w celu 10 s)
    python3 status_uslug.py dump --pretty          # jedna migawka JSON po pierwszym pełnym obiegu
    python3 status_uslug.py providers              # domyślna lista dostawców jako JSON (wzorzec dla --providers)
    Endpointy: GET / (panel), GET /api/status (JSON), GET /events (SSE, ≤1 migawka/s), GET /health

--- Schemat migawki ----------------------------------------------------------------------------------------------------------
    {serverNow, startedAt, intervalMs, targetMs, hostNetworkIssue, hostIssueError, overall, counts{poziom: liczba},
     providers: [{id, name, tagline, pageUrl, level, levelSource, oldestCheckAt, uptime,
                  vendor: {level, description, vendorUpdatedAt, checkedAt, incidents[{title, impact, since}], error, durationMs} | null,
                  probes: [{id, label, host, level, ok, status, ms, avgMs, error, checkedAt, history('1'/'0')}]}]}
    Poziomy: operational < maintenance < degraded < partial < major (unknown = jeszcze nie sprawdzono). Czasy w ms od epoki.
    Schemat jest taki sam jak w klonie Astro (uptimerobot-clone) i w aplikacji "Monitor ruchu".

--- Własna lista usług -------------------------------------------------------------------------------------------------------
    {"id": "moj-api", "name": "Moje API", "tagline": "", "pageUrl": "https://status.example.com/",
     "vendor": {"kind": "statuspage", "base": "https://status.example.com"},      # lub null; kinds: statuspage, aws-health, azure-rss, gcp-incidents
     "probes": [{"id": "moj-api-health", "label": "Health", "url": "https://api.example.com/health"}]}
    W bibliotece `vendor` może też być funkcją `fn(get) -> {level, description, ...}`, gdzie get(url) -> bytes (z ETag/Last-Modified).
    Sonda: dowolna odpowiedź HTTP < 500 = "usługa odpowiada" (401/404/307 z publicznych endpointów to norma).

--- Uwagi --------------------------------------------------------------------------------------------------------------------
    * Weryfikacja certyfikatów TLS jest ZAWSZE włączona. Python z python.org na macOS nie ma własnego zestawu CA - moduł użyje
      systemowego (/etc/ssl/cert.pem itd.). Za proxy z podmianą certyfikatów ustaw SSL_CERT_FILE na plik z firmowym CA.
    * Zmienne proxy (HTTPS_PROXY / HTTP_PROXY) są respektowane.
    * Serwer domyślnie nasłuchuje tylko na 127.0.0.1 i nie ma uwierzytelniania (API jest tylko do odczytu).
"""
import argparse, copy, json, os, queue, re, ssl, sys, threading, time, urllib.error, urllib.request
from datetime import datetime
from email.utils import parsedate_to_datetime
from html import unescape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

__version__ = '1.0.0'
__all__ = ['Monitor', 'PROVIDERS', 'RANK', 'serve', 'worst', 'ssl_context', 'validate_providers']

TARGET_MS = 10_000                      # cel świeżości danych (ms)
STAGGER_S = 0.15                        # rozkładamy starty źródeł, żeby nie wysyłać wszystkiego w jednej salwie
VIEW_HISTORY = 30                       # ile ostatnich wyników sondy trafia do migawki
SLOW_MS = 3000                          # sonda wolniejsza niż to = "degraded"
MAX_BYTES = 3_000_000
MAX_INCIDENTS = 5
UA = 'status-uslug/' + __version__
RANK = {'unknown': -1, 'operational': 0, 'maintenance': 1, 'degraded': 2, 'partial': 3, 'major': 4}


# ======================================================== domyślna lista usług
def _p(id_, label, url): return {'id': id_, 'label': label, 'url': url}
def _sp(base): return {'kind': 'statuspage', 'base': base}

PROVIDERS = [
    {'id': 'aws', 'name': 'Amazon Web Services', 'tagline': 'Infrastruktura chmurowa', 'pageUrl': 'https://health.aws.amazon.com/health/status',
     'vendor': {'kind': 'aws-health'},
     'probes': [_p('aws-s3', 'S3 (us-east-1)', 'https://s3.us-east-1.amazonaws.com/'),
                _p('aws-ec2', 'EC2 API (us-east-1)', 'https://ec2.us-east-1.amazonaws.com/'),
                _p('aws-ddb', 'DynamoDB (us-east-1)', 'https://dynamodb.us-east-1.amazonaws.com/'),
                _p('aws-sts', 'STS (globalny)', 'https://sts.amazonaws.com/')]},
    {'id': 'azure', 'name': 'Microsoft Azure', 'tagline': 'Platforma chmurowa', 'pageUrl': 'https://azure.status.microsoft/en-us/status/',
     'vendor': {'kind': 'azure-rss'},
     'probes': [_p('azure-arm', 'Resource Manager API', 'https://management.azure.com/metadata/endpoints?api-version=2020-01-01')]},
    # Microsoft nie udostępnia publicznego API statusu M365 bez logowania - tylko sondy.
    {'id': 'm365', 'name': 'Microsoft 365 i Entra ID', 'tagline': 'Tożsamość, poczta, współpraca', 'pageUrl': 'https://status.cloud.microsoft/',
     'vendor': None,
     'probes': [_p('m365-entra', 'Logowanie Entra ID', 'https://login.microsoftonline.com/common/.well-known/openid-configuration'),
                _p('m365-graph', 'Microsoft Graph', 'https://graph.microsoft.com/v1.0/$metadata'),
                _p('m365-outlook', 'Outlook / Exchange Online', 'https://outlook.office365.com/'),
                _p('m365-teams', 'Teams', 'https://teams.microsoft.com/')]},
    {'id': 'gcp', 'name': 'Google Cloud', 'tagline': 'Platforma chmurowa', 'pageUrl': 'https://status.cloud.google.com/',
     'vendor': {'kind': 'gcp-incidents'}, 'probes': [_p('gcp-storage', 'Cloud Storage API', 'https://storage.googleapis.com/')]},
    {'id': 'cloudflare', 'name': 'Cloudflare', 'tagline': 'CDN, DNS, bezpieczeństwo', 'pageUrl': 'https://www.cloudflarestatus.com/',
     'vendor': _sp('https://www.cloudflarestatus.com'), 'probes': [_p('cf-edge', 'Sieć brzegowa', 'https://www.cloudflare.com/cdn-cgi/trace')]},
    {'id': 'github', 'name': 'GitHub', 'tagline': 'Kod i CI', 'pageUrl': 'https://www.githubstatus.com/',
     # Uwaga: NIE sondujemy api.github.com - anonimowe API ma limit 60 zapytań/h na adres IP i sonda co 8 s zużyłaby go (też innym narzędziom).
     'vendor': _sp('https://www.githubstatus.com'), 'probes': [_p('gh-web', 'Strona github.com', 'https://github.com/')]},
    {'id': 'anthropic', 'name': 'Anthropic (Claude)', 'tagline': 'Platforma AI', 'pageUrl': 'https://status.claude.com/',
     'vendor': _sp('https://status.claude.com'), 'probes': [_p('an-api', 'Endpoint API', 'https://api.anthropic.com/')]},
    {'id': 'openai', 'name': 'OpenAI', 'tagline': 'Platforma AI', 'pageUrl': 'https://status.openai.com/',
     'vendor': _sp('https://status.openai.com'), 'probes': [_p('oa-api', 'Endpoint API', 'https://api.openai.com/v1/models')]},
    {'id': 'atlassian', 'name': 'Atlassian', 'tagline': 'Jira, Confluence, Bitbucket', 'pageUrl': 'https://status.atlassian.com/',
     'vendor': _sp('https://status.atlassian.com'), 'probes': []},
    {'id': 'discord', 'name': 'Discord', 'tagline': 'Komunikator', 'pageUrl': 'https://discordstatus.com/',
     'vendor': _sp('https://discordstatus.com'), 'probes': []},
    {'id': 'vercel', 'name': 'Vercel', 'tagline': 'Hosting i funkcje brzegowe', 'pageUrl': 'https://www.vercel-status.com/',
     'vendor': _sp('https://www.vercel-status.com'), 'probes': []},
]

VENDOR_KINDS = ('statuspage', 'aws-health', 'azure-rss', 'gcp-incidents')


def validate_providers(providers):
    """Sprawdza i normalizuje listę usług (rzuca ValueError z czytelnym komunikatem). Zwraca nową listę."""
    if not isinstance(providers, list) or not providers: raise ValueError('lista usług musi być niepustą listą')
    out, seen, seen_probes = [], set(), set()          # id usług i id sond to osobne przestrzenie nazw
    def check_url(u, where):
        if urlparse(str(u)).scheme not in ('http', 'https') or not urlparse(str(u)).netloc: raise ValueError(f'{where}: nieprawidłowy adres "{u}" (wymagany http/https)')
    for i, p in enumerate(providers):
        if not isinstance(p, dict): raise ValueError(f'usługa #{i}: oczekiwano obiektu')
        for k in ('id', 'name'):
            if not p.get(k): raise ValueError(f'usługa #{i}: brak pola "{k}"')
        if p['id'] in seen: raise ValueError(f'powtórzone id usługi: {p["id"]}')
        seen.add(p['id'])
        v = p.get('vendor')
        if v is not None and not callable(v):
            if not isinstance(v, dict) or v.get('kind') not in VENDOR_KINDS: raise ValueError(f'{p["id"]}: vendor.kind musi być jednym z {VENDOR_KINDS}')
            if v['kind'] == 'statuspage': check_url(v.get('base'), f'{p["id"]}.vendor.base')
        probes = []
        for j, d in enumerate(p.get('probes') or []):
            if not isinstance(d, dict) or not d.get('id') or not d.get('url'): raise ValueError(f'{p["id"]}: sonda #{j} wymaga pól "id" i "url"')
            if d['id'] in seen_probes: raise ValueError(f'powtórzone id sondy: {d["id"]}')
            seen_probes.add(d['id']); check_url(d['url'], f'sonda {d["id"]}')
            probes.append({'id': d['id'], 'label': d.get('label') or d['id'], 'url': d['url']})
        out.append({'id': p['id'], 'name': p['name'], 'tagline': p.get('tagline', ''), 'pageUrl': p.get('pageUrl', ''),
                    'vendor': v if callable(v) else copy.deepcopy(v), 'probes': probes})
    return out


# ======================================================== TLS i HTTP
def ssl_context():
    """Kontekst TLS z PEŁNĄ weryfikacją certyfikatów. Gdy domyślny magazyn CA jest pusty (Python z python.org na macOS),
    wskazujemy zestaw systemowy. Weryfikacji nigdy nie wyłączamy."""
    ctx = ssl.create_default_context()
    if os.environ.get('SSL_CERT_FILE') or ctx.cert_store_stats().get('x509_ca', 0) > 0: return ctx
    cands = []
    try:
        import certifi; cands.append(certifi.where())
    except Exception: pass
    cands += ['/etc/ssl/cert.pem', '/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt', '/opt/homebrew/etc/ca-certificates/cert.pem']
    for c in cands:
        if os.path.exists(c): return ssl.create_default_context(cafile=c)
    return ctx


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None        # 3xx traktujemy jako odpowiedź, nie podążamy za nią


def _now_ms(): return int(time.time() * 1000)


def _describe(e):
    """Krótki opis błędu bez stosu i bez danych z odpowiedzi."""
    r = getattr(e, 'reason', e)
    if isinstance(r, TimeoutError) or 'timed out' in str(r): return 'timeout'
    if isinstance(r, ssl.SSLCertVerificationError): return 'tls-cert'      # brak zaufania do certyfikatu (brak CA, proxy z inspekcją TLS)
    if isinstance(r, ssl.SSLError): return 'tls'
    if isinstance(r, ConnectionRefusedError): return 'refused'
    if 'getaddrinfo' in str(r) or 'Name or service' in str(r) or 'nodename' in str(r): return 'dns'
    return (type(r).__name__ if not str(r) else str(r))[:60]


# ======================================================== parsery feedów
def _decode(b):
    if b[:2] == b'\xfe\xff': return b[2:].decode('utf-16-be')           # AWS Health: JSON w UTF-16 z BOM
    if b[:2] == b'\xff\xfe': return b[2:].decode('utf-16-le')
    return b.decode('utf-8-sig', 'replace')

def _clip(s, n=160): return re.sub(r'\s+', ' ', str(s if s is not None else '')).strip()[:n]

def _int(v):
    try: return int(v)
    except (TypeError, ValueError): return 0

def _to_ms(v):
    if v is None or v == '': return None
    if isinstance(v, (int, float)): return int(v)
    s = str(v).strip()
    try: return int(datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() * 1000)
    except ValueError: pass
    try: return int(parsedate_to_datetime(s.replace(' Z', ' GMT')).timestamp() * 1000)
    except (TypeError, ValueError): return None

def worst(*levels):
    """Najgorszy z poziomów; 'unknown' przegrywa z każdym znanym."""
    return max(levels, key=lambda l: RANK[l]) if levels else 'unknown'

_SP_LEVEL = {'none': 'operational', 'minor': 'degraded', 'major': 'partial', 'critical': 'major', 'maintenance': 'maintenance'}
_COMPONENT = {'degraded_performance': 'minor', 'partial_outage': 'major', 'major_outage': 'critical', 'under_maintenance': 'maintenance'}

def _statuspage(base, get):
    # status.json waży ~200 B - wystarcza do wykrycia zmiany; szczegóły pobieramy tylko przy problemie.
    s = json.loads(_decode(get(f'{base.rstrip("/")}/api/v2/status.json')))
    st = s.get('status') or {}
    level = _SP_LEVEL.get(st.get('indicator', ''), 'unknown')
    res = {'level': level, 'description': _clip(st.get('description'), 120) or 'Status niedostępny',
           'vendorUpdatedAt': _to_ms((s.get('page') or {}).get('updated_at')), 'incidents': []}
    if level in ('operational', 'unknown'): return res
    d = json.loads(_decode(get(f'{base.rstrip("/")}/api/v2/summary.json')))
    inc = [{'title': _clip(i.get('name')), 'impact': _clip(i.get('impact'), 20) or 'minor', 'since': _to_ms(i.get('created_at'))} for i in d.get('incidents') or []]
    if not inc:
        for c in d.get('components') or []:
            if c.get('status') and c['status'] != 'operational':
                inc.append({'title': _clip(c.get('name')), 'impact': _COMPONENT.get(c['status'], _clip(c['status'], 20)), 'since': None})
    for m in d.get('scheduled_maintenances') or []:
        if m.get('status') == 'in_progress': inc.append({'title': _clip(m.get('name')), 'impact': 'maintenance', 'since': _to_ms(m.get('scheduled_for'))})
    res['incidents'] = inc[:MAX_INCIDENTS]
    return res

_AWS_IMPACT = {1: 'info', 2: 'performance', 3: 'disruption'}

def _aws_health(get):
    text = _decode(get('https://health.aws.amazon.com/public/currentevents')).lstrip('﻿').strip()
    events = json.loads(text) if text else []
    active = [e for e in events if _int(e.get('status')) >= 1]
    mx = max((_int(e.get('status')) for e in active), default=0)
    regions = {e.get('region_name') for e in active if _int(e.get('status')) >= 3}
    level = 'operational'
    if mx >= 3: level = 'major' if len(regions) >= 3 else 'partial'      # zdarzenia AWS są zwykle regionalne
    elif mx == 2: level = 'degraded'
    inc = [{'title': _clip(f"{e.get('region_name') or 'Global'}: {e.get('service_name') or 'Service'} — {e.get('summary') or ''}"),
            'impact': _AWS_IMPACT.get(_int(e.get('status')), 'info'), 'since': _int(e.get('date')) * 1000 or None}
           for e in sorted(active, key=lambda e: -_int(e.get('status')))[:MAX_INCIDENTS]]
    newest = max((_int(e.get('date')) * 1000 for e in events), default=0)
    desc = 'Brak aktywnych zdarzeń' if not active else f"Aktywne zdarzenia: {len(active)}" + (f' · regiony z przerwą: {len(regions)}' if regions else '')
    return {'level': level, 'description': desc, 'vendorUpdatedAt': newest or None, 'incidents': inc}

def _rss_text(s): return unescape(re.sub(r'<!\[CDATA\[([\s\S]*?)\]\]>', r'\1', s))

def _azure_rss(get):
    xml = _decode(get('https://azure.status.microsoft/en-us/status/feed/'))
    items = re.findall(r'<item>([\s\S]*?)</item>', xml)
    inc = []
    for it in items[:MAX_INCIDENTS]:
        t = re.search(r'<title>([\s\S]*?)</title>', it); d = re.search(r'<pubDate>([\s\S]*?)</pubDate>', it)
        inc.append({'title': _clip(_rss_text(t.group(1)) if t else 'Incydent'), 'impact': 'incident', 'since': _to_ms(_rss_text(d.group(1))) if d else None})
    built = re.search(r'<lastBuildDate>([\s\S]*?)</lastBuildDate>', xml)
    # RSS nie niesie stopnia dotkliwości - każdy aktywny wpis traktujemy ostrożnie jako "degraded".
    return {'level': 'operational' if not items else 'degraded', 'description': 'Brak aktywnych incydentów' if not items else f'Aktywne incydenty: {len(items)}',
            'vendorUpdatedAt': _to_ms(_rss_text(built.group(1))) if built else None, 'incidents': inc}

def _gcp_incidents(get):
    allv = json.loads(_decode(get('https://status.cloud.google.com/incidents.json')))
    ongoing = [i for i in allv if not i.get('end')]               # trwający incydent = brak pola "end"
    def lvl(i):
        k = i.get('status_impact')
        if k == 'SERVICE_OUTAGE': return 'major' if len(i.get('affected_products') or []) >= 3 else 'partial'
        return 'degraded' if k == 'SERVICE_DISRUPTION' else 'operational'
    newest = max((_to_ms(i.get('modified')) or 0 for i in allv), default=0)
    return {'level': worst('operational', *[lvl(i) for i in ongoing]),
            'description': 'Brak trwających incydentów' if not ongoing else f'Trwające incydenty: {len(ongoing)}', 'vendorUpdatedAt': newest or None,
            'incidents': [{'title': _clip(f"{i.get('service_name') or 'Google Cloud'}: {i.get('external_desc') or ''}"),
                           'impact': (i.get('status_impact') or 'info').replace('SERVICE_', '').lower(), 'since': _to_ms(i.get('begin'))} for i in ongoing[:MAX_INCIDENTS]]}

def _norm_result(r):
    """Normalizuje wynik własnej funkcji vendor (uzupełnia brakujące pola)."""
    if not isinstance(r, dict) or r.get('level') not in RANK: raise ValueError('vendor() musi zwrócić słownik z polem level')
    return {'level': r['level'], 'description': _clip(r.get('description'), 160), 'vendorUpdatedAt': r.get('vendorUpdatedAt'),
            'incidents': [{'title': _clip(i.get('title')), 'impact': _clip(i.get('impact'), 20), 'since': i.get('since')} for i in (r.get('incidents') or [])[:MAX_INCIDENTS]]}

def fetch_vendor(vendor, get):
    if callable(vendor): return _norm_result(vendor(get))
    k = vendor['kind']
    if k == 'statuspage': return _statuspage(vendor['base'], get)
    if k == 'aws-health': return _aws_health(get)
    if k == 'azure-rss': return _azure_rss(get)
    if k == 'gcp-incidents': return _gcp_incidents(get)
    raise ValueError(k)


# ======================================================== silnik
class Monitor:
    """Monitor usług zewnętrznych. Wątki w tle odświeżają każde źródło co `interval_s`; `snapshot()` składa gotowy widok.

    providers  - lista usług (domyślnie PROVIDERS); interval_s - odstęp odświeżeń (min. 1 s); target_ms - cel świeżości w migawce;
    timeout_s  - limit pojedynczego zapytania (domyślnie min(5, interval_s - 0.5)); history_len - ile wyników sondy pamiętać;
    ssl_ctx    - własny kontekst TLS (domyślnie ssl_context()); user_agent - nagłówek User-Agent.
    """
    def __init__(self, providers=None, interval_s=8.0, target_ms=TARGET_MS, timeout_s=None, history_len=90, ssl_ctx=None, user_agent=UA):
        self.providers = validate_providers(providers if providers is not None else PROVIDERS)
        self.interval_s = max(1.0, float(interval_s))
        self.target_ms = int(target_ms)
        self.timeout_s = float(timeout_s) if timeout_s else min(5.0, self.interval_s - 0.5)
        self.history_len = int(history_len)
        self.user_agent = user_agent
        ctx = ssl_ctx or ssl_context()
        self._probe_opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=ctx))
        self._feed_opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
        self._cache, self._cache_lock = {}, threading.Lock()
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.dirty = threading.Event()              # ustawiane po każdym zakończonym sprawdzeniu
        self.started_at = _now_ms()
        self.vendors, self.probes = {}, {}
        self.n_sources = 0
        self._started = False

    # --- cykl życia
    def start(self):
        """Uruchamia wątki odświeżające (idempotentne). Zwraca self."""
        if self._started: return self
        self._started = True
        i = 0
        for p in self.providers:
            if p['vendor']:
                self.vendors[p['id']] = {'level': 'unknown', 'description': 'Sprawdzanie…', 'vendorUpdatedAt': None, 'checkedAt': None,
                                         'incidents': [], 'error': None, 'durationMs': None}
                self._spawn(lambda p=p: self._run_vendor(p), i * STAGGER_S); i += 1
            for d in p['probes']:
                self.probes[d['id']] = {'id': d['id'], 'label': d['label'], 'host': urlparse(d['url']).netloc, 'ok': None, 'status': None, 'ms': None,
                                        'error': None, 'checkedAt': None, 'consecutiveFails': 0, 'history': []}
                self._spawn(lambda d=d: self._run_probe(d), i * STAGGER_S); i += 1
        self.n_sources = i
        return self

    def stop(self): self.stop_event.set()
    def __enter__(self): return self.start()
    def __exit__(self, *a): self.stop()

    def _spawn(self, fn, offset): threading.Thread(target=self._loop, args=(fn, offset), daemon=True).start()

    def _loop(self, fn, offset):
        """Stały rytm: kolejne uruchomienia co interval_s od startu (bez dryfu). Wolne sprawdzenie nie nakłada się na następne."""
        self.stop_event.wait(offset)
        nxt = time.monotonic()
        while not self.stop_event.is_set():
            try: fn()
            except Exception: pass              # zadania same obsługują błędy; to tylko siatka bezpieczeństwa
            self.dirty.set()
            nxt += self.interval_s
            delay = nxt - time.monotonic()
            if delay < 0: nxt, delay = time.monotonic(), 0.0       # spóźnieni - nie nadrabiamy zaległości
            self.stop_event.wait(delay)

    # --- HTTP
    def _get(self, url):
        """GET z walidatorami ETag / Last-Modified: przy 304 zwracamy poprzednią treść (tanie odpytywanie dużych feedów)."""
        with self._cache_lock: prev = self._cache.get(url)
        h = {'User-Agent': self.user_agent, 'Accept': 'application/json, application/rss+xml, */*'}
        if prev and prev.get('etag'): h['If-None-Match'] = prev['etag']
        if prev and prev.get('lm'): h['If-Modified-Since'] = prev['lm']
        try:
            with self._feed_opener.open(urllib.request.Request(url, headers=h), timeout=self.timeout_s) as r:
                body = r.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES: raise ValueError('odpowiedź zbyt duża')
                with self._cache_lock: self._cache[url] = {'etag': r.headers.get('ETag'), 'lm': r.headers.get('Last-Modified'), 'body': body}
                return body
        except urllib.error.HTTPError as e:
            e.close()
            if e.code == 304 and prev: return prev['body']
            raise

    def _probe(self, url):
        """Sonda osiągalności: czas do nagłówków odpowiedzi (z nowym połączeniem TCP/TLS), treść porzucana. ok = HTTP < 500."""
        t0 = time.perf_counter()
        req = urllib.request.Request(url, headers={'User-Agent': self.user_agent, 'Accept': '*/*', 'Cache-Control': 'no-cache'})
        try:
            with self._probe_opener.open(req, timeout=self.timeout_s) as r: status = r.status
        except urllib.error.HTTPError as e:                       # także 3xx (bez podążania) i 4xx/5xx
            status = e.code; e.close()
        except (urllib.error.URLError, OSError, ValueError) as e:
            return {'ok': False, 'status': None, 'ms': None, 'error': _describe(e)}
        return {'ok': status < 500, 'status': status, 'ms': round((time.perf_counter() - t0) * 1000), 'error': None if status < 500 else f'HTTP {status}'}

    # --- zadania źródeł
    def _run_vendor(self, p):
        t0 = time.perf_counter()
        try: r, err = fetch_vendor(p['vendor'], self._get), None
        except Exception as e: r, err = None, _describe(e)
        dur = round((time.perf_counter() - t0) * 1000)
        with self.lock:
            s = self.vendors[p['id']]
            if r is not None: s.update(r); s.update(checkedAt=_now_ms(), error=None)
            else:                                # zachowujemy dane z ostatniego sukcesu; ich rosnący wiek widać u konsumenta
                s['error'] = err
                if s['checkedAt'] is None: s['description'] = 'Feed statusu niedostępny'
            s['durationMs'] = dur

    def _run_probe(self, d):
        r = self._probe(d['url'])
        with self.lock:
            s = self.probes[d['id']]
            s.update(ok=r['ok'], status=r['status'], ms=r['ms'], error=r['error'], checkedAt=_now_ms())
            s['consecutiveFails'] = 0 if r['ok'] else s['consecutiveFails'] + 1
            s['history'].append((r['ok'], r['ms']))
            del s['history'][:-self.history_len]

    @staticmethod
    def _probe_level(s):
        """Pojedyncza porażka to tylko "degraded" (ochrona przed fałszywym alarmem); trzy z rzędu = awaria."""
        if s['ok'] is None: return 'unknown'
        if s['consecutiveFails'] >= 3: return 'major'
        if s['consecutiveFails'] >= 1: return 'degraded'
        if s['ms'] is not None and s['ms'] > SLOW_MS: return 'degraded'
        return 'operational'

    # --- widok
    def ready(self):
        """True, gdy każde źródło ma już pierwszy wynik."""
        with self.lock:
            return self._started and all(v['checkedAt'] is not None for v in self.vendors.values()) and all(p['checkedAt'] is not None for p in self.probes.values())

    def snapshot(self):
        now = _now_ms()
        with self.lock:
            probes = {k: dict(v, history=list(v['history'])) for k, v in self.probes.items()}
            vendors = {k: dict(v, incidents=list(v['incidents'])) for k, v in self.vendors.items()}
        # Jeśli prawie wszystkie sondy padają na poziomie sieci, to problem po stronie hosta monitorującego, nie usług.
        known = [p for p in probes.values() if p['ok'] is not None and p['checkedAt'] is not None and now - p['checkedAt'] < self.interval_s * 3000]
        net_fail = [p for p in known if p['ok'] is False and p['status'] is None]
        host_issue = len(known) >= 6 and len(net_fail) / len(known) >= 0.8
        errs = [p['error'] for p in net_fail if p['error']]
        host_error = max(set(errs), key=errs.count) if host_issue and errs else None     # najczęstsza przyczyna, np. 'tls-cert' albo 'dns'

        views = []
        for p in self.providers:
            v = vendors.get(p['id'])
            pstates = [probes[d['id']] for d in p['probes'] if d['id'] in probes]
            pviews = []
            for s in pstates:
                ms_vals = [m for _, m in s['history'] if m is not None]
                pviews.append({'id': s['id'], 'label': s['label'], 'host': s['host'], 'level': 'unknown' if host_issue else self._probe_level(s),
                               'ok': s['ok'], 'status': s['status'], 'ms': s['ms'], 'avgMs': round(sum(ms_vals) / len(ms_vals)) if ms_vals else None,
                               'error': s['error'], 'checkedAt': s['checkedAt'],
                               'history': ''.join('1' if ok else '0' for ok, _ in s['history'][-VIEW_HISTORY:])})
            known_l = [x['level'] for x in pviews if x['level'] != 'unknown']
            majors = sum(1 for l in known_l if l == 'major')
            if not known_l: plevel = 'unknown'
            elif majors == len(known_l): plevel = 'major'                       # wszystkie sondy leżą
            elif majors: plevel = 'partial'                                     # część leży
            else: plevel = worst(*known_l)
            vlevel = v['level'] if v else 'unknown'
            level = 'unknown' if host_issue else worst(vlevel, plevel)
            checks = ([v['checkedAt'] if v else None] if p['vendor'] else []) + [s['checkedAt'] for s in pstates]   # v bywa None przed start()
            oldest = min(checks) if checks and all(c is not None for c in checks) else None   # None, dopóki któreś źródło nie zostało sprawdzone
            hist = [h for s in pstates for h in s['history']]
            views.append({'id': p['id'], 'name': p['name'], 'tagline': p['tagline'], 'pageUrl': p['pageUrl'], 'level': level,
                          'levelSource': 'both' if vlevel != 'unknown' and plevel != 'unknown' else 'vendor' if vlevel != 'unknown' else 'probes' if plevel != 'unknown' else 'none',
                          'vendor': v, 'probes': pviews, 'oldestCheckAt': oldest,
                          'uptime': round(100 * sum(1 for ok, _ in hist if ok) / len(hist), 2) if hist else None})
        counts = {k: 0 for k in RANK}
        for x in views: counts[x['level']] += 1
        return {'serverNow': now, 'startedAt': self.started_at, 'intervalMs': int(self.interval_s * 1000), 'targetMs': self.target_ms,
                'hostNetworkIssue': host_issue, 'hostIssueError': host_error,
                'overall': 'unknown' if host_issue else worst(*[x['level'] for x in views]), 'counts': counts, 'providers': views}


# ======================================================== mikroserwis: API + SSE + panel
def _sse(snap): return ('data: ' + json.dumps(snap, ensure_ascii=False, separators=(',', ':')) + '\n\n').encode('utf-8')


def serve(monitor, host='127.0.0.1', port=8780, panel=True, cors_origin=None, block=True):
    """HTTP: GET / (panel), /api/status (JSON), /events (SSE, ≤1 migawka/s, tylko gdy coś się zmieniło), /health.
    Zwraca obiekt serwera (przy block=False działa w tle; zatrzymanie: srv.shutdown())."""
    monitor.start()
    clients, clock, stop = set(), threading.Lock(), threading.Event()

    def broadcaster():
        while not stop.is_set():
            if not monitor.dirty.wait(1.0): continue
            monitor.dirty.clear()
            with clock: qs = list(clients)
            if qs:
                data = _sse(monitor.snapshot())
                for q in qs:
                    if q.qsize() < 20: q.put(data)          # migawka jest idempotentna - klientom z zatkaną kolejką ją pomijamy
            stop.wait(1.0)                                  # ograniczenie: najwyżej 1 migawka na sekundę

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _send(self, code, body, ctype):
            self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            if cors_origin: self.send_header('Access-Control-Allow-Origin', cors_origin)
            self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            p = self.path.split('?')[0]
            if p in ('/', '/index.html') and panel: self._send(200, PANEL_HTML.encode('utf-8'), 'text/html; charset=utf-8')
            elif p == '/api/status': self._send(200, json.dumps(monitor.snapshot(), ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')
            elif p == '/health': self._send(200, b'{"ok":true}', 'application/json')
            elif p == '/events': self._events()
            else: self._send(404, b'{"ok":false}', 'application/json')

        def _events(self):
            self.send_response(200); self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-transform'); self.send_header('Connection', 'keep-alive'); self.send_header('X-Accel-Buffering', 'no')
            if cors_origin: self.send_header('Access-Control-Allow-Origin', cors_origin)
            self.end_headers()
            q = queue.Queue(); q.put(_sse(monitor.snapshot()))          # od razu aktualny stan, potem zmiany
            with clock: clients.add(q)
            try:
                while not stop.is_set():
                    try: self.wfile.write(q.get(timeout=10))
                    except queue.Empty: self.wfile.write(b': ping\n\n')   # heartbeat: utrzymuje połączenie i pozwala klientowi wykryć zerwanie
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError): pass
            finally:
                with clock: clients.discard(q)

    srv = ThreadingHTTPServer((host, port), H); srv.daemon_threads = True
    threading.Thread(target=broadcaster, daemon=True).start()
    _shutdown = srv.shutdown
    srv.shutdown = lambda: (stop.set(), _shutdown())                    # zatrzymuje też rozgłaszanie
    if block:
        try: srv.serve_forever()
        finally: stop.set()
    else: threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


PANEL_HTML = r'''<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Status usług zewnętrznych</title>
<style>
:root{--bg:#0a0f1c;--card:#121b30;--line:#22304d;--ink:#e8eefb;--mut:#8ea2c4;--dim:#5d7092;--blue:#4f9bff;--green:#34d399;--amber:#fbbf24;--red:#fb6a6a;--orange:#ff9d57}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:860px;margin:0 auto;padding:24px 16px 40px}h1{margin:0;font-size:20px}.head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
#meta{color:var(--mut);font-size:12.5px}.fresh{margin-top:10px;font-size:12.5px;color:var(--mut)}.fresh b{color:var(--ink);font-size:15px}.fresh.bad b{color:var(--amber)}
.banner{margin-top:10px;padding:9px 13px;border-radius:10px;font-size:13px;border:1px solid var(--line);color:var(--mut);background:rgba(255,255,255,.03)}
.banner.ok{color:var(--green);border-color:rgba(52,211,153,.35);background:rgba(52,211,153,.08)}.banner.warn{color:var(--amber);border-color:rgba(251,191,36,.4);background:rgba(251,191,36,.08)}.banner.crit{color:var(--red);border-color:rgba(251,106,106,.45);background:rgba(251,106,106,.1)}
#list{margin-top:12px;display:flex;flex-direction:column;gap:7px}.empty{color:var(--mut);padding:18px;text-align:center}
.lv-operational{--c:var(--green)}.lv-maintenance{--c:var(--blue)}.lv-degraded{--c:var(--amber)}.lv-partial{--c:var(--orange)}.lv-major{--c:var(--red)}.lv-unknown{--c:var(--dim)}
details.cl{border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;background:var(--card)}
details.cl>summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:10px 12px;border-radius:10px}
details.cl>summary::-webkit-details-marker{display:none}details.cl>summary:hover{background:rgba(255,255,255,.04)}details.cl>summary:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
details.cl>summary::after{content:"▾";color:var(--dim);transition:transform .15s}details.cl[open]>summary::after{transform:rotate(180deg)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--c);flex:none}.main{min-width:0;display:flex;flex-direction:column}
.name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.desc{color:var(--mut);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge{font-size:11px;font-weight:750;padding:2px 8px;border-radius:99px;border:1px solid color-mix(in srgb,var(--c) 50%,transparent);color:var(--c);background:color-mix(in srgb,var(--c) 10%,transparent);white-space:nowrap}
.body{padding:4px 12px 11px;border-top:1px solid var(--line)}.inc{list-style:none;margin:8px 0 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03);display:flex;flex-direction:column;gap:5px;font-size:12px;color:#cfdaf1}
.inc b{color:var(--mut);text-transform:uppercase;font-size:10.5px;letter-spacing:.4px}.inc .d{color:var(--dim)}
.probes{list-style:none;margin:6px 0 0;padding:0}.probe{display:grid;grid-template-columns:auto minmax(0,1fr) auto 62px 30px;align-items:center;gap:9px;padding:5px 0;font-size:12px;border-bottom:1px solid rgba(34,48,77,.6)}.probe:last-child{border-bottom:0}
.plabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bars{display:flex;gap:1px;height:13px}.bars i{width:3px;border-radius:1px;background:#1b2742}.bars i.u{background:rgba(52,211,153,.85)}.bars i.d{background:var(--red)}
.ms{text-align:right;color:#cfdaf1}.ms.bad{color:var(--red)}.st{text-align:right;color:var(--dim)}.foot{display:flex;justify-content:space-between;gap:10px;margin-top:8px;font-size:11.5px;color:var(--dim)}.foot a{color:var(--mut);text-decoration:none}.foot a:hover{color:var(--blue)}
.hint{color:var(--dim);font-size:12px;margin-top:14px}@media(max-width:560px){.bars{display:none}.probe{grid-template-columns:auto minmax(0,1fr) 62px 30px}}
</style></head><body><main>
<div class="head"><h1>Status usług zewnętrznych</h1><span id="meta">łączenie…</span></div>
<div class="fresh" id="fresh">Najstarszy odczyt: <b id="age">–</b> s · <span id="target">cel ≤ 10 s</span></div>
<div class="banner" id="banner">Sprawdzanie usług…</div>
<div id="list"><div class="empty">Ładowanie…</div></div>
<p class="hint">Statusy dostawców publikują ludzie i bywają spóźnione o minuty; sondy pokazują osiągalność z serwera monitorującego teraz.</p>
</main><script>
const L={operational:'Sprawny',maintenance:'Konserwacja',degraded:'Pogorszenie',partial:'Awaria częściowa',major:'Poważna awaria',unknown:'Sprawdzanie…'};
const $=id=>document.getElementById(id),esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const API=(new URLSearchParams(location.search).get('api')||'').replace(/\/$/,'');   // ?api=http://host:port gdy panel jest serwowany skąd indziej
const S={snap:null,off:0,lastAt:0,sseAt:0,boot:Date.now(),lastFetch:0,els:new Map(),html:new Map(),open:new Set()};
const now=()=>Date.now()+S.off,age=ts=>Math.max(0,(now()-ts)/1000),lost=()=>S.lastAt>0&&Date.now()-S.lastAt>12000,silent=()=>Date.now()-(S.sseAt||S.boot)>12000;
const since=ms=>{if(!ms)return'';const d=new Date(ms);return(new Date().toDateString()===d.toDateString()?'od '+d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'od '+d.toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'}))};
const bars=h=>[...h.slice(-20).padStart(20,'_')].map(c=>`<i class="${c==='1'?'u':c==='0'?'d':''}"></i>`).join('');
const probe=p=>`<li class="probe lv-${p.level}"><span class="dot"></span><span class="plabel" title="${esc(p.host)}">${esc(p.label)}</span><span class="bars" aria-hidden="true">${bars(p.history)}</span><span class="ms${p.ok===false?' bad':''}">${p.ok===null?'…':p.ok?p.ms+' ms':esc(p.error||'błąd')}</span><span class="st">${p.status==null?'—':p.status}</span></li>`;
function row(p){const v=p.vendor,d=v?esc(v.description)+(v.error?` (błąd feedu: ${esc(v.error)})`:''):'Brak publicznego API statusu - tylko sondy';
 const inc=v&&v.incidents.length?'<ul class="inc">'+v.incidents.map(i=>`<li><b>${esc(i.impact)}</b> ${esc(i.title)}${i.since?` <span class="d">· ${esc(since(i.since))}</span>`:''}</li>`).join('')+'</ul>':'';
 const pr=p.probes.length?'<ul class="probes">'+p.probes.map(probe).join('')+'</ul>':'',ch=p.oldestCheckAt!=null?`Sprawdzono <span data-ts="${p.oldestCheckAt}">…</span>`:'Sprawdzanie…';
 return`<summary><span class="dot"></span><span class="main"><span class="name">${esc(p.name)}</span><span class="desc" title="${esc(v?v.description:'')}">${d}</span></span><span class="badge">${L[p.level]}</span></summary><div class="body">${inc}${pr}<div class="foot"><span>${ch}${p.uptime!=null&&p.probes.length?` · sondy OK ${p.uptime}%`:''}</span>${/^https?:/.test(p.pageUrl)?`<a href="${esc(p.pageUrl)}" target="_blank" rel="noopener noreferrer">Oficjalny status ↗</a>`:''}</div></div>`}
function render(){const s=S.snap;if(!s)return;const list=$('list');if(!S.els.size)list.innerHTML='';
 for(const p of s.providers){let el=S.els.get(p.id);if(!el){el=document.createElement('details');el.open=S.open.has(p.id);el.addEventListener('toggle',()=>{el.open?S.open.add(p.id):S.open.delete(p.id)});list.appendChild(el);S.els.set(p.id,el)}
  const cls='cl lv-'+p.level;if(el.className!==cls)el.className=cls;const h=row(p);if(S.html.get(p.id)!==h){el.innerHTML=h;S.html.set(p.id,h)}}
 const bad=s.providers.filter(p=>p.level!=='operational'&&p.level!=='unknown'),pend=s.providers.filter(p=>p.level==='unknown').length;let cls='banner',msg;
 if(lost()){cls+=' crit';msg='Utracono połączenie z odczytem na żywo - dane poniżej mogą być nieaktualne.'}
 else if(s.hostNetworkIssue){cls+=' warn';msg='Prawie wszystkie sondy zawodzą na poziomie sieci'+(s.hostIssueError?` (najczęstszy błąd: ${esc(s.hostIssueError)})`:'')+', więc problem leży raczej po stronie serwera monitorującego niż usług. Statusy są ukryte do czasu odzyskania łączności.'+(s.hostIssueError==='tls-cert'?' Serwer nie ufa certyfikatom - ustaw SSL_CERT_FILE na plik z zaufanym CA.':'')}
 else if(bad.length){cls+=bad.some(p=>p.level==='major'||p.level==='partial')?' crit':' warn';msg=`Zgłoszone problemy (${bad.length} z ${s.providers.length}): ${bad.map(p=>esc(p.name)).join(', ')}.`}
 else if(pend)msg=`Sprawdzanie usług: ${pend}…`;else{cls+=' ok';msg='Wszystkie monitorowane usługi działają.'}
 const b=$('banner');if(b.className!==cls)b.className=cls;if(b.innerHTML!==msg)b.innerHTML=msg;
 $('meta').textContent=`co ${Math.round(s.intervalMs/1000)} s · ${s.counts.operational||0}/${s.providers.length} sprawnych`+(silent()&&!lost()?' · tryb awaryjny':'');tick()}
function tick(){const s=S.snap;if(!s)return;document.querySelectorAll('#list [data-ts]').forEach(el=>{const a=age(+el.dataset.ts),t=a<1?'przed chwilą':Math.round(a)+' s temu';if(el.textContent!==t)el.textContent=t});
 const st=s.providers.map(p=>p.oldestCheckAt),tg=s.targetMs/1000;if(st.some(t=>t==null)){$('age').textContent='–';$('target').textContent='czekam na pierwsze sprawdzenia…';$('fresh').classList.remove('bad');return}
 const o=Math.max(...st.map(age)),ok=o<=tg&&!lost();$('age').textContent=o.toFixed(1);$('fresh').classList.toggle('bad',!ok);$('target').textContent=lost()?'połączenie utracone - dane się starzeją':ok?`w celu (≤ ${tg} s)`:`poza celem (> ${tg} s)`}
function onSnap(m){S.snap=m;S.lastAt=Date.now();S.off=m.serverNow-Date.now();render()}
function fetchSnap(){S.lastFetch=Date.now();return fetch(API+'/api/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(m=>{if(m&&m.providers)onSnap(m)}).catch(()=>{})}
setInterval(()=>{tick();if(silent()&&Date.now()-S.lastFetch>1000)fetchSnap().then(render)},1000);   // gdy SSE milczy: odpytywanie co 1 s, żeby dane nie wyszły poza cel
fetchSnap();const es=new EventSource(API+'/events');es.onmessage=e=>{S.sseAt=Date.now();onSnap(JSON.parse(e.data))};es.onopen=()=>fetchSnap();
</script></body></html>
'''


# ======================================================== CLI
def _load_providers(path):
    try:
        with open(path, encoding='utf-8') as f: return json.load(f)
    except (OSError, ValueError) as e:
        sys.exit(f'Nie można wczytać listy usług z "{path}": {e}')


def _check(monitor, duration):
    """Pomiar świeżości w procesie: odstęp między kolejnymi odświeżeniami każdego źródła = najgorszy wiek danych tuż przed aktualizacją."""
    monitor.start()
    for _ in range(300):
        if monitor.ready(): break
        time.sleep(0.1)
    src = {}
    def sample():
        s = monitor.snapshot()
        def note(k, ts):
            if ts is None: return
            e = src.setdefault(k, {'t': set(), 'obs': 0}); e['t'].add(ts); e['obs'] = max(e['obs'], s['serverNow'] - ts)
        for p in s['providers']:
            if p['vendor']: note(p['id'] + ':feed', p['vendor']['checkedAt'])
            for pr in p['probes']: note(pr['id'], pr['checkedAt'])
    sample(); src.clear()
    target = monitor.target_ms
    print(f'Pomiar {duration:g} s | interwał: {monitor.interval_s:g} s | cel: {target / 1000:g} s | źródeł: {monitor.n_sources}')
    end = time.time() + duration
    while time.time() < end: sample(); time.sleep(0.25)
    rows = []
    for k, e in src.items():
        t = sorted(e['t']); gaps = [b - a for a, b in zip(t, t[1:])]
        rows.append((k, len(t), max(gaps) if gaps else float('nan'), sum(gaps) / len(gaps) if gaps else float('nan'), e['obs']))
    rows.sort(key=lambda r: -(r[2] if r[2] == r[2] else 0))
    print('\nźródło                      odświeżeń  maks. odstęp  śr. odstęp  maks. zaobserwowany wiek')
    for k, n, mg, ag, mo in rows:
        print(f'{k:<26}{n:>10}  {mg / 1000:>8.2f} s  {ag / 1000:>8.2f} s  {mo / 1000:>8.2f} s' + ('  <-- POZA CELEM' if mg > target or mo > target else ''))
    gaps_all = sorted(r[2] for r in rows if r[2] == r[2])
    if not gaps_all: print('Brak danych (za krótki pomiar albo brak łączności).'); return 2
    over = [r for r in rows if r[2] > target or r[4] > target]
    p95 = gaps_all[min(len(gaps_all) - 1, int(0.95 * len(gaps_all)))]
    print(f'\nŹródeł: {len(rows)} | najgorszy odstęp: {gaps_all[-1] / 1000:.2f} s | p95: {p95 / 1000:.2f} s | poza celem {target / 1000:g} s: {len(over)}')
    print(f'WYNIK: OK - każde źródło odświeżane częściej niż co {target / 1000:g} s.' if not over else 'WYNIK: PRZEKROCZENIE celu świeżości.')
    return 0 if not over else 1


def main(argv=None):
    ap = argparse.ArgumentParser(prog='status_uslug', description='Monitoring statusu usług zewnętrznych (AWS, Microsoft, Google Cloud...).')
    ap.add_argument('--version', action='version', version=__version__)
    sub = ap.add_subparsers(dest='cmd')
    def common(p):
        p.add_argument('--interval', type=float, default=float(os.environ.get('STATUS_USLUG_INTERVAL_S', '8')), help='odstęp odświeżeń w sekundach (min. 1; domyślnie 8)')
        p.add_argument('--providers', metavar='PLIK.json', help='własna lista usług zamiast domyślnej (wzorzec: `status_uslug.py providers`)')
    s = sub.add_parser('serve', help='panel + API + SSE (domyślne polecenie)'); common(s)
    s.add_argument('--host', default='127.0.0.1'); s.add_argument('--port', type=int, default=int(os.environ.get('PORT', '8780')))
    s.add_argument('--no-panel', action='store_true', help='tylko API, bez strony HTML'); s.add_argument('--cors', metavar='ORIGIN', help='nagłówek Access-Control-Allow-Origin (np. "*")')
    c = sub.add_parser('check', help='pomiar świeżości w procesie'); common(c); c.add_argument('--duration', type=float, default=50)
    d = sub.add_parser('dump', help='jedna migawka JSON po pierwszym pełnym obiegu'); common(d)
    d.add_argument('--wait', type=float, default=15, help='maks. czas oczekiwania na pierwsze wyniki (s)'); d.add_argument('--pretty', action='store_true')
    sub.add_parser('providers', help='wypisz domyślną listę usług jako JSON')
    a = ap.parse_args(argv)
    cmd = a.cmd or 'serve'
    if cmd == 'providers': print(json.dumps(PROVIDERS, ensure_ascii=False, indent=2)); return 0
    if a.cmd is None: a = ap.parse_args(['serve'] + (argv or sys.argv[1:]))
    try: mon = Monitor(providers=_load_providers(a.providers) if a.providers else None, interval_s=a.interval)
    except ValueError as e: sys.exit(f'Błąd konfiguracji: {e}')
    if cmd == 'check': return _check(mon, a.duration)
    if cmd == 'dump':
        mon.start(); t_end = time.time() + a.wait
        while time.time() < t_end and not mon.ready(): time.sleep(0.1)
        print(json.dumps(mon.snapshot(), ensure_ascii=False, indent=2 if a.pretty else None)); return 0 if mon.ready() else 1
    if a.host not in ('127.0.0.1', 'localhost', '::1'): print('UWAGA: serwer nasłuchuje poza localhost, a API nie ma uwierzytelniania.', file=sys.stderr)
    mon.start()
    print(f'status_uslug {__version__}: http://{a.host}:{a.port}  ({len(mon.providers)} usług, {mon.n_sources} źródeł, odświeżanie co {mon.interval_s:g} s)', flush=True)
    try: serve(mon, host=a.host, port=a.port, panel=not a.no_panel, cors_origin=a.cors)
    except KeyboardInterrupt: pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
