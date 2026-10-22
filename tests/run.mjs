// node tests/run.mjs — runs every node test in tests/core, one process each
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync(new URL('./core/', import.meta.url)).filter(f => f.endsWith('.test.mjs')).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [new URL('./core/' + f, import.meta.url).pathname], { encoding: 'utf8' });
  const last = (r.stdout.trim().split('\n').pop() || '') + (r.status ? '\n' + r.stdout.split('\n').filter(l => l.startsWith('FAIL')).slice(0, 20).join('\n') + r.stderr.slice(-2000) : '');
  console.log((r.status ? 'FAIL ' : 'ok   ') + f + '  ' + last);
  if (r.status) failed++;
}
console.log(failed ? failed + ' test files failed' : 'all ' + files.length + ' test files pass');
process.exit(failed ? 1 : 0);
