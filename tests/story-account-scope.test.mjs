import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isCurrentStoryRequest} from '../lib/story-request-scope.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the latest story request remains valid for the same non-empty account',()=>{
 assert.equal(isCurrentStoryRequest('user-a','user-a',3,3),true);
});

test('a story response from a previous account is rejected immediately',()=>{
 assert.equal(isCurrentStoryRequest('user-a','user-b',3,3),false);
 assert.equal(isCurrentStoryRequest('','user-b',3,3),false);
});

test('a superseded story request cannot replace a newer result',()=>{
 assert.equal(isCurrentStoryRequest('user-a','user-a',2,3),false);
 assert.equal(isCurrentStoryRequest('user-a','user-a',4,3),false);
});

test('StoriesStrip is remounted on account changes so prior private stories never flash',()=>{
 const shell=source('components/AppShell.tsx');
 assert.match(shell,/<StoriesStrip key=\{userId\} token=\{session\.access_token\}/);
});

test('late story loads and uploads are scoped to the mounted account',()=>{
 const strip=source('components/StoriesStrip.tsx');
 assert.match(strip,/ownerRef\.current=userId/);
 assert.match(strip,/mountedRef\.current=false/);
 assert.match(strip,/storyRequestRef\.current\+=1/);
 assert.match(strip,/createRequestRef\.current\+=1/);
 assert.match(strip,/isCurrentStoryRequest\(userId,ownerRef\.current,requestId,storyRequestRef\.current\)/);
 assert.match(strip,/if\(!isCurrent\(\)\)\{[\s\S]*?await removeUpload\(token,path\)\.catch\(\(\)=>\{\}\);[\s\S]*?return;/);
 assert.match(strip,/await addStory\(token,ownerId,path,''\);[\s\S]*?if\(!isCurrent\(\)\)return;/);
 assert.match(strip,/if\(isCurrent\(\)\)setError/);
 assert.match(strip,/if\(isCurrent\(\)\)setBusy\(false\)/);
});
