import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runScopedStoryLoad} from '../lib/story-load.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('a current story load commits the list and returns it',async()=>{
 const events=[];
 const result=await runScopedStoryLoad(
  async()=>['story-a'],
  ()=>true,
  value=>events.push(['success',value]),
  ()=>events.push(['failure'])
 );
 assert.deepEqual(result,['story-a']);
 assert.deepEqual(events,[['success',['story-a']]]);
});

test('a stale successful story response cannot replace the current list',async()=>{
 let current=true;
 const events=[];
 let resolve;
 const request=new Promise(done=>{resolve=done;});
 const pending=runScopedStoryLoad(
  ()=>request,
  ()=>current,
  value=>events.push(['success',value]),
  ()=>events.push(['failure'])
 );
 current=false;
 resolve(['old-account-story']);
 assert.equal(await pending,null);
 assert.deepEqual(events,[]);
});

test('a current story-load failure exposes a retryable error state without throwing',async()=>{
 const events=[];
 const result=await runScopedStoryLoad(
  async()=>{throw new Error('offline');},
  ()=>true,
  value=>events.push(['success',value]),
  ()=>events.push(['failure'])
 );
 assert.equal(result,null);
 assert.deepEqual(events,[['failure']]);
});

test('a stale story-load failure cannot overwrite a newer account or request state',async()=>{
 let current=true;
 const events=[];
 let reject;
 const request=new Promise((_,fail)=>{reject=fail;});
 const pending=runScopedStoryLoad(
  ()=>request,
  ()=>current,
  value=>events.push(['success',value]),
  ()=>events.push(['failure'])
 );
 current=false;
 reject(new Error('old request failed'));
 assert.equal(await pending,null);
 assert.deepEqual(events,[]);
});

test('StoriesStrip presents retry UI for failed loads and reports a post-publish refresh failure accurately',()=>{
 const strip=source('components/StoriesStrip.tsx');
 assert.match(strip,/runScopedStoryLoad\(/);
 assert.match(strip,/setStoriesLoadError\(''\)/);
 assert.match(strip,/Не удалось загрузить истории\. Проверь соединение и попробуй ещё раз\./);
 assert.match(strip,/История опубликована, но список не обновился\. Нажми «Повторить»\./);
 assert.match(strip,/role="alert"/);
 assert.match(strip,/onClick=\{\(\)=>\{void load\(\);\}\}/);
 assert.match(strip,/disabled=\{storiesLoading\|\|busy\}/);
 assert.match(strip,/const updated=await load\(true\)/);
 assert.doesNotMatch(strip,/void load\(\)\.catch\(\(\)=>\{\}\)/);
});
