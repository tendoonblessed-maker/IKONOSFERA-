// Dependency-free policy lint for stage 0, not a replacement for ESLint.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const codeDirs = ['app', 'components', 'lib'];
const files = [];
function collect(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (/\.(tsx?|css)$/.test(entry.name)) files.push(path);
  }
}
for (const dir of codeDirs) collect(join(root, dir));
const failures = [];
for (const filename of files) {
  const text = readFileSync(filename, 'utf8');
  const relative = filename.slice(root.length + 1);
  if (/\b(?:NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY)\b/.test(text)) failures.push(`${relative}: don't expose secrets`);
  if (/\b(?:eval|document\.write)\s*\(/.test(text)) failures.push(`${relative}: unsafe dynamic code`);
  if (filename.endsWith('.tsx') && /style=\{\{[^}]*?(?:color|background)\s*:/.test(text)) failures.push(`${relative}: inline color; use tokens`);
}
if (failures.length) {
  for (const item of failures) console.error(item);
  process.exitCode = 1;
} else console.log(`Policy lint passed (${files.length} files). Note: ESLint is not installed.`);
