import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'work', 'outputs', 'materials'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else files.push(target);
  }
}
walk(root);
for (const file of files) {
  const relative = path.relative(root, file);
  if (!/\.(html|css|js|mjs|md)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('\ufffd')) failures.push(`${relative}: replacement character`);
  if (/[^\S\r\n]+$/m.test(text)) failures.push(`${relative}: trailing whitespace`);
  if (file.endsWith('.js')) {
    try { new vm.Script(text, { filename: relative }); }
    catch (error) { failures.push(error.message); }
  }
  if (file.endsWith('.html')) {
    if (!/<html lang="zh-CN">/.test(text) || !/<meta charset="utf-8">/.test(text)) failures.push(`${relative}: missing language/charset`);
    for (const match of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(?:#|[a-z]+:|\/\/)/i.test(match[1])) continue;
      const target = path.resolve(path.dirname(file), match[1].split(/[?#]/)[0]);
      if (!fs.existsSync(target)) failures.push(`${relative}: missing ${match[1]}`);
    }
  }
  if (file.endsWith('.css')) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
    let balance = 0;
    for (const char of clean) {
      if (char === '{') balance++;
      if (char === '}') balance--;
      if (balance < 0) break;
    }
    if (balance !== 0) failures.push(`${relative}: unbalanced CSS braces`);
    if (/(?:^|[;{\s])zoom\s*:|transform\s*:\s*scale\(/.test(clean)) failures.push(`${relative}: forbidden page scaling`);
  }
}
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/config.js'), 'utf8'), sandbox);
let routeCount = 0;
for (const [mode, config] of Object.entries(sandbox.window.FrozenApp.config)) {
  const ids = config.routes.map(route => route.id);
  routeCount += ids.length;
  if (new Set(ids).size !== ids.length) failures.push(`${mode}: duplicate routes`);
  for (const route of config.routes) {
    if (!/^[a-z-]+$/.test(route.id) || !route.title || !route.requirements.length) failures.push(`${mode}: invalid route metadata`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${files.length} files checked; ${routeCount} route definitions valid; JS syntax, HTML resource paths, UTF-8 replacement markers, whitespace and basic CSS checks passed.`);
  console.log('Static checks only. No browser, rendering, interaction or access-control verification.');
}
