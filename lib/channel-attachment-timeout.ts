export const CHANNEL_ATTACHMENT_UPLOAD_TIMEOUT_MS=60_000;

export async function fetchWithTimeout(
 input:RequestInfo|URL,
 init:RequestInit,
 timeoutMs=CHANNEL_ATTACHMENT_UPLOAD_TIMEOUT_MS
):Promise<Response>{
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)
  throw Error("Некорректный таймаут загрузки.");

 const controller=new AbortController();
 const externalSignal=init.signal;
 let externalListener:(()=>void)|null=null;
 if(externalSignal){
  if(externalSignal.aborted)controller.abort(externalSignal.reason);
  else{
   externalListener=()=>controller.abort(externalSignal.reason);
   externalSignal.addEventListener("abort",externalListener,{once:true});
  }
 }

 let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>{
   const error=new Error("Загрузка вложения превысила лимит ожидания.");
   error.name="TimeoutError";
   controller.abort(error);
   reject(error);
  },timeoutMs);
 });

 try{
  return await Promise.race([
   fetch(input,{...init,signal:controller.signal}),
   deadline
  ]);
 }finally{
  if(timer!==undefined)clearTimeout(timer);
  if(externalSignal&&externalListener)
   externalSignal.removeEventListener("abort",externalListener);
 }
}
