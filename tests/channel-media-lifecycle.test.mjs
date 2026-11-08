import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {observeRemovedMediaElements,pauseMediaElements,pauseRemovedMediaNodes} from '../lib/channel-media-lifecycle.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('channel media cleanup pauses every player even when one browser node throws',()=>{
 const calls=[];
 const players=[
  {pause:()=>calls.push('audio')},
  {pause:()=>{calls.push('broken-video');throw new Error('detached media node');}},
  {pause:()=>calls.push('video')}
 ];
 assert.doesNotThrow(()=>pauseMediaElements(players));
 assert.deepEqual(calls,['audio','broken-video','video']);
});

test('channel media cleanup tolerates missing, empty and broken collections',()=>{
 assert.doesNotThrow(()=>pauseMediaElements(null));
 assert.doesNotThrow(()=>pauseMediaElements(undefined));
 assert.doesNotThrow(()=>pauseMediaElements({length:0}));
 const brokenLength={get length(){throw new Error('detached collection');}};
 assert.doesNotThrow(()=>pauseMediaElements(brokenLength));
 const calls=[];
 const brokenEntry={
  length:2,
  get 0(){throw new Error('stale node');},
  1:{pause:()=>calls.push('remaining')}
 };
 assert.doesNotThrow(()=>pauseMediaElements(brokenEntry));
 assert.deepEqual(calls,['remaining']);
});

test('channel feed pauses audio and video on background, pagehide and detach',()=>{
 const panel=load('components/ChannelsPanel.tsx');
 assert.match(panel,/pauseMediaElements\(root\.querySelectorAll<HTMLMediaElement>\('audio,video'\)\)/);
 assert.match(panel,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
 assert.match(panel,/window\.addEventListener\('pagehide',pause\)/);
 assert.match(panel,/if\(document\.visibilityState==='hidden'\)pause\(\)/);
 assert.match(panel,/document\.removeEventListener\('visibilitychange',onVisibilityChange\)/);
 assert.match(panel,/window\.removeEventListener\('pagehide',pause\)/);
 assert.match(panel,/ref=\{setFeedRef\}/);
 assert.match(panel,/if\(!node\)pauseFeedMedia\(feedRef\.current\)/);
 assert.doesNotMatch(panel,/\.play\(/,'media must never resume automatically when the app returns');
});

test('removing a channel post pauses its own and nested media players',()=>{
 const calls=[];
 const nestedAudio={pause:()=>calls.push('nested-audio')};
 const removedVideo={pause:()=>calls.push('removed-video')};
 const removedArticle={
  querySelectorAll:selector=>{
   assert.equal(selector,'audio,video');
   return [nestedAudio];
  }
 };
 pauseRemovedMediaNodes([{removedNodes:[removedVideo,removedArticle]}]);
 assert.deepEqual(calls,['removed-video','nested-audio']);
});

test('removed media cleanup survives broken detached nodes and collections',()=>{
 const calls=[];
 const brokenNode={
  pause:()=>{throw new Error('detached player');},
  querySelectorAll:()=>{throw new Error('detached subtree');}
 };
 const goodNode={pause:()=>calls.push('remaining-player')};
 assert.doesNotThrow(()=>pauseRemovedMediaNodes([
  {removedNodes:[brokenNode,goodNode]},
  {get removedNodes(){throw new Error('stale mutation record');}}
 ]));
 assert.deepEqual(calls,['remaining-player']);
});

test('channel feed observes removed post subtrees and disconnects on cleanup',()=>{
 let callback;
 let observed;
 let disconnected=false;
 class FakeMutationObserver{
  constructor(onMutations){callback=onMutations;}
  observe(root,options){observed={root,options};}
  disconnect(){disconnected=true;}
 }
 const root={};
 const dispose=observeRemovedMediaElements(root,FakeMutationObserver);
 assert.deepEqual(observed,{root,options:{childList:true,subtree:true}});
 const calls=[];
 callback([{removedNodes:[{pause:()=>calls.push('detached')}]}]);
 assert.deepEqual(calls,['detached']);
 dispose();
 assert.equal(disconnected,true);
});

test('channel feed guards unsupported MutationObserver and cleans up the observer',()=>{
 const panel=load('components/ChannelsPanel.tsx');
 assert.match(panel,/typeof MutationObserver!=='undefined'/);
 assert.match(panel,/observeRemovedMediaElements\(feed\)/);
 assert.match(panel,/stopObserving\(\)/);
});


test('moving a post within the same channel feed does not pause its media',()=>{
 const calls=[];
 const movedPlayer={pause:()=>calls.push('moved')};
 const removedPlayer={pause:()=>calls.push('removed')};
 const feed={contains:node=>node===movedPlayer};
 pauseRemovedMediaNodes([{removedNodes:[movedPlayer,removedPlayer]}],feed);
 assert.deepEqual(calls,['removed']);
});

test('removed media is paused conservatively when feed containment throws',()=>{
 const calls=[];
 const player={pause:()=>calls.push('paused')};
 const feed={contains:()=>{throw new Error('detached feed');}};
 assert.doesNotThrow(()=>pauseRemovedMediaNodes([{removedNodes:[player]}],feed));
 assert.deepEqual(calls,['paused']);
});
