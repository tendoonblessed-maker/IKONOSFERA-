/** Browser-native voice recordings: no new codec dependency or server API. */
export const VOICE_RECORD_MAX_MS=120_000;
export const VOICE_RECORD_MAX_BYTES=25*1024*1024;
/** A short mute grace avoids cancelling on a transient device hand-off. */
export const VOICE_TRACK_MUTE_GRACE_MS=2_000;

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
/** True when no live, unmuted audio track can currently feed the recorder. */
export function hasUnavailableVoiceTrack(tracks:Array<{muted:boolean;readyState:string}>):boolean{
 return tracks.length===0||tracks.some(track=>track.muted||track.readyState!=='live');
}
/** Use a monotonic clock for elapsed capture time, with a legacy fallback. */
export function getVoiceClockNow():number{
 return typeof performance!=='undefined'&&typeof performance.now==='function'
  ?performance.now():Date.now();
}
/** Clamp elapsed capture time so wall-clock jumps cannot rewind or overrun the UI. */
export function elapsedVoiceSeconds(startedAt:number,now:number):number{
 if(!Number.isFinite(startedAt)||!Number.isFinite(now))return 0;
 return Math.min(VOICE_RECORD_MAX_MS/1000,Math.max(0,Math.floor((now-startedAt)/1000)));
}
/** Use the browser-selected codec when MIME probing is unavailable. */
export function createVoiceRecorderOptions(mime:string|null):{mimeType?:string;audioBitsPerSecond:number}{
 const options:{mimeType?:string;audioBitsPerSecond:number}={audioBitsPerSecond:64000};
 if(mime)options.mimeType=mime;
 return options;
}
/** Resolve the actual recorded format before validating/normalizing the file. */
export function resolveVoiceMimeType(reportedMime:string,chunks:Blob[],requestedMime:string|null):string{
 return reportedMime||chunks.find(chunk=>chunk.type)?.type||requestedMime||'';
}
export function formatVoiceTime(elapsedSeconds:number):string{
 const time=Math.max(0,Math.floor(Number.isFinite(elapsedSeconds)?elapsedSeconds:0));
 return Math.floor(time/60).toString().padStart(2,'0')+':'
  +(time%60).toString().padStart(2,'0');
}
/** Normalizes codec parameters because Storage verifies exact audio/* MIME. */
export function createVoiceFile(chunks:Blob[],mime:string,timestamp=Date.now()):File{
 const base=mime.split(';')[0].trim().toLowerCase();
 if(!VALID_MIMES.has(base))throw Error('Браузер записал звук в неподдерживаемом формате.');
 const blob=new Blob(chunks,{type:base});
 if(!blob.size||blob.size>VOICE_RECORD_MAX_BYTES)
  throw Error('Голосовое сообщение пустое или превышает 25 МБ.');
 return new File([blob],'voice-'+timestamp+'.'+EXTENSIONS[base],{type:base,lastModified:timestamp});
}
