#!/bin/bash
# Zatrzymuje wszystkie aplikacje z tego folderu (porty 8700, 8641, 8642).
# Dwuklik w Finderze albo:  ./stop_all.command
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
stopped=0
for port in 8700 8641 8642; do
  for pid in $(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)
    case "$cwd" in
      "$ROOT"/*) kill "$pid" 2>/dev/null && echo "✓ zatrzymano proces $pid (port $port)"; stopped=$((stopped+1)) ;;
      *) echo "• port $port zajmuje proces spoza tego folderu ($cwd), pomijam" ;;
    esac
  done
done
rm -rf "$ROOT/.pids"
[ "$stopped" -eq 0 ] && echo "Nic nie działało na portach 8700, 8641, 8642."
exit 0
