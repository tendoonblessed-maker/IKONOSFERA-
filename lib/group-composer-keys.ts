/** Avoid accidental group sends while using an IME or on-screen keyboard.
 * A hardware keyboard can always explicitly send with Ctrl/Cmd+Enter.
 */
type GroupComposerKey={
 key:string;
 ctrlKey:boolean;
 metaKey:boolean;
 shiftKey:boolean;
 altKey:boolean;
 nativeEvent?:{isComposing?:boolean;keyCode?:number};
};

export function shouldSubmitGroupComposerOnEnter(event:GroupComposerKey,softKeyboard:boolean):boolean{
 if(event.key!=='Enter'||event.altKey)return false;
 // Some browsers emit keyCode 229 during composition even when isComposing is false.
 if(event.nativeEvent?.isComposing||event.nativeEvent?.keyCode===229)return false;
 return event.ctrlKey||event.metaKey||(!event.shiftKey&&!softKeyboard);
}
