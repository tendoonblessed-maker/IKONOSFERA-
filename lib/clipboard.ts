export type ClipboardWrite = (text:string)=>Promise<void>;
export type LegacyClipboardCopy = (text:string)=>boolean;

/** Prefer the asynchronous Clipboard API, then use a gesture-friendly legacy fallback. */
export async function copyTextWithFallback(
  text:string,
  writeText:ClipboardWrite|null|undefined,
  legacyCopy:LegacyClipboardCopy|null|undefined
):Promise<void>{
  if(writeText){
    try{
      await writeText(text);
      return;
    }catch{
      // Safari can expose the API but still reject it for permission/context reasons.
    }
  }
  try{
    if(legacyCopy?.(text))return;
  }catch{
    // Keep browser-specific clipboard failures behind one stable caller contract.
  }
  throw new Error('Clipboard copy is unavailable');
}

type TextSelectionElement=HTMLElement&{
  selectionStart?:number|null;
  selectionEnd?:number|null;
  selectionDirection?:'forward'|'backward'|'none'|null;
  setSelectionRange?:(start:number,end:number,direction?:'forward'|'backward'|'none')=>void;
};

function legacyCopyText(text:string):boolean{
  if(typeof document==='undefined'||!document.body||typeof document.execCommand!=='function')return false;

  const active=document.activeElement as TextSelectionElement|null;
  let savedInputSelection:{start:number;end:number;direction:'forward'|'backward'|'none'}|null=null;
  if(active&&typeof active.setSelectionRange==='function'){
    try{
      const start=active.selectionStart;
      const end=active.selectionEnd;
      if(typeof start==='number'&&typeof end==='number'){
        savedInputSelection={
          start,
          end,
          direction:active.selectionDirection==='forward'||active.selectionDirection==='backward'
            ?active.selectionDirection:'none'
        };
      }
    }catch{
      // Some input types do not expose a readable selection.
    }
  }

  const selection=document.getSelection();
  const savedRanges:Range[]=[];
  if(selection){
    try{
      for(let index=0;index<selection.rangeCount;index++)savedRanges.push(selection.getRangeAt(index).cloneRange());
    }catch{
      savedRanges.length=0;
    }
  }

  const textarea=document.createElement('textarea');
  textarea.value=text;
  textarea.setAttribute('readonly','');
  textarea.setAttribute('aria-hidden','true');
  textarea.setAttribute('tabindex','-1');
  textarea.style.position='fixed';
  textarea.style.top='0';
  textarea.style.left='-9999px';
  textarea.style.opacity='0';
  textarea.style.pointerEvents='none';
  textarea.style.fontSize='16px';
  document.body.appendChild(textarea);

  let copied=false;
  try{
    textarea.focus({preventScroll:true});
    textarea.select();
    textarea.setSelectionRange(0,textarea.value.length);
    copied=document.execCommand('copy');
  }catch{
    copied=false;
  }finally{
    textarea.remove();
    if(active?.isConnected){
      try{
        active.focus({preventScroll:true});
      }catch{
        try{active.focus();}catch{}
      }
      if(savedInputSelection){
        try{
          active.setSelectionRange?.(
            savedInputSelection.start,
            savedInputSelection.end,
            savedInputSelection.direction
          );
        }catch{
          // Focus restoration is best-effort for browser-specific controls.
        }
      }
    }
    if(selection&&savedRanges.length){
      try{
        selection.removeAllRanges();
        for(const range of savedRanges)selection.addRange(range);
      }catch{
        // The original selection may no longer be restorable after DOM changes.
      }
    }
  }
  return copied;
}

export function copyTextToClipboard(text:string):Promise<void>{
  let writeText:ClipboardWrite|null=null;
  try{
    if(typeof navigator!=='undefined'&&typeof navigator.clipboard?.writeText==='function'){
      writeText=navigator.clipboard.writeText.bind(navigator.clipboard);
    }
  }catch{
    // Insecure contexts and some embedded browsers can throw while reading clipboard.
  }
  return copyTextWithFallback(text,writeText,legacyCopyText);
}
