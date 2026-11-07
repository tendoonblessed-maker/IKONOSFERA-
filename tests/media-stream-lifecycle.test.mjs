import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stopMediaStreamTracks} from '../lib/media-stream-lifecycle.ts';

test('every microphone track is stopped even when another track throws',()=>{
 const stopped=[];
 stopMediaStreamTracks({getTracks:()=>[
  {stop(){stopped.push('first');throw Error('track already disposed');}},
  {stop(){stopped.push('second');}},
  {stop:null}
 ]});
 assert.deepEqual(stopped,['first','second']);
});

test('missing streams and broken getTracks implementations are safe during cleanup',()=>{
 assert.doesNotThrow(()=>stopMediaStreamTracks(null));
 assert.doesNotThrow(()=>stopMediaStreamTracks(undefined));
 assert.doesNotThrow(()=>stopMediaStreamTracks({}));
 assert.doesNotThrow(()=>stopMediaStreamTracks({getTracks(){throw Error('stream detached');}}));
});

test('a stream with no tracks is a no-op',()=>{
 assert.doesNotThrow(()=>stopMediaStreamTracks({getTracks:()=>[]}));
});
