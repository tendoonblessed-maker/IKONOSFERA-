'use client';
import StatusEmoji,{STATUS_EMOJI_COUNT,STATUS_EMOJI_NAMES} from '@/components/StatusEmoji';

type Props={value:number|null;disabled?:boolean;onSelect:(index:number|null)=>void};

export default function StatusEmojiPicker({value,disabled=false,onSelect}:Props){
 return <div className="ik-status-picker" role="group" aria-label="Выбрать эмодзи статуса">
    <div className="ik-status-picker-intro">
      <div><strong>Эмодзи-статус</strong><span>Маленькая фигурка рядом с твоим именем</span></div>
      {value!==null&&<StatusEmoji index={value} size="large" decorative/>}
    </div>
    <div className="ik-status-picker-grid">
      <button type="button" className={'ik-status-choice ik-status-none'+(value===null?' is-selected':'')}
       aria-label="Убрать эмодзи-статус" aria-pressed={value===null} disabled={disabled}
       onClick={()=>onSelect(null)}>
       <span aria-hidden="true">✕</span>
      </button>
      {Array.from({length:STATUS_EMOJI_COUNT},(_,i)=><button
        type="button" key={i}
        className={'ik-status-choice'+(value===i?' is-selected':'')}
        aria-label={'Поставить статус '+STATUS_EMOJI_NAMES[i]}
        aria-pressed={value===i} disabled={disabled}
        title={STATUS_EMOJI_NAMES[i]}
        onClick={()=>onSelect(i)}>
        <StatusEmoji index={i} size="picker" decorative/>
      </button>)}
    </div>
    <p className="ik-status-picker-help">Выбранную фигурку будут видеть другие пользователи рядом с твоим именем.</p>
  </div>;
}
