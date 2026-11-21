/** Keep keyboard focus inside the attachment preview while sending disables controls. */
export type AttachmentPreviewTabAction='first'|'last'|'dialog'|null;

export function attachmentPreviewTabAction(
 activeIndex:number,
 controlCount:number,
 shiftKey:boolean
):AttachmentPreviewTabAction{
 if(!Number.isInteger(controlCount)||controlCount<=0)return 'dialog';
 if(!Number.isInteger(activeIndex)||activeIndex<0||activeIndex>=controlCount){
  return shiftKey?'last':'first';
 }
 if(shiftKey&&activeIndex===0)return 'last';
 if(!shiftKey&&activeIndex===controlCount-1)return 'first';
 return null;
}
