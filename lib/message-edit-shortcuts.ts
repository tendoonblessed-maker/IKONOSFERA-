/** Keyboard shortcuts for editing a sent message.
 * IME composition and auto-repeat must never cancel or submit a draft.
 */
export type MessageEditKey={
 key:string;
 ctrlKey:boolean;
 metaKey:boolean;
 altKey:boolean;
 shiftKey:boolean;
 repeat:boolean;
 isComposing:boolean;
 keyCode?:number;
};

export function messageEditShortcut(event:MessageEditKey,saving:boolean):'cancel'|'save'|null{
 if(saving||event.isComposing||event.keyCode===229||event.repeat)return null;
 if(event.key==='Escape'&&!event.ctrlKey&&!event.metaKey&&!event.altKey)return 'cancel';
 if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey)return 'save';
 return null;
}
