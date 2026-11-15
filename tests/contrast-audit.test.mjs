import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {auditTheme,contrastRatio} from '../scripts/check-contrast.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('WCAG relative luminance and contrast ratio use sRGB linearization',()=>{
  assert.equal(contrastRatio('#000','#fff'),21);
  assert.ok(contrastRatio('#626b7d','#f6f7fc')>=4.5);
  assert.ok(contrastRatio('#2458c7','#eaf0ff')>=4.5);
  assert.ok(contrastRatio('#8a91a3','#f6f7fc')<4.5);
});

test('base, authenticated and soft messenger text tokens meet WCAG AA on their actual surfaces',()=>{
  const result=auditTheme(read('app/globals.css'),read('app/light-telegram-theme.css'));
  assert.equal(result.failures.length,0,result.failures.map(item=>item.label+': '+item.ratio.toFixed(2)+':1').join('\n'));
  assert.ok(result.checks.length>=40,'the audit must cover all three active palettes');
});

test('the contrast audit remains wired into the package and GitHub Actions',()=>{
  const pkg=JSON.parse(read('package.json'));
  const workflow=read('.github/workflows/check.yml');
  assert.equal(pkg.scripts.contrast,'node scripts/check-contrast.mjs');
  assert.match(pkg.scripts.check,/npm run contrast/);
  assert.match(workflow,/npm run contrast/);
});
