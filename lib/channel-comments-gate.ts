/** A per-panel generation gate for asynchronous comment-thread reads.
 * Late responses must never reopen a thread or overwrite another thread's
 * comments/author names after a switch, close, account change or unmount.
 */
export function createChannelCommentsGate(){
 let generation=0;
 let loadingPostId:string|null=null;
 return {
  begin(postId:string):number{
   loadingPostId=postId;
   return ++generation;
  },
  isCurrent(requestId:number):boolean{return requestId===generation;},
  isLoading(postId:string):boolean{return loadingPostId===postId;},
  finish(requestId:number):void{
   if(requestId===generation)loadingPostId=null;
  },
  cancel():void{
   generation++;
   loadingPostId=null;
  }
 };
}
