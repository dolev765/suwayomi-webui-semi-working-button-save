#!/bin/bash
set -e

echo "=== Yarn Recovery Script ==="
echo ""

# Step 1: Stop any rsync processes
echo "[1/5] Stopping any background processes..."
pkill -9 rsync 2>/dev/null || true
pkill -9 cp 2>/dev/null || true
sleep 3

# Step 2: Clean up current installation
echo "[2/5] Cleaning up current installation..."
rm -rf node_modules
rm -f package-lock.json

# Step 3: Restore package.json from backup
echo "[3/5] Restoring package.json from backup..."
cp "/mnt/c/webui backup/webui/package.json" package.json

# Step 4: Copy node_modules from backup (this may take a few minutes)
echo "[4/5] Copying node_modules from backup (this will take a few minutes)..."
cp -r "/mnt/c/webui backup/webui/node_modules" .

# Step 5: Test the installation
echo "[5/5] Testing the installation..."
echo ""
echo "=== Recovery Complete! ==="
echo ""
echo "Testing npm..."
npm --version
echo ""
echo "Testing if vite is available..."
./node_modules/.bin/vite --version
echo ""
echo "You can now run: npm run dev"
echo "Or directly: ./node_modules/.bin/vite"

