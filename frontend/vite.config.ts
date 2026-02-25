import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        // MUST be first - provides Buffer, process, etc.
        nodePolyfills({
            globals: { Buffer: true, global: true, process: true },
        }),
        react(),
    ],
    resolve: {
        alias: {
            '@noble/hashes': resolve(__dirname, 'node_modules/@noble/hashes'),
        },
        dedupe: ['@noble/hashes', '@noble/curves', 'react', 'react-dom'],
    },
    build: {
        target: 'esnext',
        rollupOptions: {
            output: {
                manualChunks: (id: string) => {
                    if (id.includes('@noble/curves')) return 'noble-curves';
                    if (id.includes('@noble/hashes')) return 'noble-hashes';
                    if (id.includes('opnet') || id.includes('@btc-vision')) return 'opnet';
                    if (id.includes('react-router')) return 'router';
                    if (id.includes('react-dom')) return 'react-dom';
                },
            },
        },
    },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
