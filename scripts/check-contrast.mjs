// WCAG 2.x AA contrast audit for the active light messenger themes.
// Reads semantic tokens from the actual CSS so CI cannot silently drift to an old palette.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const MINIMUM=4.5;

function normalizeHex(value){
  if(typeof value!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)){
    throw new TypeError('Expected a 3- or 6-digit hex color: '+String(value));
  }
  const raw=value.slice(1);
  return '#'+(raw.length===3?[...raw].map(char=>char+char).join(''):raw).toLowerCase();
}

export function relativeLuminance(hex){
  const color=normalizeHex(hex);
  const channels=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16)/255)
    .map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4);
  return channels.reduce((sum,channel,index)=>sum+channel*[0.2126,0.7152,0.0722][index],0);
}

export function contrastRatio(foreground,background){
  const a=relativeLuminance(foreground),b=relativeLuminance(background);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

function extractVariables(source,pattern,label,selectLast=false){
  const matches=[...source.matchAll(pattern)];
  const match=selectLast?matches.at(-1):matches[0];
  if(!match)throw new Error('Cannot find CSS token block: '+label);
  return Object.fromEntries([...match[1].matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,6})\b/gi)]
    .map(item=>[item[1],item[2]]));
}

function required(tokens,name,label){
  const value=tokens[name];
  if(!value)throw new Error('Missing '+name+' in '+label);
  return value;
}

export function auditTheme(globals,softTheme){
  const root=extractVariables(globals,/:root\s*\{([^}]*)\}/,'root theme');
  const authenticated=extractVariables(globals,/\.messenger\.is-authenticated\s*\{([^}]*)\}/g,'authenticated theme',true);
  const soft=extractVariables(softTheme,/\.messenger\.is-authenticated\s*\{([^}]*)\}/,'soft theme');
  const checks=[];
  const failures=[];
  const add=(label,foreground,background)=>{
    const value=contrastRatio(foreground,background);
    const check={label,ratio:value,minimum:MINIMUM,pass:value>=MINIMUM};
    checks.push(check);
    if(!check.pass)failures.push(check);
  };
  const textNames=['--text','--secondary','--subdued','--accent'];
  const surfaceNames=['--bg','--layer','--raised','--raised-2'];
  for(const [label,tokens] of [['base',root],['authenticated',authenticated]]){
    for(const textName of textNames){
      const foreground=required(tokens,textName,label);
      for(const surfaceName of surfaceNames){
        add(label+' '+textName+' on '+surfaceName,foreground,required(tokens,surfaceName,label));
      }
    }
    add(label+' white text on --accent','#ffffff',required(tokens,'--accent',label));
  }
  const softSurfaces=['--ik-soft-bg','--ik-soft-panel','--ik-soft-blue-pale'];
  for(const textName of ['--ik-soft-ink','--ik-soft-muted','--ik-soft-blue']){
    const foreground=required(soft,textName,'soft theme');
    for(const surfaceName of softSurfaces){
      add('soft '+textName+' on '+surfaceName,foreground,required(soft,surfaceName,'soft theme'));
    }
  }
  add('soft white text on --ik-soft-blue','#ffffff',required(soft,'--ik-soft-blue','soft theme'));
  return {checks,failures};
}

function run(){
  const root=new URL('../',import.meta.url);
  const globals=readFileSync(new URL('app/globals.css',root),'utf8');
  const softTheme=readFileSync(new URL('app/light-telegram-theme.css',root),'utf8');
  const {checks,failures}=auditTheme(globals,softTheme);
  for(const check of checks){
    console.log(check.label+': '+check.ratio.toFixed(2)+':1 '+(check.pass?'PASS':'FAIL'));
  }
  console.log('WCAG AA text contrast: '+(failures.length?'FAIL':'PASS')+' ('+checks.length+' pairs)');
  if(failures.length)process.exitCode=1;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  run();
}
