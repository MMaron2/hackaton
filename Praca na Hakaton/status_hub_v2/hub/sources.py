"""Source access for the Status Hub. In this prototype the sources are served by the failure generator (a simulated platform);
in production the same methods would call New Relic NRQL, vendor status pages, the telephony platform and Google Analytics.
Only this class changes, the engine does not."""
import json
import urllib.request


class HttpSource:
    def __init__(self, base):
        self.base = base.rstrip("/")

    def get(self, path, timeout=3):
        with urllib.request.urlopen(self.base + path, timeout=timeout) as r:
            return json.load(r)
