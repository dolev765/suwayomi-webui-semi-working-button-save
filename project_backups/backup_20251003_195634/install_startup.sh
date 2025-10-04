#!/bin/bash
#
# install_startup.sh
# Install backup daemon to run on system startup
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="backup_daemon.service"
CURRENT_USER=$(whoami)

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     BACKUP DAEMON STARTUP INSTALLER                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if running on WSL
if grep -qi microsoft /proc/version; then
    echo "WSL detected. Installing WSL-specific startup method..."
    echo ""
    
    # Create a startup script for WSL
    STARTUP_SCRIPT="$HOME/.backup_startup.sh"
    cat > "$STARTUP_SCRIPT" << 'EOF'
#!/bin/bash
# Auto-generated backup daemon startup script
SCRIPT_DIR="/mnt/c/webui"
if [ -d "$SCRIPT_DIR" ]; then
    cd "$SCRIPT_DIR"
    ./auto_backup_daemon.sh
fi
EOF
    chmod +x "$STARTUP_SCRIPT"
    
    # Add to .bashrc if not already there
    if ! grep -q ".backup_startup.sh" "$HOME/.bashrc"; then
        echo "" >> "$HOME/.bashrc"
        echo "# Auto-start backup daemon" >> "$HOME/.bashrc"
        echo "[ -f ~/.backup_startup.sh ] && ~/.backup_startup.sh &" >> "$HOME/.bashrc"
        echo "✓ Added to ~/.bashrc"
    fi
    
    # For Windows, create a .bat file to start WSL with the daemon
    WINDOWS_STARTUP_BAT="/mnt/c/Users/$USER/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/backup_daemon.bat"
    mkdir -p "$(dirname "$WINDOWS_STARTUP_BAT")" 2>/dev/null
    
    cat > "$WINDOWS_STARTUP_BAT" << 'EOF'
@echo off
wsl -d Ubuntu -e bash -c "cd /mnt/c/webui && ./auto_backup_daemon.sh"
EOF
    
    echo "✓ Created Windows startup script"
    echo ""
    echo "Installation complete!"
    echo "The backup daemon will start automatically when you:"
    echo "  1. Open a new terminal/WSL session"
    echo "  2. Log into Windows (via startup script)"
    echo ""
    
elif [ -d "/etc/systemd/system" ]; then
    echo "SystemD detected. Installing as system service..."
    echo ""
    
    # Update service file with correct user and path
    sed "s|%i|$CURRENT_USER|g; s|/mnt/c/webui|$SCRIPT_DIR|g" "$SERVICE_FILE" | \
        sudo tee /etc/systemd/system/backup_daemon.service > /dev/null
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Enable and start service
    sudo systemctl enable backup_daemon.service
    sudo systemctl start backup_daemon.service
    
    echo "✓ Service installed and started"
    echo ""
    echo "Service commands:"
    echo "  Status:  sudo systemctl status backup_daemon"
    echo "  Stop:    sudo systemctl stop backup_daemon"
    echo "  Start:   sudo systemctl start backup_daemon"
    echo "  Disable: sudo systemctl disable backup_daemon"
    echo ""
    
else
    echo "Adding to crontab for startup..."
    echo ""
    
    # Add to crontab
    CRON_CMD="@reboot $SCRIPT_DIR/auto_backup_daemon.sh"
    
    if ! crontab -l 2>/dev/null | grep -q "$SCRIPT_DIR/auto_backup_daemon.sh"; then
        (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
        echo "✓ Added to crontab"
    else
        echo "✓ Already in crontab"
    fi
    
    echo ""
    echo "The daemon will start on next system boot"
    echo "To start now, run: ./auto_backup_daemon.sh"
    echo ""
fi

# Build the optimized version
echo "Building optimized backup program..."
cd "$SCRIPT_DIR"
gcc -Wall -O3 -march=native -o auto_backup_optimized auto_backup_optimized.c
chmod +x auto_backup_daemon.sh stop_backup_daemon.sh

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     INSTALLATION COMPLETE                                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "The backup daemon will now run automatically on startup!"
echo "It uses minimal resources (max 256MB RAM, 20% CPU)."

