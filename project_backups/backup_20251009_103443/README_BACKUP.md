# Auto-Backup System for Project

A comprehensive, fast C-based backup system that creates timestamped backups of your project whenever changes are detected.

## Features

- ✅ **Automatic timestamped backups** - Each backup gets a unique timestamp (YYYYMMDD_HHMMSS)
- ✅ **Smart exclusions** - Automatically skips node_modules, .git, build directories, logs
- ✅ **Fast and efficient** - Written in C for maximum performance
- ✅ **Preserves file permissions** - Maintains original file attributes
- ✅ **Handles symlinks** - Preserves symbolic links correctly
- ✅ **Metadata tracking** - Creates backup_info.txt in each backup with details
- ✅ **Optional messages** - Add descriptions to your backups

## Quick Start

### 1. Build the backup program

```bash
make
```

Or compile manually:
```bash
gcc -Wall -Wextra -O2 -std=c11 -o auto_backup auto_backup.c
```

### 2. Run a backup

```bash
./auto_backup
```

## Usage

### Basic backup
```bash
./auto_backup
```

### Backup with a message
```bash
./auto_backup -m "Before major refactoring"
```

### Use custom backup directory
```bash
./auto_backup -d /path/to/backups
```

### Show help
```bash
./auto_backup -h
```

## Integration with Change Detection Scripts

If you have a script that auto-detects changes and runs a command when changes occur, use:

```bash
./auto_backup
```

Or with a message indicating what changed:

```bash
./auto_backup -m "Auto-backup: files modified"
```

### Example with inotifywait (Linux)

```bash
#!/bin/bash
# watch_and_backup.sh

while inotifywait -r -e modify,create,delete,move --exclude '(node_modules|\.git|project_backups)' .; do
    echo "Changes detected, creating backup..."
    ./auto_backup -m "Auto-backup on file change"
    echo "Backup complete. Waiting for next change..."
done
```

### Example with fswatch (Linux/Mac)

```bash
#!/bin/bash
# fswatch_backup.sh

fswatch -r --exclude='node_modules|\.git|project_backups' . | while read file; do
    echo "Change detected: $file"
    ./auto_backup -m "Auto-backup: $file changed"
    sleep 5  # Debounce: wait 5 seconds to batch multiple changes
done
```

### Example with Windows (PowerShell)

```powershell
# watch_and_backup.ps1

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = "."
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

$action = {
    Write-Host "Changes detected, creating backup..."
    wsl ./auto_backup -m "Auto-backup on file change"
}

Register-ObjectEvent $watcher "Changed" -Action $action
Register-ObjectEvent $watcher "Created" -Action $action
Register-ObjectEvent $watcher "Deleted" -Action $action

while ($true) { Start-Sleep 1 }
```

## Backup Structure

Backups are organized as follows:

```
project_backups/
├── backup_20251003_143022/
│   ├── backup_info.txt       # Metadata about this backup
│   ├── src/                   # Your project files
│   ├── package.json
│   └── ...
├── backup_20251003_150115/
│   ├── backup_info.txt
│   └── ...
└── backup_20251003_163045/
    └── ...
```

## Excluded Patterns

The following directories and files are automatically excluded from backups:

- `node_modules/` - Node.js dependencies
- `project_backups/` - Prevents recursive backup of backups
- `.git/` - Git repository data
- `buildZip/` - Build artifacts
- `.cache/` - Cache directories
- `dist/` - Distribution builds
- `build/` - Build outputs
- `.vscode/` - Editor settings
- `.idea/` - IDE settings
- `*.tmp` - Temporary files
- `*.log` - Log files
- `__pycache__/` - Python cache
- `.pytest_cache/` - Pytest cache

## Makefile Commands

```bash
make              # Build the program
make clean        # Remove built executable
make install      # Install to /usr/local/bin (requires sudo)
make backup       # Build and run a backup
make help         # Show help
```

## Advanced Usage

### Scheduled Backups with Cron

Add to your crontab (`crontab -e`):

```bash
# Backup every hour
0 * * * * cd /mnt/c/webui && ./auto_backup -m "Hourly auto-backup"

# Backup every 30 minutes
*/30 * * * * cd /mnt/c/webui && ./auto_backup -m "30-min auto-backup"

# Backup at 2 AM daily
0 2 * * * cd /mnt/c/webui && ./auto_backup -m "Daily backup"
```

### Cleanup Old Backups

Keep only the last 10 backups:

```bash
#!/bin/bash
# cleanup_old_backups.sh

cd project_backups
ls -t | tail -n +11 | xargs -r rm -rf
echo "Cleaned up old backups, keeping the 10 most recent"
```

### Compress Backups to Save Space

```bash
#!/bin/bash
# compress_backups.sh

for dir in project_backups/backup_*/; do
    if [ ! -f "${dir}.tar.gz" ]; then
        tar -czf "${dir}.tar.gz" -C "$(dirname "$dir")" "$(basename "$dir")"
        rm -rf "$dir"
        echo "Compressed: $dir"
    fi
done
```

## Troubleshooting

### Permission denied errors

Make sure the executable has proper permissions:
```bash
chmod +x auto_backup
```

### Cannot create backup directory

Check disk space:
```bash
df -h .
```

### Backup is too large

Consider adding more exclusion patterns in `auto_backup.c` or use compression.

## Command to Use with Your Change Detection Script

**Recommended command (optimized version):**

```bash
./auto_backup_optimized -q
```

Or with auto-generated timestamp message:

```bash
./auto_backup_optimized -m "Auto-backup: $(date '+%Y-%m-%d %H:%M:%S')"
```

**Silent mode (no output, for background daemons):**

```bash
./auto_backup_optimized -s
```

This will create a new timestamped folder for each file change detected!

## Auto-Start on System Boot

To make the backup daemon run automatically on startup:

```bash
make setup-startup
```

This will:
- Build the optimized version
- Configure auto-start for your system (WSL/SystemD/cron)
- Set resource limits (256MB RAM, 20% CPU max)
- Start the daemon in the background

### Manual Daemon Control

```bash
# Start daemon
./auto_backup_daemon.sh

# Stop daemon
./stop_backup_daemon.sh

# Check if running
ps aux | grep backup_daemon

# View log
tail -f .backup_daemon.log
```

## Optimizations

See [OPTIMIZATIONS.md](OPTIMIZATIONS.md) for detailed information about:
- Memory efficiency (mmap for large files, chunked I/O)
- Space savings (compression, smart exclusions)
- CPU optimization (O3, march=native, idle priority)
- Resource limits (256MB RAM, 20% CPU max)

## License

This backup system is provided as-is for use with your project.

