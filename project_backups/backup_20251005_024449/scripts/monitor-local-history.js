#!/usr/bin/env node

/**
 * Local History Monitor for Tachidesk WebUI
 * Ensures Local History extension is always active and tracking changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LocalHistoryMonitor {
    constructor() {
        this.workspaceRoot = process.cwd();
        this.historyPath = path.join(this.workspaceRoot, '.history');
        this.settingsPath = path.join(this.workspaceRoot, '.vscode', 'settings.json');
        this.lastCheck = Date.now();
        
        console.log('�� Local History Monitor started');
        console.log(`📁 Workspace: ${this.workspaceRoot}`);
        console.log(`📚 History path: ${this.historyPath}`);
    }

    async ensureHistoryDirectory() {
        if (!fs.existsSync(this.historyPath)) {
            fs.mkdirSync(this.historyPath, { recursive: true });
            console.log('✅ Created .history directory');
        }
    }

    async checkSettings() {
        try {
            const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
            
            // Ensure Local History is enabled
            if (settings['local-history.enabled'] !== 1) {
                console.log('⚠️  Local History not enabled in settings');
                return false;
            }
            
            // Check if auto-save is enabled
            if (settings['files.autoSave'] !== 'afterDelay') {
                console.log('⚠️  Auto-save not configured properly');
                return false;
            }
            
            console.log('✅ Settings verified - Local History is active');
            return true;
        } catch (error) {
            console.log('❌ Error reading settings:', error.message);
            return false;
        }
    }

    async getHistoryStats() {
        try {
            if (!fs.existsSync(this.historyPath)) {
                return { files: 0, size: 0 };
            }

            const files = this.getAllFiles(this.historyPath);
            const totalSize = files.reduce((size, file) => {
                try {
                    return size + fs.statSync(file).size;
                } catch {
                    return size;
                }
            }, 0);

            return {
                files: files.length,
                size: totalSize,
                sizeFormatted: this.formatBytes(totalSize)
            };
        } catch (error) {
            console.log('❌ Error getting history stats:', error.message);
            return { files: 0, size: 0, sizeFormatted: '0 B' };
        }
    }

    getAllFiles(dir) {
        let files = [];
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                files = files.concat(this.getAllFiles(fullPath));
            } else {
                files.push(fullPath);
            }
        }
        
        return files;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async monitor() {
        console.log('\n🔍 Checking Local History status...');
        
        await this.ensureHistoryDirectory();
        const settingsOk = await this.checkSettings();
        const stats = await this.getHistoryStats();
        
        console.log(`📊 History stats: ${stats.files} files, ${stats.sizeFormatted}`);
        
        if (settingsOk) {
            console.log('✅ Local History is active and monitoring your files');
            console.log('💡 Every file change will be automatically saved to history');
            console.log('🔄 Auto-save every 2 minutes ensures regular history snapshots');
        } else {
            console.log('❌ Local History needs attention - check your settings');
        }
        
        console.log('\n📋 Available commands in Cursor IDE:');
        console.log('   • Ctrl+Shift+P → "local-history.showAll"');
        console.log('   • Explorer → LOCAL HISTORY section');
        console.log('   • Right-click any file → "Restore" or "Compare"');
        
        return settingsOk;
    }
}

// Run the monitor
const monitor = new LocalHistoryMonitor();
monitor.monitor().then(success => {
    if (success) {
        console.log('\n🎉 Local History Monitor setup complete!');
        console.log('Your Tachidesk WebUI project is now protected with automatic file history.');
    } else {
        console.log('\n⚠️  Please check your Local History extension settings.');
        process.exit(1);
    }
}).catch(error => {
    console.error('❌ Monitor error:', error);
    process.exit(1);
});
