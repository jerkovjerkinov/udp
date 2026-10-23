// Every page is an entry: the hub (index.html) and one index.html per game.
// base './' keeps every URL relative, so dist/ works from any static server.
import { defineConfig } from 'vite';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const games = existsSync('games') ? readdirSync('games').filter(g => existsSync(`games/${g}/index.html`)) : [];
const input = { hub: resolve('index.html') };
for (const g of games) input[g] = resolve(`games/${g}/index.html`);

// the build id: the commit, plus the time so an uncommitted build differs too
let commit = 'local';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* not a repo */ }
const build = commit + '-' + Date.now().toString(36);
const version = {
  name: 'udp-version',
  apply: 'build',
  writeBundle(o) { writeFileSync(resolve(o.dir, 'version.json'), JSON.stringify({ build, commit })); },
};

export default defineConfig({
  base: './',
  define: { __UDP_BUILD__: JSON.stringify(build) },
  plugins: [version],
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input } },
  server: { port: 5173 },
});
