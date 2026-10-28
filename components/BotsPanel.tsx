'use client';
import {useEffect,useState} from "react";
type BotId="days"|"mood";
type Life={birth:string;years:number;lastSeen:string};
const questions=[
"Мне было трудно расслабиться.","Я чувствовал(а) себя бодро и энергично.","Я часто тревожился(ась) без понятной причины.","Мне удавалось получать удовольствие от обычных вещей.","Мне было трудно заснуть или хорошо выспаться.","Я чувствовал(а) поддержку окружающих.","Мне было сложно сосредоточиться.","Я ощущал(а) спокойствие.","Я часто чувствовал(а) усталость.","У меня было желание общаться с людьми.","Я раздражался(ась) чаще обычного.","Мне было легко справляться с повседневными делами.","Меня беспокоили мысли о будущем.","Я находил(а) время для отдыха.","В целом я был(а) доволен(на) своим самочувствием."
];
const reverse=new Set([1,3,5,7,9,11,13,14]);
const dayMs=86400000;
function utcDay(date:Date){return Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());}
function remaining(birth:string,years:number){const d=new Date(birth+"T12:00:00");if(Number.isNaN(d.getTime()))return null;const end=new Date(d);end.setFullYear(d.getFullYear()+years);return Math.ceil((utcDay(end)-utcDay(new Date()))/dayMs);}
const today=()=>new Date().toLocaleDateString("sv-SE");
export default function BotsPanel({userId,bot,onBack}:{userId:string;bot:BotId;onBack:()=>void}){
 const key="ikonosfera-bot-days-"+userId;
 const [life,setLife]=useState<Life|null>(null);
 const [birth,setBirth]=useState("");const [years,setYears]=useState(85);
 const [answers,setAnswers]=useState<number[]>([]);
 const [result,setResult]=useState<string|null>(null);
 const [now,setNow]=useState(today());
 useEffect(()=>{try{const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw) as Life;setLife(parsed);setBirth(parsed.birth);setYears(parsed.years);}}catch{}},[key]);
 useEffect(()=>{const timer=setInterval(()=>setNow(today()),60000);return()=>clearInterval(timer);},[]);
 const days=life?remaining(life.birth,life.years):null;
 function saveLife(e:React.FormEvent){e.preventDefault();const date=new Date(birth+"T12:00:00");const max=new Date();if(!birth||Number.isNaN(date.getTime())||date>max||date.getFullYear()<1900||years<1||years>130)return;const value={birth,years,lastSeen:today()};localStorage.setItem(key,JSON.stringify(value));setLife(value);}

 return <section className="ik-bot-panel">
 <header className="ik-bot-head"><button type="button" onClick={onBack} aria-label="Назад">‹ Назад</button><span className="ik-bot-face">{bot==="days"?"◷":"✳"}</span><div><strong>{bot==="days"?"Сколько мне осталось?":"Точка равновесия"}</strong><small>Бот IKONOSFERA</small></div></header>
 <div className="ik-bot-thread" key={bot}>
 {bot==="days"?<><div className="ik-bot-bubble">Привет! Укажи дату рождения и возраст, до которого ты планируешь прожить. Я буду показывать, сколько дней осталось до выбранной даты. Это только твой личный ориентир, не прогноз продолжительности жизни.</div>
 {life&&days!==null&&<><div className="ik-bot-date">{now}</div><div className="ik-bot-bubble">На сегодня до выбранной даты <b>{days>0?days.toLocaleString("ru-RU")+" дн.":days===0?"0 дней":"дата уже прошла"}</b>. Каждый новый день при открытии бота счётчик обновляется. Береги своё время 💛</div></>}
 <form className="ik-bot-card" onSubmit={saveLife}><strong>{life?"Изменить расчёт":"Настроить счётчик"}</strong><label>Дата рождения<input required type="date" value={birth} max={today()} onChange={e=>setBirth(e.target.value)}/></label><label>Планируемый возраст<input required type="number" min={1} max={130} value={years} onChange={e=>setYears(Number(e.target.value))}/></label><button type="submit">Сохранить</button><small>Данные хранятся только в этом браузере. Автоматические push-уведомления пока не подключены.</small></form></>:
 <><div className="ik-bot-bubble">Привет! Это короткий опрос из 15 вопросов о твоём самочувствии за последние две недели. Он не ставит диагноз и не заменяет консультацию специалиста. Ответы остаются на этом устройстве.</div>
 {result?<div className="ik-bot-card"><strong>Твоё самочувствие</strong><p>{result}</p><small>Это ориентировочная оценка, а не медицинское заключение.</small><button type="button" onClick={()=>{setAnswers([]);setResult(null);}}>Пройти снова</button></div>:
 <div className="ik-bot-card"><div className="ik-bot-progress">Вопрос {Math.min(answers.length+1,15)} из 15</div><strong>{questions[answers.length]??"Готово!"}</strong><div className="ik-bot-answers">{["Никогда","Редко","Иногда","Часто"].map((label,i)=><button type="button" key={label} onClick={()=>{const next=[...answers,i];setAnswers(next);if(next.length===15){const score=next.reduce((sum,v,j)=>sum+(reverse.has(j)?3-v:v),0);setResult(score<=11?"В целом ответы указывают на относительно спокойное самочувствие.":score<=25?"В ответах заметно некоторое напряжение. Обрати внимание на отдых и поддержку.":"Ответы могут говорить о заметном эмоциональном напряжении. Стоит обсудить своё состояние с близким или специалистом.");}}}>{label}</button>)}</div>{answers.length>0&&<button type="button" className="ik-bot-back" onClick={()=>setAnswers(a=>a.slice(0,-1))}>← Предыдущий вопрос</button>}</div>}
 </>}
 </div></section>;
}
