import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldSubmitGroupComposerOnEnter} from '../lib/group-composer-keys.ts';

const key=(overrides={})=>({
 key:'Enter',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,
 nativeEvent:{isComposing:false,keyCode:13},...overrides
});

test('mobile and hybrid touch devices keep plain Enter as a newline',()=>{
 assert.equal(shouldSubmitGroupComposerOnEnter(key(),true),false);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({shiftKey:true}),true),false);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({ctrlKey:true}),true),true);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({metaKey:true}),true),true);
});

test('desktop keyboard keeps Enter to send and Shift+Enter for newline',()=>{
 assert.equal(shouldSubmitGroupComposerOnEnter(key(),false),true);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({shiftKey:true}),false),false);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({key:'a'}),false),false);
});

test('IME composition never sends, including Safari keyCode 229 fallback',()=>{
 assert.equal(shouldSubmitGroupComposerOnEnter(key({nativeEvent:{isComposing:true,keyCode:13}}),false),false);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({ctrlKey:true,nativeEvent:{isComposing:true}}),true),false);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({nativeEvent:{isComposing:false,keyCode:229}}),false),false);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({metaKey:true,nativeEvent:{keyCode:229}}),true),false);
});

test('Alt+Enter does not accidentally send',()=>{
 assert.equal(shouldSubmitGroupComposerOnEnter(key({altKey:true}),false),false);
 assert.equal(shouldSubmitGroupComposerOnEnter(key({altKey:true,ctrlKey:true}),false),false);
});

test('group composer uses the tested guard and recognizes touch-capable hybrid laptops',()=>{
 const panel=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/shouldSubmitGroupComposerOnEnter\(e,softKeyboard\)/);
 assert.match(panel,/any-pointer:coarse/);
 assert.match(panel,/iPhone\|iPad\|iPod\|Android/);
 assert.doesNotMatch(panel,/matchMedia\('\(pointer:fine\)'\)/);
});
