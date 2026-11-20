import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 shouldDiscardVoiceRecordingOnBackground,
 shouldDiscardVoiceRecordingOnPageHide,
 registerVoiceRecordingLifecycle
} from '../lib/voice-recording-lifecycle.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function setup(phase='recording'){
 const documentTarget=new EventTarget();
 documentTarget.visibilityState='visible';
 const windowTarget=new EventTarget();
 const calls=[];
 const reports=[];
 const cleanup=registerVoiceRecordingLifecycle(
  documentTarget,windowTarget,()=>phase,
  ()=>calls.push('cancel'),message=>reports.push(message)
 );
 return {documentTarget,windowTarget,calls,reports,cleanup,setPhase(next){phase=next;}};
}

test('backgrounding cancels active microphone permission, recording and finalization',()=>{
 for(const phase of ['requesting','recording','finalizing']){
  assert.equal(shouldDiscardVoiceRecordingOnBackground('hidden',phase),true);
 }
});

test('visible pages, idle state and unknown phases do not trigger cancellation',()=>{
 assert.equal(shouldDiscardVoiceRecordingOnBackground('visible','recording'),false);
 assert.equal(shouldDiscardVoiceRecordingOnBackground('hidden','idle'),false);
 assert.equal(shouldDiscardVoiceRecordingOnBackground('hidden','unknown'),false);
 assert.equal(shouldDiscardVoiceRecordingOnBackground('prerender','requesting'),false);
});

test('VoiceRecorder uses the tested lifecycle registration helper',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 assert.match(ui,/registerVoiceRecordingLifecycle\(\s*document,window,/);
 assert.match(ui,/\(\)=>phaseRef\.current/);
 assert.match(ui,/\(\)=>cancelRef\.current\(\)/);
 assert.match(ui,/message=>errorRef\.current\(message\)/);
 assert.match(ui,/const cancel=\(\)=>\{\s*dispose\(true\)/);
 assert.match(ui,/requestRef\.current\+=1/);
 assert.match(ui,/stopTracks\(capture\.stream\)/);
 assert.match(ui,/capture\.recorder\.onstop=null/);
});

test('visibilitychange invokes cancellation and reports only for active capture',()=>{
 for(const phase of ['requesting','recording','finalizing']){
  const s=setup(phase);
  s.documentTarget.visibilityState='hidden';
  s.documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(s.calls,['cancel'],phase);
  assert.deepEqual(s.reports,['Запись отменена при переходе приложения в фон.'],phase);
  s.cleanup();
 }
});

test('pagehide cancels pending permission, active recording and finalization',()=>{
 for(const phase of ['requesting','recording','finalizing']){
  assert.equal(shouldDiscardVoiceRecordingOnPageHide(phase),true,phase);
  const s=setup(phase);
  s.windowTarget.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(s.calls,['cancel'],phase);
  assert.deepEqual(s.reports,['Запись отменена при уходе со страницы.'],phase);
  s.cleanup();
 }
});

test('idle and visible lifecycle events do not cancel a recording',()=>{
 const s=setup('idle');
 s.documentTarget.visibilityState='hidden';
 s.documentTarget.dispatchEvent(new Event('visibilitychange'));
 s.windowTarget.dispatchEvent(new Event('pagehide'));
 assert.deepEqual(s.calls,[]);
 assert.deepEqual(s.reports,[]);
 s.cleanup();
});

test('lifecycle cleanup removes handlers and prevents later callbacks',()=>{
 const s=setup('recording');
 s.cleanup();
 s.documentTarget.visibilityState='hidden';
 s.documentTarget.dispatchEvent(new Event('visibilitychange'));
 s.windowTarget.dispatchEvent(new Event('pagehide'));
 assert.deepEqual(s.calls,[]);
 assert.deepEqual(s.reports,[]);
});

test('background cancellation never creates an attachment or uploads it',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 assert.doesNotMatch(ui,/sendDirectMedia|fetch\(|uploadDirectMedia/);
 assert.match(ui,/capture\.discard=discard/);
 assert.match(ui,/if\(capture\.discard\|\|captureRef\.current!==capture\)return/);
});
