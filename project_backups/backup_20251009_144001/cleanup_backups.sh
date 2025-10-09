#!/bin/bash
#
# cleanup_backups.sh
# Manages backup retention - keeps only the most recent backups
#

# Configuration
BACKUP_DIR="project_backups"
KEEP_RECENT=10  # Number of recent backups to keep
COMPRESS_OLD=false  # Set to true to compress instead of delete

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          BACKUP CLEANUP UTILITY                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}Error: Backup directory '$BACKUP_DIR' not found${NC}"
    exit 1
fi

# Count backups
TOTAL_BACKUPS=$(ls -1d "$BACKUP_DIR"/backup_* 2>/dev/null | wc -l)

if [ $TOTAL_BACKUPS -eq 0 ]; then
    echo -e "${YELLOW}No backups found in $BACKUP_DIR${NC}"
    exit 0
fi

echo -e "${GREEN}Total backups found:${NC} $TOTAL_BACKUPS"
echo -e "${GREEN}Keeping most recent:${NC} $KEEP_RECENT"
echo ""

# Calculate how many to remove
TO_REMOVE=$((TOTAL_BACKUPS - KEEP_RECENT))

if [ $TO_REMOVE -le 0 ]; then
    echo -e "${GREEN}✓ No cleanup needed. Total backups ($TOTAL_BACKUPS) <= Keep limit ($KEEP_RECENT)${NC}"
    exit 0
fi

echo -e "${YELLOW}Will remove/compress $TO_REMOVE old backup(s)${NC}"
echo ""

# Get list of old backups (sorted by time, oldest first)
OLD_BACKUPS=$(ls -1td "$BACKUP_DIR"/backup_* | tail -n $TO_REMOVE)

# Process each old backup
REMOVED_COUNT=0
for backup in $OLD_BACKUPS; do
    if [ "$COMPRESS_OLD" = true ]; then
        # Compress instead of delete
        if [ ! -f "${backup}.tar.gz" ]; then
            echo -e "${BLUE}Compressing:${NC} $(basename "$backup")"
            tar -czf "${backup}.tar.gz" -C "$(dirname "$backup")" "$(basename "$backup")" 2>/dev/null
            if [ $? -eq 0 ]; then
                rm -rf "$backup"
                echo -e "${GREEN}✓ Compressed to $(basename "${backup}.tar.gz")${NC}"
                ((REMOVED_COUNT++))
            else
                echo -e "${RED}✗ Failed to compress $(basename "$backup")${NC}"
            fi
        fi
    else
        # Delete old backup
        echo -e "${YELLOW}Removing:${NC} $(basename "$backup")"
        rm -rf "$backup"
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Removed${NC}"
            ((REMOVED_COUNT++))
        else
            echo -e "${RED}✗ Failed to remove$(basename "$backup")${NC}"
        fi
    fi
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          CLEANUP COMPLETED                                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Processed:${NC} $REMOVED_COUNT backup(s)"
echo -e "${GREEN}Remaining:${NC} $(ls -1d "$BACKUP_DIR"/backup_* 2>/dev/null | wc -l) backup(s)"
echo ""

# Show current backup sizes
echo -e "${BLUE}Current backup directory size:${NC}"
du -sh "$BACKUP_DIR"

