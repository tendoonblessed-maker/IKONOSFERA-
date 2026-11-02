import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {messageEditShortcut} from '../lib/message-edit-shortcuts.ts';

const key=(name,changes={})=>({
 key:name,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,
 repeat:false,isComposing:false,...changes
});

test('Escape cancels editing only when no IME composition is active',()=>{
 assert.equal(messageEditShortcut(key('Escape'),false),'cancel');
 assert.equal(messageEditShortcut(key('Escape',{isComposing:true}),false),null);
 assert.equal(messageEditShortcut(key('Escape',{keyCode:229}),false),null);
 assert.equal(messageEditShortcut(key('Escape',{repeat:true}),false),null);
 assert.equal(messageEditShortcut(key('Escape',{altKey:true}),false),null);
});

test('Ctrl/Cmd+Enter saves, but not repeated, composing or modified keystrokes',()=>{
 assert.equal(messageEditShortcut(key('Enter',{ctrlKey:true}),false),'save');
 assert.equal(messageEditShortcut(key('Enter',{metaKey:true}),false),'save');
 assert.equal(messageEditShortcut(key('Enter'),false),null);
 assert.equal(messageEditShortcut(key('Enter',{ctrlKey:true,repeat:true}),false),null);
 assert.equal(messageEditShortcut(key('Enter',{metaKey:true,isComposing:true}),false),null);
 assert.equal(messageEditShortcut(key('Enter',{ctrlKey:true,keyCode:229}),false),null);
 assert.equal(messageEditShortcut(key('Enter',{ctrlKey:true,shiftKey:true}),false),null);
 assert.equal(messageEditShortcut(key('Enter',{metaKey:true,altKey:true}),false),null);
});

test('no keyboard shortcut cancels or saves while an edit is in flight',()=>{
 assert.equal(messageEditShortcut(key('Escape'),true),null);
 assert.equal(messageEditShortcut(key('Enter',{ctrlKey:true}),true),null);
});

test('message editor uses synchronous submit guard and safe keyboard shortcut',()=>{
 const ui=readFileSync(new URL('../components/MessageEditForm.tsx',import.meta.url),'utf8');
 assert.match(ui,/import \{messageEditShortcut\} from '@\/lib\/message-edit-shortcuts'/);
 assert.match(ui,/if\(savingRef\.current\|\|!value\.trim\(\)\|\|value\.length>4000\)return/);
 assert.match(ui,/savingRef\.current=true/);
 assert.match(ui,/finally\{savingRef\.current=false;setSaving\(false\);\}/);
 assert.match(ui,/messageEditShortcut\(\{/);
 assert.match(ui,/event\.nativeEvent\.isComposing\|\|event\.nativeEvent\.keyCode===229/);
 assert.match(ui,/if\(shortcut==='cancel'\)/);
 assert.match(ui,/if\(shortcut==='save'&&value\.trim\(\)&&value\.length<=4000\)/);
 assert.match(ui,/event\.currentTarget\.form\?\.requestSubmit\(\)/);
});
