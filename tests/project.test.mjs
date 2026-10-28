import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
const load=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('PWA supports Android and iPhone',()=>{const m=JSON.parse(load('public/manifest.webmanifest'));assert.equal(m.display,'standalone');assert.equal(m.start_url,'/');for(const i of m.icons) assert.ok(existsSync(new URL(`../public/${i.src.slice(1)}`,import.meta.url)));});
test('original specification preserved and pivot documented',()=>{assert.ok(load('docs/SPEC.md').includes('Мессенджер для людей'));assert.ok(load('PROJECT_NOTES.md').includes('мессенджера'));});
test('messages use authenticated backend; no fake chat data',()=>{assert.match(load('lib/supabase-rest.ts'),/\/rest\/v1\/messages\?select=/);assert.match(load('lib/supabase-rest.ts'),/Bearer/);assert.ok(!/mockMessages|fakeSend|seedMessages/.test(load('components/AppShell.tsx')));});
test('SQL restricts messages with RLS',()=>{const sql=load('supabase/migrations/20261028_120000_direct_messages.sql');for(const name of ['profiles','chats','chat_members','messages'])assert.ok(sql.includes(`alter table public.${name} enable row level security;`));assert.ok(sql.includes('public.is_chat_member(chat_id)'));assert.ok(!sql.includes('on public.messages for update'));});
test('service worker never caches private messages',()=>{const sw=load('public/sw.js');assert.match(sw,/request\.mode !== "navigate"/);assert.ok(!sw.includes('cache.put(request'));});
test('mobile safe area + reduced motion',()=>{const css=load('app/globals.css');assert.ok(css.includes('safe-area-inset-top'));assert.ok(css.includes('safe-area-inset-bottom'));assert.ok(css.includes('prefers-reduced-motion:reduce'));});

test('invite URL passes initial username into messenger UI',()=>{const route=load('app/u/[username]/page.tsx');const ui=load('components/AppShell.tsx');assert.ok(route.includes('initialUsername={username'));assert.ok(ui.includes('initialUsername?: string'));});
test('API permissions limit write actions',()=>{const sql=load('supabase/migrations/20261028_120000_direct_messages.sql');assert.ok(sql.includes('grant insert on public.messages to authenticated'));assert.ok(sql.includes('grant update (username, display_name) on public.profiles to authenticated'));assert.ok(!sql.includes('grant insert on public.chats to authenticated'));});
