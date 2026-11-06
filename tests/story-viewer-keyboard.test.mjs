import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {getStoryTabTarget,restoreStoryViewerFocus} from '../lib/story-focus.ts';

const source=readFileSync(new URL('../components/StoriesStrip.tsx',import.meta.url),'utf8');

test('Tab wraps from the last story control to the first and Shift+Tab reverses',()=>{
 assert.equal(getStoryTabTarget(2,3,false),0);
 assert.equal(getStoryTabTarget(0,3,true),2);
 assert.equal(getStoryTabTarget(1,3,false),null);
 assert.equal(getStoryTabTarget(1,3,true),null);
});

test('a keyboard focus outside the story dialog returns to a dialog control',()=>{
 assert.equal(getStoryTabTarget(-1,3,false),0);
 assert.equal(getStoryTabTarget(-1,3,true),2);
 assert.equal(getStoryTabTarget(-1,0,false),null);
 assert.equal(getStoryTabTarget(0,1,false),0);
 assert.equal(getStoryTabTarget(0,1,true),0);
});

test('restoring story focus after close never scrolls the underlying mobile strip',()=>{
 const calls=[];
 const opener={isConnected:true,focus:options=>calls.push(options)};
 restoreStoryViewerFocus(opener);
 assert.deepEqual(calls,[{preventScroll:true}]);
 restoreStoryViewerFocus({...opener,isConnected:false});
 restoreStoryViewerFocus(null);
 assert.equal(calls.length,1);
});

test('story modal focuses its close button, traps Tab and restores opener focus without scrolling',()=>{
 assert.match(source,/const viewerOpen=active!==null/);
 assert.match(source,/const viewerRef=useRef<HTMLDivElement>\(null\)/);
 assert.match(source,/const viewerCloseRef=useRef<HTMLButtonElement>\(null\)/);
 assert.match(source,/viewerCloseRef\.current\?\.focus\(\)/);
 assert.match(source,/dialog\.querySelectorAll<HTMLButtonElement>\('button:not\(\[disabled\]\)'\)/);
 assert.match(source,/getStoryTabTarget\(activeIndex,controls\.length,event\.shiftKey\)/);
 assert.match(source,/event\.preventDefault\(\);controls\[target\]\.focus\(\)/);
 assert.match(source,/document\.addEventListener\('keydown',keepFocus\)/);
 assert.match(source,/document\.removeEventListener\('keydown',keepFocus\)/);
 assert.match(source,/restoreStoryViewerFocus\(previousFocus\)/);
 assert.match(source,/\},\[viewerOpen\]\)/,'focus must not reset on every story transition');
 assert.match(source,/ref=\{viewerRef\} tabIndex=\{-1\}/);
 assert.match(source,/ref=\{viewerCloseRef\} type="button"/);
 assert.match(source,/role="dialog" aria-modal="true"/);
});

test('story navigation ignores IME composition and prevents arrow-key page scrolling',()=>{
 assert.match(source,/if\(e\.isComposing\|\|e.keyCode===229\)return/);
 assert.match(source,/if\(e.key==='Escape'\)\{e.preventDefault\(\);setActive\(null\);\}/);
 assert.match(source,/if\(e.key==='ArrowRight'\)\{e.preventDefault\(\);next\(\);\}/);
 assert.match(source,/if\(e.key==='ArrowLeft'\)\{e.preventDefault\(\);prev\(\);\}/);
});
