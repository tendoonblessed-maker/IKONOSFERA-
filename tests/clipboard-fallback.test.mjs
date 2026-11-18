import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {copyTextToClipboard} from '../lib/clipboard.ts';

function installBrowser({clipboard,copyResult=true}={}) {
  const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const calls={writeText:[],execCommand:[],removed:false,selected:false,range:null,focused:false};
  const originalActive={isConnected:true,focus(){calls.focused=true;}};
  let documentRef;
  const textarea={
    value:'',
    style:{},
    tabIndex:0,
    isConnected:false,
    setAttribute(name,value){this[name]=value;},
    focus(){documentRef.activeElement=this;},
    select(){calls.selected=true;},
    setSelectionRange(start,end){calls.range=[start,end];},
    remove(){this.isConnected=false;calls.removed=true;documentRef.activeElement=originalActive;}
  };
  const selection={
    rangeCount:0,
    getRangeAt(){return {cloneRange(){return {saved:true};}};},
    removeAllRanges(){},
    addRange(){}
  };
  documentRef={
    activeElement:originalActive,
    body:{appendChild(element){element.isConnected=true;documentRef.activeElement=element;}},
    createElement(tag){assert.equal(tag,'textarea');return textarea;},
    getSelection(){return selection;},
    execCommand(command){calls.execCommand.push(command);return copyResult;}
  };
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:documentRef});
  return {
    calls,textarea,originalActive,
    restore(){
      if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);
      else delete globalThis.navigator;
      if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);
      else delete globalThis.document;
    }
  };
}

test('prefers the asynchronous Clipboard API when it succeeds',async()=>{
  const calls=[];
  const env=installBrowser({clipboard:{writeText:async text=>calls.push(text)}});
  try{
    await copyTextToClipboard('hello');
    assert.deepEqual(calls,['hello']);
    assert.deepEqual(env.calls.execCommand,[]);
    assert.equal(env.calls.removed,false);
  }finally{env.restore();}
});

test('uses a readonly off-screen textarea when the Clipboard API is unavailable',async()=>{
  const env=installBrowser({clipboard:undefined});
  try{
    await copyTextToClipboard('Привет 👋');
    assert.equal(env.textarea.value,'Привет 👋');
    assert.equal(env.textarea.readonly,'');
    assert.equal(env.textarea['aria-hidden'],'true');
    assert.equal(env.textarea.tabIndex,-1);
    assert.equal(env.textarea.style.left,'0');
    assert.deepEqual(env.calls.range,[0,'Привет 👋'.length]);
    assert.deepEqual(env.calls.execCommand,['copy']);
    assert.equal(env.calls.removed,true);
    assert.equal(env.calls.focused,true);
  }finally{env.restore();}
});

test('falls back after a rejected Clipboard API permission request',async()=>{
  const env=installBrowser({clipboard:{writeText:async()=>{throw new Error('denied');}}});
  try{
    await copyTextToClipboard('fallback');
    assert.deepEqual(env.calls.execCommand,['copy']);
    assert.equal(env.calls.removed,true);
  }finally{env.restore();}
});

test('cleans up the temporary element and rejects when the fallback reports failure',async()=>{
  const env=installBrowser({clipboard:undefined,copyResult:false});
  try{
    await assert.rejects(copyTextToClipboard('not copied'),/unavailable/);
    assert.equal(env.calls.removed,true);
    assert.equal(env.calls.focused,true);
  }finally{env.restore();}
});

test('AppShell routes every existing copy action through the shared fallback',()=>{
  const app=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(app,/import \{copyTextToClipboard\} from ["']@\/lib\/clipboard["']/);
  assert.equal((app.match(/copyTextToClipboard\(/g)||[]).length,3);
  assert.doesNotMatch(app,/navigator\.clipboard\.writeText/);
});
