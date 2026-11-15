import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {nextFloatingMenuIndex,nextFloatingMenuTypeaheadIndex} from '../lib/floating-menu-keyboard.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('vertical menu navigation wraps and starts from the first or last item',()=>{
  assert.equal(nextFloatingMenuIndex('ArrowDown',0,3),1);
  assert.equal(nextFloatingMenuIndex('ArrowDown',2,3),0);
  assert.equal(nextFloatingMenuIndex('ArrowDown',-1,3),0);
  assert.equal(nextFloatingMenuIndex('ArrowUp',0,3),2);
  assert.equal(nextFloatingMenuIndex('ArrowUp',-1,3),2);
});

test('Home and End select the first and last menu items',()=>{
  assert.equal(nextFloatingMenuIndex('Home',2,4),0);
  assert.equal(nextFloatingMenuIndex('End',0,4),3);
});

test('unsupported keys and empty or invalid item counts are ignored',()=>{
  assert.equal(nextFloatingMenuIndex('Enter',0,3),null);
  assert.equal(nextFloatingMenuIndex('ArrowDown',0,0),null);
  assert.equal(nextFloatingMenuIndex('ArrowUp',0,-1),null);
  assert.equal(nextFloatingMenuIndex('ArrowDown',0,1.5),null);
  assert.equal(nextFloatingMenuIndex('ArrowDown',99,2),0);
});

test('typeahead searches accessible labels case-insensitively and cycles from the current item',()=>{
  const labels=['Archive','Add member','Block'];
  assert.equal(nextFloatingMenuTypeaheadIndex(labels,-1,'a'),0);
  assert.equal(nextFloatingMenuTypeaheadIndex(labels,0,'A'),1);
  assert.equal(nextFloatingMenuTypeaheadIndex(labels,2,'a'),0);
  assert.equal(nextFloatingMenuTypeaheadIndex(labels,-1,'ad'),1);
});

test('typeahead normalizes accents and repeated characters cycle matching entries',()=>{
  const labels=['Éditer','Envoyer','Supprimer'];
  assert.equal(nextFloatingMenuTypeaheadIndex(labels,-1,'e'),0);
  assert.equal(nextFloatingMenuTypeaheadIndex(labels,0,'ee'),1);
  assert.equal(nextFloatingMenuTypeaheadIndex(labels,1,'s'),2);
});

test('typeahead ignores empty labels and returns null when no item matches',()=>{
  assert.equal(nextFloatingMenuTypeaheadIndex([],0,'a'),null);
  assert.equal(nextFloatingMenuTypeaheadIndex(['','Archive'],0,'z'),null);
  assert.equal(nextFloatingMenuTypeaheadIndex(['Archive'],0,''),null);
});

test('floating action menu exposes menuitem semantics, roving focus and IME-safe typeahead',()=>{
  const menu=source('components/FloatingActionMenu.tsx');
  const css=source('app/globals.css');
  assert.match(menu,/useRole\\(context,\\{role:'menu'\\}\\)/);
  assert.match(menu,/setAttribute\\('role','menuitem'\\)/);
  assert.match(menu,/item\\.tabIndex=index===0\\?0:-1/);
  assert.match(menu,/nextFloatingMenuIndex\\(event\\.key,currentIndex,items\\.length\\)/);
  assert.match(menu,/nextFloatingMenuTypeaheadIndex\\(labels,currentIndex,query\\)/);
  assert.match(menu,/nativeEvent\\.isComposing/);
  assert.match(menu,/typeaheadTimerRef/);
  assert.match(menu,/onKeyDown:onMenuKeyDown/);
  assert.match(menu,/returnFocus/);
  assert.match(css,/\\.ik-floating-menu-panel button:focus-visible\\{[^}]*outline:2px solid/s);
});
