#!/bin/bash
# Uruchamia wszystkie aplikacje naraz: pokazówka (8700), generator awarii (8641), Hub z generatorem (8642).
# Dwuklik w Finderze albo:  ./start_all.command
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
LOGS="$ROOT/logs"; PIDS="$ROOT/.pids"
mkdir -p "$LOGS" "$PIDS"
command -v python3 >/dev/null || { echo "Brak python3. Zainstaluj Python 3 (xcode-select --install)."; exit 1; }

start() {  # nazwa, port, katalog, argumenty dodatkowe
  local name="$1" port="$2" dir="$3"; shift 3
  if lsof -ti tcp:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "• $name: port $port jest już zajęty (aplikacja prawdopodobnie już działa). Użyj stop_all.command, jeśli chcesz zrestartować."
    return
  fi
  ( cd "$ROOT/$dir" && nohup python3 server.py --port "$port" "$@" > "$LOGS/$name.log" 2>&1 & echo $! > "$PIDS/$name.pid" )
  for _ in $(seq 1 20); do curl -s -o /dev/null "http://localhost:$port/" && { echo "✓ $name działa: http://localhost:$port"; return; }; sleep 0.5; done
  echo "✗ $name nie wystartował, sprawdź $LOGS/$name.log"
}

echo "Uruchamiam aplikacje z: $ROOT"
start pokazowka 8700 status_hub_v3/server
start generator 8641 status_hub_v2/generator --realtime
start hub 8642 status_hub_v2/hub --source http://localhost:8641
echo "  generator startuje od bieżącej godziny i idzie w czasie rzeczywistym (1×); przyspieszenie: przyciski prędkości w pokazówce albo w panelu generatora"

echo
echo "  Pokazówka na prawdziwych danych:  http://localhost:8700"
echo "  Panel generatora awarii:          http://localhost:8641"
echo "  Hub z generatorem:                http://localhost:8642"
echo "  Zatrzymanie wszystkiego:          ./stop_all.command"
if [ "$1" != "--no-open" ]; then open http://localhost:8700 http://localhost:8641 http://localhost:8642 2>/dev/null; fi
