#!/bin/bash
#
# compress_backups.sh
# Compress old backups to save space
# Uses efficient compression algorithms
#

BACKUP_DIR="project_backups"
DAYS_BEFORE_COMPRESS=1  # Compress backups older than 1 day
COMPRESSION="zstd"  # zstd (fastest), xz (best compression), or gz (compatible)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     BACKUP COMPRESSION UTILITY                             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}No backup directory found${NC}"
    exit 0
fi

# Check available compression tools
if command -v zstd &> /dev/null; then
    COMPRESSION="zstd"
    COMP_CMD="zstd -19 --rm"
    EXT=".tar.zst"
elif command -v xz &> /dev/null; then
    COMPRESSION="xz"
    COMP_CMD="xz -9 --rm"
    EXT=".tar.xz"
else
    COMPRESSION="gzip"
    COMP_CMD="gzip -9"
    EXT=".tar.gz"
fi

echo -e "${GREEN}Using compression:${NC} $COMPRESSION"
echo ""

CUTOFF_DATE=$(date -d "$DAYS_BEFORE_COMPRESS days ago" +%s 2>/dev/null || date -v-${DAYS_BEFORE_COMPRESS}d +%s)
TOTAL_SAVED=0
COMPRESSED_COUNT=0

for dir in "$BACKUP_DIR"/backup_*/; do
    [ -d "$dir" ] || continue
    
    DIR_TIME=$(stat -c %Y "$dir" 2>/dev/null || stat -f %m "$dir" 2>/dev/null)
    
    if [ $DIR_TIME -lt $CUTOFF_DATE ]; then
        ARCHIVE="${dir%/}.tar"
        COMPRESSED="${ARCHIVE}${EXT}"
        
        if [ ! -f "$COMPRESSED" ]; then
            echo -e "${BLUE}Compressing:${NC} $(basename "$dir")"
            
            ORIGINAL_SIZE=$(du -sb "$dir" | cut -f1)
            
            # Create tar archive
            tar -cf "$ARCHIVE" -C "$BACKUP_DIR" "$(basename "$dir")" 2>/dev/null
            
            # Compress
            if [ "$COMPRESSION" = "zstd" ]; then
                zstd -19 --rm "$ARCHIVE" -o "$COMPRESSED" 2>/dev/null
            elif [ "$COMPRESSION" = "xz" ]; then
                xz -9 "$ARCHIVE" 2>/dev/null
            else
                gzip -9 "$ARCHIVE" 2>/dev/null
            fi
            
            if [ -f "$COMPRESSED" ]; then
                COMPRESSED_SIZE=$(stat -c %s "$COMPRESSED" 2>/dev/null || stat -f %z "$COMPRESSED")
                SAVED=$((ORIGINAL_SIZE - COMPRESSED_SIZE))
                TOTAL_SAVED=$((TOTAL_SAVED + SAVED))
                RATIO=$(echo "scale=1; $COMPRESSED_SIZE * 100 / $ORIGINAL_SIZE" | bc)
                
                echo -e "${GREEN}✓ Compressed to ${RATIO}% of original size (saved $(numfmt --to=iec $SAVED 2>/dev/null || echo "$SAVED bytes"))${NC}"
                
                # Remove original directory
                rm -rf "$dir"
                ((COMPRESSED_COUNT++))
            fi
        fi
    fi
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     COMPRESSION COMPLETE                                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Compressed:${NC} $COMPRESSED_COUNT backup(s)"
echo -e "${GREEN}Space saved:${NC} $(numfmt --to=iec $TOTAL_SAVED 2>/dev/null || echo "$TOTAL_SAVED bytes")"
echo ""

# Show backup directory size
echo -e "${BLUE}Current backup directory size:${NC}"
du -sh "$BACKUP_DIR"

