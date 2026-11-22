import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 chooseVoiceMimeType,createVoiceFile,createVoiceRecorderOptions,elapsedVoiceSeconds,
 formatVoiceTime,getVoiceClockNow,hasUnavailableVoiceTrack,resolveVoiceMimeType,
 VOICE_RECORD_MAX_MS,VOICE_RECORD_MAX_BYTES,VOICE_MIME_CANDIDATES,VOICE_TRACK_MUTE_GRACE_MS
} from '../lib/voice-notes.ts';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Safari MP4 and Chrome/Firefox Opus WebM are selected using feature detection',()=>{
 assert.equal(chooseVoiceMimeType(type=>type==='audio/mp4'),'audio/mp4');
 assert.equal(chooseVoiceMimeType(type=>type==='audio/webm;codecs=opus'),'audio/webm;codecs=opus');
 assert.equal(chooseVoiceMimeType(type=>type==='audio/ogg'),'audio/ogg');
 assert.equal(chooseVoiceMimeType(()=>false),null);
 assert.equal(VOICE_MIME_CANDIDATES[0],'audio/mp4');
});

test('voice recorder falls back to browser-selected MIME when probing is unavailable',()=>{
 assert.deepEqual(createVoiceRecorderOptions(null),{audioBitsPerSecond:64000});
 assert.deepEqual(createVoiceRecorderOptions('audio/mp4'),{mimeType:'audio/mp4',audioBitsPerSecond:64000});
 const chunks=[new Blob(['voice'],{type:'audio/webm;codecs=opus'})];
 assert.equal(resolveVoiceMimeType('',chunks,null),'audio/webm;codecs=opus');
 assert.equal(resolveVoiceMimeType('audio/mp4;codecs=mp4a.40.2',chunks,null),'audio/mp4;codecs=mp4a.40.2');
 assert.equal(resolveVoiceMimeType('',[],null),'');
 const ui=load('components/VoiceRecorder.tsx');
 assert.match(ui,/typeof MediaRecorder\.isTypeSupported==='function'\&\&!mime/);
 assert.match(ui,/new MediaRecorder\(stream,createVoiceRecorderOptions\(mime\)\)/);
 assert.match(ui,/resolveVoiceMimeType\(recorder\.mimeType,capture\.chunks,mime\)/);
});

test('elapsed voice recording time is monotonic, non-negative and capped at the two-minute limit',()=>{
 assert.equal(elapsedVoiceSeconds(100,1099),0);
 assert.equal(elapsedVoiceSeconds(100,1100),1);
 assert.equal(elapsedVoiceSeconds(100,61_100),61);
 assert.equal(elapsedVoiceSeconds(100,120_100),120);
 assert.equal(elapsedVoiceSeconds(100,999_999),120);
 assert.equal(elapsedVoiceSeconds(100,50),0);
 assert.equal(elapsedVoiceSeconds(Number.NaN,5000),0);
 assert.equal(elapsedVoiceSeconds(0,Number.POSITIVE_INFINITY),0);
 assert.equal(typeof getVoiceClockNow(),'number');
 const ui=load('components/VoiceRecorder.tsx');
 assert.match(ui,/startedAt:getVoiceClockNow\(\)/);
 assert.match(ui,/elapsedVoiceSeconds\(capture\.startedAt,getVoiceClockNow\(\)\)/);
 assert.doesNotMatch(ui,/Date\.now\(\)-capture\.startedAt/);
});

test('voice track availability rejects muted, ended and missing microphone tracks',()=>{
 assert.equal(hasUnavailableVoiceTrack([{muted:false,readyState:'live'}]),false);
 assert.equal(hasUnavailableVoiceTrack([{muted:true,readyState:'live'}]),true);
 assert.equal(hasUnavailableVoiceTrack([{muted:false,readyState:'ended'}]),true);
 assert.equal(hasUnavailableVoiceTrack([{muted:false,readyState:'live'},{muted:true,readyState:'live'}]),true);
 assert.equal(hasUnavailableVoiceTrack([]),true);
 assert.equal(VOICE_TRACK_MUTE_GRACE_MS,2000);
});

test('voice recorder cancels sustained mute and ended-track interruptions without previewing partial audio',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 assert.match(ui,/track\.addEventListener\('mute',onMute\)/);
 assert.match(ui,/track\.addEventListener\('unmute',onUnmute\)/);
 assert.match(ui,/track\.addEventListener\('ended',onEnded\)/);
 assert.match(ui,/track\.removeEventListener\('mute',onMute\)/);
 assert.match(ui,/track\.removeEventListener\('unmute',onUnmute\)/);
 assert.match(ui,/track\.removeEventListener\('ended',onEnded\)/);
 assert.match(ui,/capture\.muteGrace=window\.setTimeout/);
 assert.match(ui,/window\.clearTimeout\(capture\.muteGrace\)/);
 assert.match(ui,/hasUnavailableVoiceTrack\(capture\.stream\.getAudioTracks\(\)\)/);
 assert.match(ui,/if\(!capture\.stopRequested\)\{/);
 assert.match(ui,/Запись прервана браузером или системным аудиособытием/);
 assert.match(ui,/capture\.stopRequested=true/);
 assert.match(ui,/removeCaptureTrackListeners\(capture\)/);
});

