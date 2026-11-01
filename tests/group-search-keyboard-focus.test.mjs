import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function renderSearchPanel(onClose){
 const code=ts.transpileModule(source('components/GroupSearchPanel.tsx'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const exports={};
 const jsx=(type,props,key)=>({type,props,key});
 const context={exports,require(name){
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='@/lib/group-search')return {normalizeGroupSearch:q=>q.trim()};
  throw Error('Unexpected import: '+name);
 }};
 vm.runInNewContext(code,context,{timeout:2500});
 return exports.default({
  query:'hello',onQueryChange:()=>{},onClose,results:[],
  loading:false,error:'',hasMore:false,onMore:()=>{},onOpen:()=>{},
  locatingId:null,ownerId:'owner',names:{}
 });
}

function keyboardEvent(key,isComposing=false){
 let prevented=0,stopped=0;
 return {
  key,nativeEvent:{isComposing},
  preventDefault(){prevented++;},
  stopPropagation(){stopped++;},
  get prevented(){return prevented;},
  get stopped(){return stopped;}
 };
}

test('Escape dismisses group search and stops the event reaching chat shortcuts',()=>{
 let closed=0;
 const panel=renderSearchPanel(()=>closed++);
 assert.equal(panel.type,'section');
 const event=keyboardEvent('Escape');
 panel.props.onKeyDown(event);
 assert.equal(closed,1);
 assert.equal(event.prevented,1);
 assert.equal(event.stopped,1);
});

test('Escape during IME composition leaves group search open',()=>{
 let closed=0;
 const panel=renderSearchPanel(()=>closed++);
 const event=keyboardEvent('Escape',true);
 panel.props.onKeyDown(event);
 assert.equal(closed,0);
 assert.equal(event.prevented,0);
 assert.equal(event.stopped,0);
});

test('normal typing and other keyboard shortcuts do not dismiss group search',()=>{
 let closed=0;
 const panel=renderSearchPanel(()=>closed++);
 for(const key of ['Enter','Tab','a','ArrowDown']){
  const event=keyboardEvent(key);
  panel.props.onKeyDown(event);
  assert.equal(event.prevented,0);
  assert.equal(event.stopped,0);
 }
 assert.equal(closed,0);
});

test('manual close restores focus to the persistent search trigger without scrolling',()=>{
 const panel=source('components/GroupPanel.tsx');
 assert.match(panel,/const searchTriggerRef=useRef<HTMLButtonElement\|null>\(null\)/);
 assert.match(panel,/<button ref=\{searchTriggerRef\} type="button" className="ik-group-search-trigger"/);
 assert.match(panel,/function closeSearch\(restoreFocus=true\)/);
 assert.match(panel,/if\(restoreFocus\)searchTriggerRef\.current\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(panel,/onClose=\{closeSearch\}/);
});

test('jumping from search moves focus to the real message, not back to header',()=>{
 const panel=source('components/GroupPanel.tsx');
 assert.match(panel,/setPendingSearchJump\(message\.id\);[\s\S]*?closeSearch\(false\);/);
 assert.match(panel,/data-group-message-id=\{m\.id\} tabIndex=\{-1\}/);
 assert.match(panel,/target\.focus\(\{preventScroll:true\}\);[\s\S]*?setPendingSearchJump\(null\)/);
 assert.match(panel,/target\.classList\.add\('ik-group-search-target'\)/);
});
