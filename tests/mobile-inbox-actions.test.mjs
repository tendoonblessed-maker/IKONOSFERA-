import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('larger inbox actions are restricted to coarse-pointer devices',()=>{
 const css=source('app/mobile-inbox-actions.css');
 assert.match(css,/^@media \(pointer: coarse\)\s*\{/m);
 assert.match(css,/\.messenger\.is-authenticated \.chat-list \.ik-chat-row-trigger/);
 assert.doesNotMatch(css,/\.group-chat-row|\.conversation-header|\.chat-message-tools/);
});

test('the chat action button has a 44 by 44 pixel touch target',()=>{
 const css=source('app/mobile-inbox-actions.css');
 assert.match(css,/\.ik-chat-row-trigger\s*\{[^}]*width:\s*44px\s*!important/s);
 assert.match(css,/\.ik-chat-row-trigger\s*\{[^}]*height:\s*44px\s*!important/s);
 assert.match(css,/\.ik-chat-row-trigger\s*\{[^}]*min-width:\s*44px\s*!important/s);
 assert.match(css,/\.ik-chat-row-trigger\s*\{[^}]*min-height:\s*44px\s*!important/s);
 assert.match(css,/touch-action:\s*manipulation/);
});

test('the touch menu remains visible and reserves its hit-area width',()=>{
 const css=source('app/mobile-inbox-actions.css');
 assert.match(css,/\.ik-chat-row-menu\s*\{[^}]*flex:\s*0 0 44px\s*!important/s);
 assert.match(css,/\.ik-chat-row-menu\s*\{[^}]*opacity:\s*1\s*!important/s);
});

test('touch overrides load after the light theme and keep accessible button semantics',()=>{
 const layout=source('app/layout.tsx');
 assert.ok(layout.indexOf('import "./mobile-inbox-actions.css"')>layout.indexOf('import "./light-telegram-theme.css"'));
 const menu=source('components/FloatingActionMenu.tsx');
 const inbox=source('components/ChatInboxRow.tsx');
 assert.match(menu,/<button type="button"/);
 assert.match(menu,/'aria-label':label/);
 assert.match(inbox,/triggerClassName="ik-chat-row-trigger"/);
});
