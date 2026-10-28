'use client';
import { useRef, useState } from "react";

/* A hand-drawn, 4px-grid pixel kitten. Interaction is atomic:
   once awake it ignores every click until the full animation ends. */
export default function SleepyPixelCat(){
 const [awake,setAwake]=useState(false);
 const locked=useRef(false);
 function awaken(){
   if(locked.current)return;
   locked.current=true;setAwake(true);
 }
 return <div className="cat-habitat"><button
   className={"pixel-cat-button"+(awake?" is-awake":"")}
   type="button" aria-label={awake?"Котик просыпается":"Погладить спящего пиксельного кота"}
   title={awake?"Котик смотрит по сторонам…":"Погладить котика"} onClick={awaken} disabled={awake}>
  <svg className="pixel-cat" viewBox="0 0 148 106" width="148" height="106" shapeRendering="crispEdges" aria-hidden="true">
   <ellipse cx="75" cy="91" rx="59" ry="5" fill="#ddd"/>
   <g className="cat-tail" fill="#2e2e2e">
    <path d="M110 72h12v-5h10v-16h-7v11h-13v5h-9z"/>
    <rect x="125" y="47" width="6" height="5" fill="#777"/>
    <rect x="130" y="50" width="5" height="5" fill="#555"/>
   </g>
   <g className="cat-body">
    <path fill="#222" d="M34 58h8v-9h9v-8h48v7h10v9h10v20h-6v8H39v-6h-9V64h4z"/>
    <path fill="#444" d="M44 48h13v-4h35v4h12v8H44z"/>
    <rect x="47" y="53" width="8" height="4" fill="#5c5c5c"/>
    <rect x="63" y="46" width="5" height="8" fill="#757575"/>
    <rect x="86" y="48" width="6" height="10" fill="#595959"/>
    <rect x="98" y="62" width="7" height="8" fill="#515151"/>
    <rect x="44" y="72" width="67" height="7" fill="#414141"/>
    <rect x="57" y="78" width="13" height="7" fill="#242424"/>
    <rect x="89" y="78" width="13" height="7" fill="#242424"/>
    <rect x="61" y="84" width="10" height="3" fill="#666"/>
    <rect x="91" y="84" width="10" height="3" fill="#666"/>
   </g>
   <g className="cat-head" onAnimationEnd={e=>{
     if(e.animationName==="ik-cat-awaken"){locked.current=false;setAwake(false);}
   }}>
    <path fill="#272727" d="M18 45h8V30h7V20h10v9h8v-4h12v4h8V20h10v10h7v15h6v26h-8v8H30v-7h-9V55h-3z"/>
    <path fill="#565656" d="M29 28h5v-4h5v11H29zM74 26h4v-3h3v14h-7z"/>
    <path fill="#444" d="M27 46h57v7H27z"/>
    <rect fill="#707070" x="39" y="41" width="6" height="4"/>
    <rect fill="#717171" x="61" y="39" width="8" height="4"/>
    <path fill="#515151" d="M24 56h10v7h-6v7h-4zM80 57h9v11h-6v-5h-3z"/>
    <rect fill="#777" x="44" y="69" width="23" height="5"/>
    <path className="cat-sleeping-eyes" d="M35 58h6v2h6v-2h3M60 58h6v2h6v-2h3" fill="none" stroke="#d5d5d5" strokeWidth="2"/>
    <g className="cat-awake-eyes">
      <rect x="34" y="55" width="15" height="13" fill="#f9f9f9"/>
      <rect x="61" y="55" width="15" height="13" fill="#f9f9f9"/>
      <g className="cat-pupils" fill="#101010">
        <rect x="39" y="57" width="5" height="9"/>
        <rect x="66" y="57" width="5" height="9"/>
      </g>
      <rect x="39" y="57" width="2" height="3" fill="#fff"/>
      <rect x="66" y="57" width="2" height="3" fill="#fff"/>
    </g>
    <path fill="#999" d="M52 67h7v3h-2v3h-3v-3h-2z"/>
    <path fill="none" stroke="#b6b6b6" strokeWidth="1.5" d="M55 73v3h-5m5 0h5"/>
    <path stroke="#777" strokeWidth="1.5" d="M19 67h14M20 72h12M77 67h15M78 72h13"/>
    <rect x="30" y="75" width="5" height="3" fill="#333"/>
   </g>
   <g fill="#b5b5b5" className="cat-sleep-z">
     <rect x="100" y="30" width="13" height="3"/><rect x="109" y="33" width="4" height="3"/><rect x="105" y="36" width="4" height="3"/><rect x="101" y="39" width="13" height="3"/>
     <rect x="120" y="20" width="9" height="2"/><rect x="126" y="22" width="3" height="2"/><rect x="122" y="24" width="3" height="2"/><rect x="120" y="26" width="9" height="2"/>
   </g>
  </svg>
 </button><span className="cat-hint">{awake?"ш-ш-ш…":"тише, он спит"}</span></div>;
}
