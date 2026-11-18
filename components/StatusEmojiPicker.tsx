'use client';
import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import StatusEmoji,{STATUS_EMOJI_COUNT,STATUS_EMOJI_NAMES} from '@/components/StatusEmoji';
import {getStatusEmojiGridTarget} from '@/lib/status-emoji-grid';

type Props={value:number|null;disabled?:boolean;onSelect:(index:number|null)=>void};

function selectedButtonIndex(value:number|null):number{
 return value!==null&&Number.isInteger(value)&&value>=0&&value<STATUS_EMOJI_COUNT?value+1:0;
}

export default function StatusEmojiPicker({value,disabled=false,onSelect}:Props){
 const [tabStopIndex,setTabStopIndex]=useState(()=>selectedButtonIndex(value));
 const buttonRefs=useRef<Array<HTMLButtonElement|null>>([]);

 useEffect(()=>{setTabStopIndex(selectedButtonIndex(value));},[value]);

 function handleGridKeyDown(event:KeyboardEvent<HTMLButtonElement>,index:number){
  const grid=event.currentTarget.parentElement;
  if(!grid)return;
  const columns=window.getComputedStyle(grid).gridTemplateColumns.split(/\\s+/).filter(Boolean).length||8;
  const next=getStatusEmojiGridTarget(index,event.key,STATUS_EMOJI_COUNT+1,columns);
  if(next===null||next===index)return;
  const target=buttonRefs.current[next];
  if(!target||target.disabled)return;
  event.preventDefault();
  setTabStopIndex(next);
  target.focus();
 }

 return <div className="ik-status-picker" role="group" aria-label="Выбрать эмодзи статуса">
    <div className="ik-status-picker-intro">
      <div><strong>Эмодзи-статус</strong><span>Маленькая фигурка рядом с твоим именем</span></div>
      {value!==null&&<StatusEmoji index={value} size="large" decorative/>}
    </div>
    <div className="ik-status-picker-grid">
      <button type="button" ref={node=>{buttonRefs.current[0]=node;}}
       tabIndex={tabStopIndex===0?0:-1}
       onKeyDown={event=>handleGridKeyDown(event,0)}
       className={'ik-status-choice ik-status-none'+(value===null?' is-selected':'')}
       aria-label="Убрать эмодзи-статус" aria-pressed={value===null} disabled={disabled}
       onClick={()=>{setTabStopIndex(0);onSelect(null);}}>
       <span aria-hidden="true">✕</span>
      </button>
      {Array.from({length:STATUS_EMOJI_COUNT},(_,i)=><button
        type="button" key={i}
        ref={node=>{buttonRefs.current[i+1]=node;}}
        tabIndex={tabStopIndex===i+1?0:-1}
        onKeyDown={event=>handleGridKeyDown(event,i+1)}
        className={'ik-status-choice'+(value===i?' is-selected':'')}
        aria-label={'Поставить статус '+STATUS_EMOJI_NAMES[i]}
        aria-pressed={value===i} disabled={disabled}
        title={STATUS_EMOJI_NAMES[i]}
        onClick={()=>{setTabStopIndex(i+1);onSelect(i);}}>
        <StatusEmoji index={i} size="picker" decorative/>
      </button>)}
    </div>
    <p className="ik-status-picker-help">Выбранную фигурку будут видеть другие пользователи рядом с твоим именем. Используй стрелки для перехода между вариантами, Home и End — для начала и конца списка.</p>
  </div>;
}
