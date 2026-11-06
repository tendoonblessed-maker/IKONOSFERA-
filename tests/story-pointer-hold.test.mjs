import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isActiveStoryPointer} from '../lib/story-pointer-hold.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('only the pointer that started a story hold can release it',()=>{
 assert.equal(isActiveStoryPointer(7,7),true);
 assert.equal(isActiveStoryPointer(0,0),true);
 assert.equal(isActiveStoryPointer(7,8),false);
 assert.equal(isActiveStoryPointer(null,7),false);
});

test('story hold listens beyond the viewer so release outside the overlay resumes progress',()=>{
 const component=load('components/StoriesStrip.tsx');
 assert.match(component,/onPointerDown=\{event=>\{/);
 assert.match(component,/event\.isPrimary/);
 assert.match(component,/event\.button!==0/);
 assert.match(component,/activePointerRef\.current=event\.pointerId/);
 assert.match(component,/window\.addEventListener\('pointerup',finishPointer\)/);
 assert.match(component,/window\.addEventListener\('pointercancel',finishPointer\)/);
 assert.match(component,/window\.removeEventListener\('pointerup',finishPointer\)/);
 assert.match(component,/window\.addEventListener\('blur',releasePointer\)/);
 assert.match(component,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
 assert.match(component,/if\(document\.visibilityState!=='visible'\)releasePointer\(\)/);
 assert.match(component,/activePointerRef\.current=null;\s*setPaused\(false\)/);
 assert.doesNotMatch(component,/onPointerUp=/);
 assert.doesNotMatch(component,/onPointerCancel=/);
});

test('a non-primary or secondary-button press cannot take ownership of the story hold',()=>{
 const component=load('components/StoriesStrip.tsx');
 assert.match(component,/if\(!event\.isPrimary\|\|event\.button!==0\|\|activePointerRef\.current!==null\)return/);
});
