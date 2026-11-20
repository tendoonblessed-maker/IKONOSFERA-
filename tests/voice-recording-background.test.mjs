import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldDiscardVoiceRecordingOnBackground,shouldDiscardVoiceRecordingOnPageHide} from '../lib/voice-recording-lifecycle.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

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

test('VoiceRecorder cancels and discards capture on visibility loss',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 assert.match(ui,/shouldDiscardVoiceRecordingOnBackground/);
 assert.match(ui,/phaseRef\.current=phase/);
 assert.match(ui,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
 assert.match(ui,/cancelRef\.current\(\)/);
 assert.match(ui,/Запись отменена при переходе приложения в фон/);
 assert.match(ui,/const cancel=\(\)=>\{\s*dispose\(true\)/);
 assert.match(ui,/requestRef\.current\+=1/);
 assert.match(ui,/stopTracks\(capture\.stream\)/);
 assert.match(ui,/capture\.recorder\.onstop=null/);
 assert.match(ui,/return\(\)=>\{\s*document\.removeEventListener\('visibilitychange',onVisibilityChange\);\s*window\.removeEventListener\('pagehide',onPageHide\);\s*\}/);
});

test('background cancellation never creates an attachment or uploads it',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 assert.doesNotMatch(ui,/sendDirectMedia|fetch\(|uploadDirectMedia/);
 assert.match(ui,/capture\.discard=discard/);
 assert.match(ui,/if\(capture\.discard\|\|captureRef\.current!==capture\)return/);
});


test('pagehide cancels pending permission, active recording and finalization',()=>{
 for(const phase of ['requesting','recording','finalizing']){
  assert.equal(shouldDiscardVoiceRecordingOnPageHide(phase),true,phase);
 }
});

test('pagehide does not cancel an idle recorder',()=>{
 assert.equal(shouldDiscardVoiceRecordingOnPageHide('idle'),false);
 assert.equal(shouldDiscardVoiceRecordingOnPageHide('unknown'),false);
});

test('VoiceRecorder registers and cleans up the pagehide lifecycle handler',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 assert.match(ui,/const onPageHide=\(\)=>\{/);
 assert.match(ui,/shouldDiscardVoiceRecordingOnPageHide\(phaseRef\.current\)/);
 assert.match(ui,/window\.addEventListener\('pagehide',onPageHide\)/);
 assert.match(ui,/window\.removeEventListener\('pagehide',onPageHide\)/);
 assert.match(ui,/Запись отменена при уходе со страницы/);
});
