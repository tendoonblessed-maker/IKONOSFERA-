'use client';
import {useRef,type KeyboardEvent} from 'react';
import StatusEmoji,{isStatusEmoji,STATUS_EMOJI_COUNT,STATUS_EMOJI_NAMES} from '@/components/StatusEmoji';
import {getNextStatusEmojiFocusIndex} from '@/lib/status-emoji-navigation';

type Props={value:number|null;disabled?:boolean;onSelect:(index:number|null)=>void};

export default function StatusEmojiPicker({value,disabled=false,onSelect}:Props){
 const choiceRefs=useRef<Array<HTMLButtonElement|null>>([]);
 const hasValidStatus=isStatusEmoji(value);
 const noStatusSelected=!hasValidStatus;
 const selectedIndex=hasValidStatus?value+1:0;

 const handleKeyDown=(index:number,event:KeyboardEvent<HTMLButtonElement>)=>{
  const next=getNextStatusEmojiFocusIndex(index,event.key,STATUS_EMOJI_COUNT+1);
  if(next===null)return;
  event.preventDefault();
  choiceRefs.current[next]?.focus();
  onSelect(next===0?null:next-1);
 };

 return <div className="ik-status-picker" role="radiogroup" aria-label="Выбрать эмодзи статуса">
    <div className="ik-status-picker-intro">
      <div><strong>Эмодзи-статус</strong><span>Маленькая фигурка рядом с твоим именем</span></div>
      {hasValidStatus&&<StatusEmoji index={value} size="large" decorative/>}
    </div>
    <div className="ik-status-picker-grid">
      <button type="button" className={'ik-status-choice ik-status-none'+(noStatusSelected?' is-selected':'')}
       ref={element=>{choiceRefs.current[0]=element;}}
       role="radio" aria-checked={noStatusSelected} tabIndex={selectedIndex===0?0:-1}
       aria-label="Убрать эмодзи-статус" disabled={disabled}
       onClick={()=>onSelect(null)} onKeyDown={event=>handleKeyDown(0,event)}>
       <span aria-hidden="true">✕</span>
      </button>
      {Array.from({length:STATUS_EMOJI_COUNT},(_,i)=>{
        const focusIndex=i+1;
        return <button
          type="button" key={i}
          ref={element=>{choiceRefs.current[focusIndex]=element;}}
          role="radio" aria-checked={hasValidStatus&&value===i}
          tabIndex={selectedIndex===focusIndex?0:-1}
          className={'ik-status-choice'+(hasValidStatus&&value===i?' is-selected':'')}
          aria-label={'Поставить статус '+STATUS_EMOJI_NAMES[i]}
          disabled={disabled}
          title={STATUS_EMOJI_NAMES[i]}
          onClick={()=>onSelect(i)}
          onKeyDown={event=>handleKeyDown(focusIndex,event)}>
          <StatusEmoji index={i} size="picker" decorative/>
        </button>;
      })}
    </div>
    <p className="ik-status-picker-help">Выбранную фигурку будут видеть другие пользователи рядом с твоим именем.</p>
  </div>;
}
