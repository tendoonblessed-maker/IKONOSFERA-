import assert from 'node:assert/strict';
import {test} from 'node:test';
import {shouldCloseSearchOnEscape} from '../lib/search-keyboard.ts';

const key=(overrides={})=>({key:'Escape',isComposing:false,keyCode:27,...overrides});

test('Escape closes direct-message search when no IME composition is active',()=>{
  assert.equal(shouldCloseSearchOnEscape(key()),true);
});

test('Escape is left to the active IME composition or candidate picker',()=>{
  assert.equal(shouldCloseSearchOnEscape(key({isComposing:true})),false);
  assert.equal(shouldCloseSearchOnEscape(key({keyCode:229})),false);
});

test('other keys do not close direct-message search',()=>{
  assert.equal(shouldCloseSearchOnEscape(key({key:'Enter'})),false);
  assert.equal(shouldCloseSearchOnEscape(key({key:'Escape',isComposing:false,keyCode:0})),true);
});
