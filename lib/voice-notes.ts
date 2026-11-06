/** Browser-native voice recordings: no new codec dependency or server API. */
export const VOICE_RECORD_MAX_MS=120_000;
/** Bound a browser's missing MediaRecorder.onstop event (especially on mobile). */
export const VOICE_FINALIZE_TIMEOUT_MS=8_000;
export const VOICE_RECORD_MAX_BYTES=25*1024*1024;

export const VOICE_MIME_CANDIDATES=[
 'audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg'
] as const;

const VALID_MIMES=new Set(['audio/mp4','audio/webm','audio/ogg']);
const EXTENSIONS:Record<string,string>={
 'audio/mp4':'m4a','audio/webm':'webm','audio/ogg':'ogg'
};

export function chooseVoiceMimeType(supported:(type:string)=>boolean):string|null{
 return VOICE_MIME_CANDIDATES.find(type=>supported(type))??null;
}
/** Strip codec parameters and accept only formats allowed by the private media bucket. */
export function normalizeVoiceMimeType(mime:string):string|null{
 const base=typeof mime==='string'?mime.split(';',1)[0].trim().toLowerCase():'';
 return VALID_MIMES.has(base)?base:null;
}
export function formatVoiceTime(elapsedSeconds:number):string{
 const time=Math.max(0,Math.floor(Number.isFinite(elapsedSeconds)?elapsedSeconds:0));
 return Math.floor(time/60).toString().padStart(2,'0')+':'
  +(time%60).toString().padStart(2,'0');
}
/** Normalizes codec parameters because Storage verifies exact audio/* MIME. */
export function createVoiceFile(chunks:Blob[],mime:string,timestamp=Date.now()):File{
 const base=normalizeVoiceMimeType(mime);
 if(!base)throw Error('Браузер записал звук в неподдерживаемом формате.');
 const blob=new Blob(chunks,{type:base});
 if(!blob.size||blob.size>VOICE_RECORD_MAX_BYTES)
  throw Error('Голосовое сообщение пустое или превышает 25 МБ.');
 return new File([blob],'voice-'+timestamp+'.'+EXTENSIONS[base],{type:base,lastModified:timestamp});
}
