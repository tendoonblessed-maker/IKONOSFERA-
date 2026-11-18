import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('group unread badge announces what its number means to assistive technology',()=>{
 const group=load('components/GroupInboxRow.tsx');
 assert.match(group,/className="ik-unread-count" aria-label=\{'Непрочитанных: '\+unread\}/);
});

test('group unread badge keeps the exact count accessible while visually capping large totals',()=>{
 const group=load('components/GroupInboxRow.tsx');
 assert.match(group,/unread>0&&<span className="ik-unread-count" aria-label=\{'Непрочитанных: '\+unread\}>\{unread>99\?'99\+':unread\}<\/span>/);
});

test('direct and group inbox unread badges use the same descriptive label contract',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 const label=/aria-label=\{'Непрочитанных: '\+unread\}/;
 assert.match(direct,label);
 assert.match(group,label);
});
