// -----------------------------------------------------------
//  [*] Vite configuration
//
//  Plugins:
//    - react       — JSX + fast refresh
//    - tailwindcss — Tailwind v4 (no tailwind.config file)
//
//  One entry: index.html → src/main.jsx, which starts the
//  console under /console and the public site everywhere
//  else (src/paths.js). Each is a chunk of its own, loaded
//  only when it starts; they share the chunks they have in
//  common (React, the router, the fonts, the stylesheet).
//
//  Also sets up:
//    - base / — the assets live at the root
//    - '@' → src alias
//    - dev server on 0.0.0.0:80 so the Docker dev container
//      (legalops-vite, Dockerfile.dev) is reachable through
//      the Caddy endpoint
//    - vendor chunks (review #17): the pages are lazy route
//      modules (router.jsx); the libraries they share are cut
//      into long-lived chunks by family (VENDOR_CHUNKS), so a
//      deploy that changes only app code leaves them cached,
//      and the chat's heavy AI stack loads with the chat only
//    - the vitest suite (tests/, see tests/README.md): jsdom,
//      the MSW backend double and the guards installed by
//      tests/support/setup.js
// -----------------------------------------------------------

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// chunk name → the node_modules package paths it collects
// (first match wins; anything unlisted stays with the code
// that imports it)
const VENDOR_CHUNKS = [
  ['vendor-react', /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)[\\/]/],
  ['vendor-datagrid', /[\\/]node_modules[\\/]@mui[\\/]x-[^\\/]+[\\/]/],
  ['vendor-mui', /[\\/]node_modules[\\/](@mui|@emotion|@popperjs|stylis|react-transition-group|react-is|prop-types|hoist-non-react-statics|clsx)[\\/]/],
  ['vendor-data', /[\\/]node_modules[\\/](@tanstack|axios|react-hot-toast|goober)[\\/]/],
  ['vendor-markdown', /[\\/]node_modules[\\/](react-markdown|remark-[^\\/]+|rehype-[^\\/]+|micromark[^\\/]*|mdast-[^\\/]+|hast-[^\\/]+|unist-[^\\/]+|unified|vfile[^\\/]*|devlop|property-information|space-separated-tokens|comma-separated-tokens|zwitch|ccount|markdown-table|longest-streak|decode-named-character-reference|character-entities[^\\/]*|trim-lines|html-url-attributes|bail|trough|is-plain-obj|estree-util-is-identifier-name|style-to-js|style-to-object|inline-style-parser|extend)[\\/]/],
  ['vendor-ai', /[\\/]node_modules[\\/](@assistant-ui|@ai-sdk|ai|zod|zustand|nanoid|@standard-schema|eventsource-parser|@radix-ui|use-sync-external-store|assistant-stream|secure-json-parse|json-schema)[\\/]/],
];







// -----------------------------------------------------------
// The config
// -----------------------------------------------------------

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 80,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          return VENDOR_CHUNKS.find(([, pattern]) => pattern.test(id))?.[0];
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['tests/support/setup.js'],
    // Stamps render in the process timezone; UTC everywhere
    // (a dev machine as well as the container) keeps the
    // expected strings fixed
    env: { TZ: 'UTC' },
    // MUI + DataGrid render slowly under jsdom; the contract
    // matrices mount a page many times per file
    testTimeout: 20000,
    hookTimeout: 20000,
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/console.jsx', 'src/messages/**'],
      reportsDirectory: 'coverage',
    },
  },
});
