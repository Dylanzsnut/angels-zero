#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "Starting ANGELS ZERO..."

if command -v python3 >/dev/null 2>&1; then
    exec python3 server.py
elif command -v python >/dev/null 2>&1; then
    exec python server.py
elif command -v npx >/dev/null 2>&1; then
    echo "Python not found. Launching with Node.js static server..."
    if command -v open >/dev/null 2>&1; then
        (sleep 1 && open "http://127.0.0.1:8090/") &
    elif command -v xdg-open >/dev/null 2>&1; then
        (sleep 1 && xdg-open "http://127.0.0.1:8090/") &
    fi
    exec npx --yes serve -l 8090 angel-zero
else
    echo "Error: Python 3 or Node.js is required to run ANGELS ZERO locally."
    exit 1
fi
