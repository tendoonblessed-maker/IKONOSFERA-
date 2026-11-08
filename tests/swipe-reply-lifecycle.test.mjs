import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../components/SwipeReplyMessage.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{
  module:ts.ModuleKind.CommonJS,
  target:ts.ScriptTarget.ES2022,
  jsx:ts.JsxEmit.ReactJSX
 }
}).outputText;

function harness(initialProps){
 const hooks=[];
 let hookIndex=0;
 let props=initialProps;
 let nextTimer=1;
 const timers=new Map();
 const menuCalls=[];
 const schedule=(fn,ms)=>{
  const id=nextTimer++;
  timers.set(id,{fn,ms});
  return id;
 };
 const windowMock={
  setTimeout:schedule,
  clearTimeout:id=>timers.delete(id)
 };
 const react={
  useState(initial){
   const index=hookIndex++;
   if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;
   return [hooks[index],value=>{
    hooks[index]=typeof value==='function'?value(hooks[index]):value;
   }];
  },
  useRef(initial){
   const index=hookIndex++;
   if(!(index in hooks))hooks[index]={current:initial};
   return hooks[index];
  },
  useEffect(effect,deps){
   const index=hookIndex++;
   const previous=hooks[index];
   if(previous&&deps&&deps.length===previous.deps.length
      &&deps.every((value,j)=>Object.is(value,previous.deps[j])))return;
   previous?.cleanup?.();
   hooks[index]={deps:deps??[],cleanup:effect()};
  }
 };
 const jsx=(type,elementProps)=>({type,props:elementProps??{}});
 class FakeElement{
  closest(){return null;}
 }
 const exports={};
 vm.runInNewContext(compiled,{
  exports,
  window:windowMock,
  Element:FakeElement,
  Math,
  require(name){
   if(name==='react')return react;
   if(name==='react-swipeable')return {useSwipeable:()=>({})};
   if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('react.fragment')};
   throw Error('Unexpected dependency: '+name);
  }
 },{timeout:2000,filename:'SwipeReplyMessage.test.cjs'});
 const Component=exports.default;
 const render=(nextProps=props)=>{
  props=nextProps;
  hookIndex=0;
  return Component(props);
 };
 const startTouch=tree=>{
  tree.props.onTouchStartCapture({
   target:null,
   touches:[{clientX:10,clientY:20}]
  });
 };
 const pendingHold=()=>{
  const entry=[...timers.entries()].find(([,timer])=>timer.ms===520);
  assert.ok(entry,'long-press timer should be scheduled');
  return {id:entry[0],run:entry[1].fn};
 };
 const unmount=()=>{
  for(const hook of hooks)hook?.cleanup?.();
 };
 return {render,startTouch,pendingHold,timers,menuCalls,unmount};
}

test('a message becoming disabled cancels a pending long-press menu',()=>{
 const h=harness({
  children:'message',className:'message',disabled:false,
  onReply:()=>{},onOpenMenu:()=>h.menuCalls.push('open')
 });
 const first=h.render();
 h.startTouch(first);
 const queued=h.pendingHold();
 assert.equal(h.timers.size,1);

 h.render({...{
  children:'message',className:'message',disabled:true,
  onReply:()=>{},onOpenMenu:()=>h.menuCalls.push('open')
 }});
 assert.equal(h.timers.size,0,'disabled transition clears the pending timer');
 queued.run(); // model a timer callback already queued by the browser
 assert.deepEqual(h.menuCalls,[],'a stale callback must not open actions for a disabled message');
});

test('removing the menu action during a hold prevents calling its stale callback',()=>{
 const h=harness({
  children:'message',className:'message',disabled:false,
  onReply:()=>{},onOpenMenu:()=>h.menuCalls.push('old')
 });
 h.startTouch(h.render());
 const queued=h.pendingHold();

 h.render({
  children:'message',className:'message',disabled:false,
  onReply:()=>{},onOpenMenu:undefined
 });
 queued.run();
 assert.deepEqual(h.menuCalls,[],'the latest render no longer exposes a menu action');
});

test('an unchanged enabled message still opens its menu after the hold threshold',()=>{
 const h=harness({
  children:'message',className:'message',disabled:false,
  onReply:()=>{},onOpenMenu:()=>h.menuCalls.push('open')
 });
 h.startTouch(h.render());
 const queued=h.pendingHold();
 h.timers.delete(queued.id);
 queued.run();
 assert.deepEqual(h.menuCalls,['open']);
});

test('unmount cancels the long-press timer and ignores a queued callback',()=>{
 const h=harness({
  children:'message',className:'message',disabled:false,
  onReply:()=>{},onOpenMenu:()=>h.menuCalls.push('open')
 });
 h.startTouch(h.render());
 const queued=h.pendingHold();
 h.unmount();
 assert.equal(h.timers.size,0);
 queued.run();
 assert.deepEqual(h.menuCalls,[]);
});
