import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isAttachmentImeEvent} from '../lib/attachment-shortcuts.ts';

const ui=()=>readFileSync(new URL('../components/ChatAttachmentPreview.tsx',import.meta.url),'utf8');

test('composing Escape does not dismiss the attachment preview',()=>{
 assert.equal(isAttachmentImeEvent({isComposing:true,keyCode:27}),true);
 assert.equal(isAttachmentImeEvent({isComposing:false,keyCode:229}),true);
});

test('composing Ctrl/Cmd+Enter does not send the attachment',()=>{
 assert.equal(isAttachmentImeEvent({isComposing:true,keyCode:13}),true);
 assert.equal(isAttachmentImeEvent({isComposing:false,keyCode:229}),true);
});

test('ordinary Escape and Enter retain their keyboard shortcuts',()=>{
 assert.equal(isAttachmentImeEvent({isComposing:false,keyCode:27}),false);
 assert.equal(isAttachmentImeEvent({isComposing:false,keyCode:13}),false);
 assert.equal(isAttachmentImeEvent({isComposing:false}),false);
});

test('attachment keyboard handlers guard IME and repeated send shortcuts',()=>{
 const component=ui();
 assert.match(component,/import \{isAttachmentImeEvent\} from '@\/lib\/attachment-shortcuts'/);
 assert.match(component,/if\(event\.key==='Escape'&&!busyRef\.current\)\{\s*if\(isAttachmentImeEvent\(event\)\)return;/);
 assert.match(component,/if\(event\.repeat\|\|isAttachmentImeEvent\(event\.nativeEvent\)\)return;/);
 assert.match(component,/sendRef\.current\?\.click\(\)/);
 assert.match(component,/closeRef\.current\(\)/);
});
