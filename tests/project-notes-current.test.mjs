import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const load=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const notes=load('PROJECT_NOTES.md');

test('current project notes describe the active messenger rather than stage-0 prototype',()=>{
 assert.match(notes,/Обновлено: \*\*2026-11-19\*\*/);
 assert.match(notes,/классического мессенджера/);
 assert.match(notes,/Next\.js 16/);
 assert.match(notes,/Supabase Auth, PostgREST и Storage/);
 assert.match(notes,/https:\/\/ikonosfera\.vercel\.app/);
 assert.doesNotMatch(notes,/Стадия: \*\*этап 0/);
 assert.doesNotMatch(notes,/доступной организации пока \*\*0 проектов/);
 assert.doesNotMatch(notes,/\*\*Нет таблиц и RLS\*\*/);
});

test('historical stage-0 notes remain preserved and clearly marked as archived',()=>{
 const archive=load('docs/archive/PROJECT_NOTES_STAGE0_2026-10-28.md');
 assert.match(archive,/Стадия: \*\*этап 0/);
 assert.match(archive,/Обновлено: 2026-10-28/);
 assert.match(notes,/docs\/archive\/PROJECT_NOTES_STAGE0_2026-10-28\.md/);
});

test('project notes retain release and security guardrails',()=>{
 assert.match(notes,/PR #62/);
 assert.match(notes,/Не вливать/);
 assert.match(notes,/Не выполнять SQL/);
 assert.match(notes,/E2EE/);
 assert.match(notes,/реальные пользовательские данные/);
});
