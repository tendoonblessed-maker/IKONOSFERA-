const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Creates a UUID v4 using secure Web Crypto only.
 * Older mobile browsers may expose getRandomValues() without randomUUID().
 * @param {Crypto|undefined} source
 */
export function createSecureUuid(source=typeof globalThis.crypto==='undefined'?undefined:globalThis.crypto){
 try{
  if(source&&typeof source.randomUUID==='function'){
   const native=source.randomUUID();
   if(typeof native==='string'&&UUID_V4.test(native))return native;
  }
 }catch{}
 try{
  if(!source||typeof source.getRandomValues!=='function')throw Error();
  const bytes=new Uint8Array(16);
  source.getRandomValues(bytes);
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
 }catch{
  throw Error('Безопасная генерация идентификатора недоступна в этом браузере.');
 }
}
