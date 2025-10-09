#!/bin/bash
#
# stop_backup_daemon.sh
# Stops the backup daemon
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.backup_daemon.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "Daemon is not running (PID file not found)"
    exit 1
fi

PID=$(cat "$PID_FILE")

if ps -p "$PID" > /dev/null 2>&1; then
    echo "Stopping backup daemon (PID: $PID)..."
    kill "$PID"
    rm -f "$PID_FILE"
    echo "Daemon stopped successfully"
else
    echo "Daemon with PID $PID is not running"
    rm -f "$PID_FILE"
    exit 1
fi

