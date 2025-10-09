# Makefile for Auto-Backup System

CC = gcc
CFLAGS = -Wall -Wextra -O2 -std=c11
CFLAGS_OPT = -Wall -O3 -march=native -std=c11
TARGET = auto_backup
TARGET_OPT = auto_backup_optimized
SOURCE = auto_backup.c
SOURCE_OPT = auto_backup_optimized.c

.PHONY: all clean install backup help optimized setup-startup compress

all: $(TARGET) $(TARGET_OPT)
	@chmod +x *.sh 2>/dev/null || true
	@echo "✓ Build complete!"
	@echo "  Standard:  ./$(TARGET)"
	@echo "  Optimized: ./$(TARGET_OPT)"

$(TARGET): $(SOURCE)
	$(CC) $(CFLAGS) -o $(TARGET) $(SOURCE)

$(TARGET_OPT): $(SOURCE_OPT)
	$(CC) $(CFLAGS_OPT) -o $(TARGET_OPT) $(SOURCE_OPT)

optimized: $(TARGET_OPT)
	@echo "✓ Optimized build complete!"

clean:
	rm -f $(TARGET) $(TARGET_OPT)
	@echo "✓ Cleaned build artifacts"

install: $(TARGET)
	@echo "Installing $(TARGET) to /usr/local/bin (requires sudo)..."
	sudo cp $(TARGET) /usr/local/bin/
	sudo chmod +x /usr/local/bin/$(TARGET)
	@echo "✓ Installation complete!"

setup-startup: $(TARGET_OPT)
	@echo "Setting up automatic startup..."
	@chmod +x install_startup.sh
	@./install_startup.sh

backup: $(TARGET_OPT)
	./$(TARGET_OPT) -q

compress:
	@chmod +x compress_backups.sh
	@./compress_backups.sh

help:
	@echo "Auto-Backup System - Makefile Commands"
	@echo "══════════════════════════════════════"
	@echo ""
	@echo "  make                - Build both versions"
	@echo "  make optimized      - Build optimized version only"
	@echo "  make clean          - Remove built executables"
	@echo "  make install        - Install to /usr/local/bin (requires sudo)"
	@echo "  make setup-startup  - Configure auto-start on system boot"
	@echo "  make backup         - Run an optimized backup"
	@echo "  make compress       - Compress old backups to save space"
	@echo "  make help           - Show this help message"
	@echo ""
	@echo "Optimizations:"
	@echo "  • Memory-mapped I/O for large files (>10MB)"
	@echo "  • Chunked copying for smaller files (1MB chunks)"
	@echo "  • Smart exclusions (node_modules, .git, etc.)"
	@echo "  • Resource limits (256MB RAM, 20% CPU max)"
	@echo "  • Compression support (zstd/xz/gzip)"
	@echo ""
	@echo "Usage:"
	@echo "  ./auto_backup_optimized -q         - Quiet mode backup"
	@echo "  ./auto_backup_optimized -s         - Silent mode (no output)"
	@echo "  ./auto_backup_daemon.sh            - Start background daemon"
	@echo "  ./stop_backup_daemon.sh            - Stop background daemon"

