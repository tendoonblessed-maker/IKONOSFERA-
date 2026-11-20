import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {formatUnreadBadge} from '../lib/unread-count.mjs';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('direct and group inbox rows use the shared unread badge formatter',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/formatUnreadBadge\(preview\?\.unread_count\)/);
 assert.match(group,/formatUnreadBadge\(overview\?\.unread_count\)/);
 assert.match(direct,/aria-describedby=\{unreadDescriptionId\}/);
 assert.match(group,/aria-describedby=\{unreadDescriptionId\}/);
 assert.match(direct,/\{unreadBadge\.visible\}/);
 assert.match(group,/\{unreadBadge\.visible\}/);
});

test('direct and group rows expose full unread counts through described text',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/id=\{unreadDescriptionId\} className="ik-visually-hidden">\{unreadBadge\.ariaLabel\}/);
 assert.match(group,/id=\{unreadDescriptionId\} className="ik-visually-hidden">\{unreadBadge\.ariaLabel\}/);
 assert.match(direct,/className="ik-unread-count" aria-hidden="true"/);
 assert.match(group,/className="ik-unread-count" aria-hidden="true"/);
});

test('direct and group inbox rows preserve the exact accessible count when visual text is capped',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/\{unreadBadge\.visible\}/);
 assert.match(group,/\{unreadBadge\.visible\}/);
});

test('unread descriptions use stable per-conversation identifiers',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/`direct-unread-\$\{chat\.id\}`/);
 assert.match(group,/`group-unread-\$\{group\.id\}`/);
});


function compileInboxRow(path){
 const source=load(path);
 const compiled=ts.transpileModule(source,{
  compilerOptions:{
   target:ts.ScriptTarget.ES2022,
   module:ts.ModuleKind.CommonJS,
   jsx:ts.JsxEmit.ReactJSX
  }
 });
 const module={exports:{}};
 const jsxRuntime={
  jsx:(type,props,key)=>({type,props:props??{},key}),
  jsxs:(type,props,key)=>({type,props:props??{},key}),
  Fragment:Symbol.for('react.fragment')
 };
 const mockedRequire=specifier=>{
  if(specifier==='react/jsx-runtime')return jsxRuntime;
  if(specifier==='@/lib/unread-count.mjs')return {formatUnreadBadge};
  if(specifier==='@/lib/social')return {imageUrl:()=>null};
  if(specifier==='@/components/FloatingActionMenu')return {default:()=>null};
  if(specifier==='@/components/StatusEmoji')return {default:()=>null};
  throw Error('Unexpected inbox row dependency: '+specifier);
 };
 vm.runInNewContext(compiled.outputText,{module,exports:module.exports,require:mockedRequire},{filename:path});
 return module.exports.default;
}

function findNode(root,predicate){
 const pending=[root];
 while(pending.length){
  const node=pending.shift();
  if(!node||typeof node!=='object')continue;
  if(predicate(node))return node;
  const children=node.props?.children;
  if(Array.isArray(children))pending.push(...children);
  else if(children!==undefined)pending.push(children);
 }
 return null;
}

function directRow(unread){
 const ChatInboxRow=compileInboxRow('components/ChatInboxRow.tsx');
 return ChatInboxRow({
  row:{
   chat:{id:'direct-123',pinned_for:[]},
   other:{display_name:'Alice',avatar_path:null},
   preview:{unread_count:unread,last_body:'Hello',last_sender_id:'other',last_created_at:null}
  },
  currentUserId:'me',
  active:false,
  onOpen:()=>{},
  onContactAction:()=>{},
  onBlockAction:()=>{},
  onAction:()=>{}
 });
}

function groupRow(unread){
 const GroupInboxRow=compileInboxRow('components/GroupInboxRow.tsx');
 return GroupInboxRow({
  group:{id:'group-123',title:'Test group'},
  overview:{unread_count:unread,last_body:'Hello',last_created_at:null},
  active:false,
  onOpen:()=>{}
 });
}

test('rendered direct and group inbox rows expose full unread counts beyond the visual cap',()=>{
 for(const [tree,id] of [[directRow('123'),'direct-unread-direct-123'],[groupRow(123),'group-unread-group-123']]){
  const button=findNode(tree,node=>node.type==='button'&&String(node.props.className||'').includes('chat-item'));
  const badge=findNode(tree,node=>node.type==='span'&&node.props.className==='ik-unread-count');
  const description=findNode(tree,node=>node.type==='span'&&node.props.className==='ik-visually-hidden');
  assert.ok(button,'the row must render its primary button');
  assert.ok(badge,'the row must render the unread badge');
  assert.ok(description,'the row must render the accessible count description');
  assert.equal(badge.props.children,'99+');
  assert.equal(badge.props['aria-hidden'],'true');
  assert.equal(button.props['aria-describedby'],id);
  assert.equal(description.props.id,id);
  assert.equal(description.props.children,'Непрочитанных: 123');
 }
});

test('rendered inbox rows omit unread badge and description for zero count',()=>{
 for(const tree of [directRow(0),groupRow('0')]){
  const button=findNode(tree,node=>node.type==='button'&&String(node.props.className||'').includes('chat-item'));
  const badge=findNode(tree,node=>node.type==='span'&&node.props.className==='ik-unread-count');
  const description=findNode(tree,node=>node.type==='span'&&node.props.className==='ik-visually-hidden');
  assert.ok(button);
  assert.equal(button.props['aria-describedby'],undefined);
  assert.equal(badge,null);
  assert.equal(description,null);
 }
});

test('unread badge formatter contract remains stable for rendered labels',()=>{
 assert.deepEqual(formatUnreadBadge('123'),{count:123,visible:'99+',ariaLabel:'Непрочитанных: 123'});
 assert.deepEqual(formatUnreadBadge(0),null);
});
