import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {pauseMediaElements} from '../lib/channel-media-lifecycle.ts';

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
 assert.match(panel,/pauseMediaElements\(root\.querySelectorAll\('audio,video'\)\)/);
 assert.match(panel,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
 assert.match(panel,/window\.addEventListener\('pagehide',pause\)/);
 assert.match(panel,/if\(document\.visibilityState==='hidden'\)pause\(\)/);
 assert.match(panel,/document\.removeEventListener\('visibilitychange',onVisibilityChange\)/);
 assert.match(panel,/window\.removeEventListener\('pagehide',pause\)/);
 assert.match(panel,/ref=\{setFeedRef\}/);
 assert.match(panel,/if\(!node\)pauseFeedMedia\(feedRef\.current\)/);
 assert.doesNotMatch(panel,/\.play\(/,'media must never resume automatically when the app returns');
});
