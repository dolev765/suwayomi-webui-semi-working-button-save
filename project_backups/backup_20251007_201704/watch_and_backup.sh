#!/bin/bash
#
# watch_and_backup.sh
# Watches for file changes and automatically creates backups
#
# Requirements: inotify-tools (install with: sudo apt-get install inotify-tools)
#

# Configuration
WATCH_DIR="."
EXCLUDE_PATTERNS="(node_modules|\.git|project_backups|buildZip|\.cache|dist|build)"
DEBOUNCE_SECONDS=5

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     AUTO-BACKUP FILE WATCHER STARTED                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Watching directory:${NC} $WATCH_DIR"
echo -e "${GREEN}Excluded patterns:${NC} $EXCLUDE_PATTERNS"
echo -e "${GREEN}Debounce time:${NC} $DEBOUNCE_SECONDS seconds"
echo ""
echo -e "${YELLOW}Waiting for file changes...${NC}"
echo ""

# Make sure auto_backup is built
if [ ! -f "./auto_backup" ]; then
    echo -e "${YELLOW}Building auto_backup...${NC}"
    make
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to build auto_backup. Please run 'make' manually.${NC}"
        exit 1
    fi
fi

# Variable to track last backup time for debouncing
LAST_BACKUP=0

# Function to create backup
create_backup() {
    local changed_file="$1"
    local current_time=$(date +%s)
    
    # Debounce: only backup if enough time has passed
    if [ $((current_time - LAST_BACKUP)) -lt $DEBOUNCE_SECONDS ]; then
        echo -e "${YELLOW}[DEBOUNCED]${NC} Too soon since last backup, waiting..."
        return
    fi
    
    echo ""
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} Change detected: $changed_file"
    echo -e "${BLUE}Creating backup...${NC}"
    
    ./auto_backup -m "Auto-backup: $(basename "$changed_file") changed"
    
    if [ $? -eq 0 ]; then
        LAST_BACKUP=$(date +%s)
        echo -e "${GREEN}✓ Backup completed successfully${NC}"
    else
        echo -e "${RED}✗ Backup failed${NC}"
    fi
    
    echo -e "${YELLOW}Waiting for next change...${NC}"
    echo ""
}

# Main watch loop using inotifywait
while true; do
    # Watch for file modifications, creations, deletions, and moves
    inotifywait -r -q -e modify,create,delete,move \
        --exclude "$EXCLUDE_PATTERNS" \
        --format '%w%f' \
        "$WATCH_DIR" 2>/dev/null | while read changed_file; do
        
        create_backup "$changed_file"
    done
    
    # If inotifywait exits, wait a bit and restart
    sleep 1
done

