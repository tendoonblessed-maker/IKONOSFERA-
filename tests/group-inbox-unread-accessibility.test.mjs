import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('direct and group inbox rows use the shared unread badge formatter',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/formatUnreadBadge\(preview\?\.unread_count\)/);
 assert.match(group,/formatUnreadBadge\(overview\?\.unread_count\)/);
 assert.match(direct,/aria-describedby=\{unreadDescriptionId\}/);
 assert.match(group,/aria-describedby=\{unreadDescriptionId\}/);
 assert.match(direct,/\{unreadBadge\.visible\}/);
 assert.match(group,/\{unreadBadge\.visible\}/);
});

test('direct and group rows expose full unread counts through described text',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/id=\{unreadDescriptionId\} className="ik-visually-hidden">\{unreadBadge\.ariaLabel\}/);
 assert.match(group,/id=\{unreadDescriptionId\} className="ik-visually-hidden">\{unreadBadge\.ariaLabel\}/);
 assert.match(direct,/className="ik-unread-count" aria-hidden="true"/);
 assert.match(group,/className="ik-unread-count" aria-hidden="true"/);
});

test('direct and group inbox rows preserve the exact accessible count when visual text is capped',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/\{unreadBadge\.visible\}/);
 assert.match(group,/\{unreadBadge\.visible\}/);
});

test('unread descriptions use stable per-conversation identifiers',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/`direct-unread-\$\{chat\.id\}`/);
 assert.match(group,/`group-unread-\$\{group\.id\}`/);
});
