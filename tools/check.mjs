// Checks the rules in CLAUDE.md that a test can't: node tools/check.mjs   (run after the build)
// - the built main.js has no network, eval, shell, notifications or HTML strings
// - only src/add-term.js writes notes (the glossary, when you add a term)
// - every src/*.js file is in tools/files.json, and no file is too long
// - nothing that only works on desktop (Node or Electron modules), now that it runs on mobile too
import fs from 'node:fs';

const o = JSON.parse(fs.readFileSync('tools/files.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync(o.manifest, 'utf8'));
const problems = [];
const warn = [];

const main = `dist/${manifest.id}/main.js`;
if (!fs.existsSync(main)) problems.push(`${main} missing: run node tools/build.mjs first`);
else {
  const code = fs.readFileSync(main, 'utf8');
  const banned = [
    [/\bfetch\s*\(|XMLHttpRequest|\brequestUrl\b|\bWebSocket\b/, 'network access'],
    [/\beval\s*\(|new Function\s*\(/, 'eval'],
    [/child_process|require\(['"](fs|path|os|electron)['"]\)/, 'shell or file system access'],
    [/new Notification\b/, 'system notification'],
    [/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/, 'HTML strings'],
  ];
  for (const [re, what] of banned) if (re.test(code)) problems.push(`main.js: ${what} (${code.match(re)[0]})`);
}

const WRITES = /\b(vault\.(modify|create|createFolder|delete|trash|rename|append|process|copy)|fileManager\.)/;
const MAY_WRITE = new Set(['src/add-term.js']);
for (const f of o.js) {
  const m = fs.readFileSync(f, 'utf8').match(WRITES);
  if (m && !MAY_WRITE.has(f)) problems.push(`${f}: writes to notes (${m[0]}); only ${[...MAY_WRITE].join(', ')} may`);
}

const listed = new Set([o.header, ...o.js]);
for (const f of fs.readdirSync('src').filter((n) => n.endsWith('.js')).map((n) => `src/${n}`)) {
  if (!listed.has(f)) problems.push(`${f} is not in tools/files.json`);
  const lines = fs.readFileSync(f, 'utf8').split('\n').length;
  if (lines > 500) problems.push(`${f}: ${lines} lines (cap 500)`);
  else if (lines > 400) warn.push(`${f}: ${lines} lines (target 400)`);
}
if (manifest.isDesktopOnly !== false) problems.push('manifest: isDesktopOnly must be false (it runs on mobile)');

for (const w of warn) console.log(`warning: ${w}`);
for (const p of problems) console.log(`problem: ${p}`);
console.log(problems.length ? `${problems.length} problem(s)` : 'check passed');
process.exit(problems.length ? 1 : 0);
