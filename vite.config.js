// Every page is an entry: the hub (index.html) and one index.html per game.
// base './' keeps every URL relative, so dist/ works from any static server.
import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const games = existsSync('games') ? readdirSync('games').filter(g => existsSync(`games/${g}/index.html`)) : [];
const input = { hub: resolve('index.html') };
for (const g of games) input[g] = resolve(`games/${g}/index.html`);

export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input } },
  server: { port: 5173 },
});
