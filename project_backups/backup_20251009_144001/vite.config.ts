/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* eslint-disable import/no-extraneous-dependencies */

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // load plain keys too
  const port = Number(env.PORT) || 3001;
  const allowed =
    env.ALLOWED_HOSTS?.split(',').map(s => s.trim()).filter(Boolean) ?? true; // true = allow all in Vite 7
  const hmr = {
    host: env.HMR_HOST || undefined,          // e.g. your-subdomain.ngrok-free.app
    clientPort: env.HMR_CLIENT_PORT ? Number(env.HMR_CLIENT_PORT) : undefined, // 443 for HTTPS tunnels
    protocol: env.HMR_PROTOCOL || undefined,  // 'wss' for HTTPS tunnels
  };

  return {
    build: {
        outDir: 'build',
        target: 'esnext',
        rollupOptions: {
            external: []
        }
    },
    server: {
        host: true,
        port,
        allowedHosts: allowed,
        hmr,                 // ← stop forcing port; let env drive it
        watch: { usePolling: env.USE_POLLING === '1' },
    },
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src'),
        },
    },
    optimizeDeps: {
        include: ['@mui/material/Tooltip'],
    },
    plugins: [
        react(),
        viteTsconfigPaths(),
        nodePolyfills({
            include: ['assert'],
        }),
    ],
  };
});
