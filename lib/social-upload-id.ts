type SecureCryptoSource={randomUUID?:()=>string;getRandomValues?:Crypto['getRandomValues']};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Secure UUID v4 for upload paths; older browsers may expose only getRandomValues. */
export function createSocialUploadId(source:SecureCryptoSource|undefined=globalThis.crypto):string{
 if(source&&typeof source.randomUUID==='function'){
  try{
   const native=source.randomUUID();
   if(typeof native==='string'&&UUID.test(native))return native;
  }catch{}
 }
 if(!source||typeof source.getRandomValues!=='function')
  throw Error('Безопасная генерация идентификатора недоступна в этом браузере.');
 const bytes=new Uint8Array(16);
 try{source.getRandomValues(bytes);}catch{
  throw Error('Безопасная генерация идентификатора недоступна в этом браузере.');
 }
 bytes[6]=(bytes[6]&0x0f)|0x40;
 bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