test('recorded audio normalizes codec parameters to strict private Storage MIME',()=>{
 const webm=createVoiceFile([new Blob(['voice-bytes'])],'audio/webm;codecs=opus',12345);
 assert.equal(webm.type,'audio/webm');
 assert.equal(webm.name,'voice-12345.webm');
 assert.equal(webm.size,11);
 const safari=createVoiceFile([new Blob(['voice'])],'audio/mp4;codecs=mp4a.40.2',123);
 assert.equal(safari.type,'audio/mp4');
 assert.equal(safari.name,'voice-123.m4a');
 const firefox=createVoiceFile([new Blob(['voice'])],'audio/ogg;codecs=opus',456);
 assert.equal(firefox.type,'audio/ogg');
 assert.equal(firefox.name,'voice-456.ogg');
});

test('unsupported MIME, empty data and oversized recordings are rejected',()=>{
 assert.throws(()=>createVoiceFile([new Blob(['x'])],'video/webm'),/неподдерживаемом формате/);
 assert.throws(()=>createVoiceFile([new Blob([])],'audio/webm'),/пустое или превышает/);
 const large=new Blob([new Uint8Array(VOICE_RECORD_MAX_BYTES+1)]);
 assert.throws(()=>createVoiceFile([large],'audio/webm'),/пустое или превышает/);
 assert.equal(VOICE_RECORD_MAX_MS,120_000);
});

test('voice recorder uses only microphone, stops tracks on cancel, unmount and permission races',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 assert.match(ui,/navigator\.mediaDevices\.getUserMedia\(\{/);
 assert.match(ui,/audio:\{echoCancellation:true,noiseSuppression:true,autoGainControl:true\},video:false/);
 assert.match(ui,/if\(requestRef\.current!==generation\|\|!liveRef\.current\|\|disabled\)\{/);
 assert.match(ui,/stopTracks\(stream\)/);
 assert.match(ui,/requestRef\.current\+=1/);
 assert.match(ui,/capture\.recorder\.onstop=null/);
 assert.match(ui,/if\(capture\.recorder\.state!=='inactive'\)/);
 assert.match(ui,/liveRef\.current=false;dispose\(true\)/);
 assert.match(ui,/capture\.discard=discard/);
 assert.match(ui,/if\(capture\.discard\|\|captureRef\.current!==capture\)return/);
 assert.match(ui,/typeof MediaRecorder\.isTypeSupported==='function'/);
});

test('recording never auto-uploads: it passes a real file into existing preview flow',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 const shell=load('components/AppShell.tsx');
 const preview=load('components/ChatAttachmentPreview.tsx');
 assert.match(ui,/recordedRef\.current\(file\)/);
 assert.match(shell,/onRecorded=\{file=>queueAttachment\(file\)\}/);
 assert.match(shell,/key=\{userId\+':'\+selected\}/);
 assert.match(shell,/disabled=\{sending\|\|activePartnerBlocked\|\|Boolean\(pendingAttachment\)\}/);
 assert.match(preview,/<audio src=\{src\} controls/);
 assert.match(shell,/onSend=\{\(\)=>\{void sendAttachment\(pendingAttachment\.file,attachmentCaption\);\}\}/);
 assert.match(shell,/const problem=validateDirectMediaFile\(file\)/);
 assert.match(ui,/VOICE_RECORD_MAX_MS/);
 assert.match(ui,/setTimeout\(\(\)=>\{/);
 assert.match(ui,/clearCaptureTimers\(capture\)/);
 assert.doesNotMatch(ui,/sendDirectMedia|fetch\(|uploadDirectMedia|localStorage/);
});

test('MP4 and WebM remain allowed in both backend validation and versioned private bucket policy',()=>{
 const api=load('lib/supabase-rest.ts');
 const shell=load('components/AppShell.tsx');
 const sql=load('supabase/migrations/20261029081406_allow_private_voice_audio_webm.sql');
 assert.match(api,/"audio\/webm":"webm"/);
 assert.match(api,/"audio\/mp4":"m4a"/);
 assert.match(shell,/audio\/webm/);
 assert.match(sql,/id='ikonosfera-direct-media'/);
 assert.match(sql,/public=false/);
 assert.match(sql,/array_append\(allowed_mime_types,'audio\/webm'\)/);
 assert.doesNotMatch(sql,/storage\.objects|drop policy|alter table|public=true/i);
});

test('timer display is stable for invalid, short and long values',()=>{
 assert.equal(formatVoiceTime(0),'00:00');
 assert.equal(formatVoiceTime(9.99),'00:09');
 assert.equal(formatVoiceTime(63),'01:03');
 assert.equal(formatVoiceTime(120),'02:00');
 assert.equal(formatVoiceTime(-4),'00:00');
 assert.equal(formatVoiceTime(Number.NaN),'00:00');
});

test('voice recorder exposes accessible controls with permission and failure feedback',()=>{
 const ui=load('components/VoiceRecorder.tsx');
 const css=load('app/globals.css');
 assert.match(ui,/aria-label="Записать голосовое сообщение"/);
 assert.match(ui,/aria-label="Голосовое сообщение"/);
 assert.match(ui,/aria-live="polite"/);
 assert.match(ui,/>Отменить<\/button>/);
 assert.match(ui,/>Готово<\/button>/);
 assert.match(ui,/Разреши доступ к микрофону/);
 assert.match(ui,/не поддерживает доступные форматы/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.ik-voice-panel/);
});
