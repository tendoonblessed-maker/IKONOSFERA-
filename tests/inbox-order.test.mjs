import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {compareInboxActivityDescending} from '../lib/inbox-order.ts';

const item=(conversationId,timestamp)=>({conversationId,timestamp});
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('newer PostgreSQL microseconds sort ahead within the same millisecond',()=>{
  const newer=item('b','2026-11-16T12:00:00.123456Z');
  const older=item('a','2026-11-16T12:00:00.123455Z');
  assert.ok(compareInboxActivityDescending(newer,older)<0);
  assert.ok(compareInboxActivityDescending(older,newer)>0);
});

test('millisecond precision remains primary and timezone offsets compare as the same instant',()=>{
  assert.ok(compareInboxActivityDescending(
    item('a','2026-11-16T12:00:00.124000Z'),
    item('b','2026-11-16T12:00:00.123999Z')
  )<0);
  assert.ok(compareInboxActivityDescending(
    item('a','2026-11-16T14:00:00.123456+02:00'),
    item('b','2026-11-16T12:00:00.123457Z')
  )>0);
});

test('equivalent timestamp precision uses a deterministic conversation ID tie-breaker',()=>{
  assert.ok(compareInboxActivityDescending(
    item('a','2026-11-16T12:00:00.1234Z'),
    item('b','2026-11-16T12:00:00.123400Z')
  )<0);
  assert.equal(compareInboxActivityDescending(
    item('ABC','2026-11-16T12:00:00Z'),
    item('abc','2026-11-16T12:00:00Z')
  ),0);
});

test('valid timestamps sort ahead of malformed values and malformed ties remain stable',()=>{
  assert.ok(compareInboxActivityDescending(
    item('valid','2026-11-16T12:00:00Z'),
    item('invalid','not-a-timestamp')
  )<0);
  assert.ok(compareInboxActivityDescending(
    item('a','not-a-timestamp'),
    item('b','also-invalid')
  )<0);
});

test('both inbox refresh paths use precise activity ordering after pinned priority',()=>{
  const shell=source('components/AppShell.tsx');
  assert.equal((shell.match(/return compareInboxActivityDescending\(/g)||[]).length,3);
  assert.equal((shell.match(/if\(pinned\)return pinned;\s*return compareInboxActivityDescending/g)||[]).length,2);
  assert.equal((shell.match(/timestamp:overview\.get\([ab]\.id\)\?\.last_created_at\|\|[ab]\.created_at/g)||[]).length,4);
  assert.doesNotMatch(shell,/Date\.parse\(overview\.get\(/);
});
test('combined inbox orders group activity by microseconds alongside direct chats',()=>{
  const newerGroup=item('group-new','2026-11-16T12:00:00.123456Z');
  const olderDirect=item('direct-old','2026-11-16T12:00:00.123455Z');
  assert.ok(compareInboxActivityDescending(newerGroup,olderDirect)<0);

  const shell=source('components/AppShell.tsx');
  const inbox=shell.slice(shell.indexOf('const inboxItems=['),shell.indexOf('const activeChatLoading='));
  assert.match(inbox,/conversationId:group\.id/);
  assert.match(inbox,/timestamp:groupOverviews\[group\.id\]\?\.last_created_at\|\|group\.created_at/);
  assert.match(inbox,/return compareInboxActivityDescending\(a,b\)/);
  assert.match(inbox,/const pinned=Number\(b\.pinned\)-Number\(a\.pinned\);\s*if\(pinned\)return pinned/);
  assert.doesNotMatch(inbox,/Date\.parse/);
});
