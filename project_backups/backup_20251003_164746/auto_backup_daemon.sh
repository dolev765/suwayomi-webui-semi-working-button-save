#!/bin/bash
#
# auto_backup_daemon.sh
# Background daemon that watches for changes and creates backups
# Optimized for minimal resource usage
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCH_DIR="$SCRIPT_DIR"
PID_FILE="$SCRIPT_DIR/.backup_daemon.pid"
LOG_FILE="$SCRIPT_DIR/.backup_daemon.log"
EXCLUDE_PATTERNS="(node_modules|\.git|project_backups|buildZip|\.cache|dist|build|Suwayomi-Server|manga-image-translator)"
DEBOUNCE_SECONDS=10
MAX_LOG_SIZE=1048576  # 1MB

# Check if daemon is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "Daemon already running with PID $OLD_PID"
        exit 1
    else
        rm -f "$PID_FILE"
    fi
fi

# Function to rotate log if too large
rotate_log() {
    if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null) -gt $MAX_LOG_SIZE ]; then
        mv "$LOG_FILE" "$LOG_FILE.old"
        touch "$LOG_FILE"
    fi
}

# Function to log messages
log_msg() {
    rotate_log
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Build the optimized version if needed
if [ ! -f "$SCRIPT_DIR/auto_backup_optimized" ]; then
    cd "$SCRIPT_DIR"
    gcc -Wall -O3 -march=native -o auto_backup_optimized auto_backup_optimized.c 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "Failed to build auto_backup_optimized"
        exit 1
    fi
fi

# Daemonize
nohup bash -c '
LAST_BACKUP=0

log_msg "Backup daemon started (PID: $$)"

while true; do
    if command -v inotifywait &> /dev/null; then
        # Use inotifywait if available (more efficient)
        inotifywait -r -q -e modify,create,delete,move \
            --exclude "'"$EXCLUDE_PATTERNS"'" \
            --timeout 30 \
            "'"$WATCH_DIR"'" 2>/dev/null | while read -r changed_file; do
            
            CURRENT_TIME=$(date +%s)
            
            if [ $((CURRENT_TIME - LAST_BACKUP)) -ge '"$DEBOUNCE_SECONDS"' ]; then
                log_msg "Changes detected, creating backup..."
                "'"$SCRIPT_DIR"'/auto_backup_optimized" -q -m "Auto-backup: file change" >> "'"$LOG_FILE"'" 2>&1
                LAST_BACKUP=$(date +%s)
                log_msg "Backup completed"
            fi
        done
    else
        # Fallback: check for file modifications periodically
        sleep 60
        
        CURRENT_TIME=$(date +%s)
        if [ $((CURRENT_TIME - LAST_BACKUP)) -ge 3600 ]; then
            log_msg "Hourly backup triggered"
            "'"$SCRIPT_DIR"'/auto_backup_optimized" -q -m "Hourly auto-backup" >> "'"$LOG_FILE"'" 2>&1
            LAST_BACKUP=$(date +%s)
        fi
    fi
    
    sleep 1
done
' > /dev/null 2>&1 &

DAEMON_PID=$!
echo $DAEMON_PID > "$PID_FILE"

echo "Backup daemon started with PID $DAEMON_PID"
echo "Log file: $LOG_FILE"
echo "To stop: kill $DAEMON_PID"

