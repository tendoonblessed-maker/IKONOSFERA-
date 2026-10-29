import type {CSSProperties} from 'react';

/** Source atlas: user's 50 original glossy person icons, ten across and five down. */
export const STATUS_EMOJI_COUNT=50;
export const STATUS_EMOJI_NAMES=[
 'Розовый','Малиновый','Рубин','Апельсин','Янтарь','Лимонный','Лайм',
 'Изумруд','Малахит','Бирюза',
 'Голубой','Ледяной','Сапфировый','Индиго','Сиреневый','Фиолетовый',
 'Неоновый','Розовый опал','Коралловый','Перламутр',
 'Жемчуг','Алмаз','Серебро','Оникс','Хром','Золото','Розовое золото','Бронза','Белый жемчуг','Голубой опал',
 'Радужный','Розовые блёстки','Лава','Магма','Золотые искры','Изумрудный камень',
 'Аквамарин','Синяя вода','Космический фиолетовый','Розовое сияние',
 'Ночное небо','Галактика','Облака','Закат','Мята','Опал','Лунный камень','Лаванда','Грозовое небо','Мрамор'
] as const;

export function isStatusEmoji(index:unknown):index is number{
 return typeof index==='number'&&Number.isInteger(index)&&index>=0&&index<STATUS_EMOJI_COUNT;
}

type Props={index:number|null|undefined;size?:'inline'|'large'|'picker';className?:string;decorative?:boolean};

export default function StatusEmoji({index,size='inline',className='',decorative=false}:Props){
 if(!isStatusEmoji(index))return null;
 const col=index%10;
 const row=Math.floor(index/10);
 const style:CSSProperties={backgroundPosition:(col/9*100)+'% '+(row/4*100)+'%'};
 return <span
   className={'ik-status-emoji ik-status-emoji--'+size+' '+className}
   style={style}
   role={decorative?undefined:'img'}
   aria-hidden={decorative?true:undefined}
   aria-label={decorative?undefined:'Статус: '+STATUS_EMOJI_NAMES[index]}
   title={decorative?undefined:STATUS_EMOJI_NAMES[index]}
 />;
}
