import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const OWNER='11111111-1111-4111-8111-111111111111';
const FILE='22222222-2222-4222-8222-222222222222';
const path=ext=>OWNER+'/'+FILE+'.'+ext;
const bucket='https://unit-test.invalid/storage/v1/object/public/ikonosfera-media/';

function social(){
 const code=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{
   exports,process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-key'}},
   require(name){
    assert.equal(name,'@/lib/supabase-rest');
    return {apiUrl:'https://unit-test.invalid'};
   }
 },{timeout:2000});
 return exports;
}

test('only actual image types are accepted by the existing image URL helper',()=>{
 const api=social();
 for(const ext of ['jpg','png','webp']){
  assert.equal(api.imageUrl(path(ext)),bucket+path(ext));
 }
 for(const ext of ['mp4','webm','mov','ogg','mp3','m4a','pdf','zip','docx']){
  assert.equal(api.imageUrl(path(ext)),null);
 }
});

test('channel video URLs work for all formats emitted by the uploader',()=>{
 const api=social();
 for(const ext of ['mp4','webm','mov']){
  assert.equal(api.channelAttachmentUrl(path(ext),'video'),bucket+path(ext));
 }
});

test('channel audio URLs work for every supported audio upload format',()=>{
 const api=social();
 for(const ext of ['mp3','m4a','wav','ogg']){
  assert.equal(api.channelAttachmentUrl(path(ext),'audio'),bucket+path(ext));
 }
});

test('channel document download URLs work for every supported file format',()=>{
 const api=social();
 for(const ext of ['pdf','txt','zip','doc','docx','xls','xlsx']){
  assert.equal(api.channelAttachmentUrl(path(ext),'file'),bucket+path(ext));
 }
});

test('channel image attachments retain safe image URLs',()=>{
 const api=social();
 for(const ext of ['jpg','png','webp']){
  assert.equal(api.channelAttachmentUrl(path(ext),'image'),bucket+path(ext));
 }
});

test('the upload MIME whitelist produces extensions accepted by the matching URL kind',()=>{
 const code=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
 const match=code.match(/export async function uploadChannelAttachment[\s\S]*?const allowed:Record<string,string>=(\{[^;]+?\});/);
 assert.ok(match,'attachment MIME whitelist must remain discoverable');
 const supported=JSON.parse(match[1]);
 const api=social();
 for(const [mime,ext] of Object.entries(supported)){
  const type=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'file';
  assert.equal(api.channelAttachmentUrl(path(ext),type),bucket+path(ext),mime);
 }
});

test('a file cannot be presented as a video/audio/image by forging the DB type',()=>{
 const api=social();
 for(const [ext,type] of [
  ['pdf','image'],['docx','video'],['mp4','image'],['png','audio'],
  ['zip','video'],['ogg','file'],['mp3','video'],['webm','audio']
 ]){
  assert.equal(api.channelAttachmentUrl(path(ext),type),null,ext+' '+type);
 }
});

test('malformed or external references never become a public storage URL',()=>{
 const api=social();
 for(const invalid of [
  undefined,null,'','/etc/passwd','https://evil.test/x.mp4','//evil.test/path.mp4',
  '../'+path('mp4'),OWNER+'/../'+FILE+'.mp4',
  OWNER+'/'+FILE+'.mp4?redirect=x',OWNER+'/'+FILE+'.mp4#fragment',
  OWNER+'/%2e%2e/'+FILE+'.mp4',OWNER+'/'+FILE+'.svg',
  OWNER+'/not-a-uuid.mp4','wrong-folder/'+FILE+'.mp4',
  OWNER+'/'+FILE+'.mp4/extra',OWNER+'/'+FILE+'.mp4\nx'
 ]){
  assert.equal(api.channelAttachmentUrl(invalid,'video'),null,String(invalid));
 }
});

test('invalid post media types do not bypass the extension allowlist',()=>{
 const api=social();
 assert.equal(api.channelAttachmentUrl(path('pdf'),undefined),null);
 assert.equal(api.channelAttachmentUrl(path('pdf'),null),null);
 assert.equal(api.channelAttachmentUrl(path('pdf'),'__proto__'),null);
 assert.equal(api.channelAttachmentUrl(path('mp4'),'unknown'),null);
});

test('the renderer references verified URLs and never offers a dead # link',()=>{
 const panel=readFileSync(new URL('../components/ChannelsPanel.tsx',import.meta.url),'utf8');
 for(const [type,element] of [['image','img'],['video','video'],['audio','audio'],['file','a']]){
  assert.ok(panel.includes('post.attachment_type==="'+type+'"&&channelAttachmentUrl(post.attachment_path,"'+type+'")'),type);
  assert.match(panel,new RegExp('<'+element+' className="channel-[^"]+"'));
 }
 assert.doesNotMatch(panel,/src=\{imageUrl\(post\.attachment_path\)/);
 assert.doesNotMatch(panel,/href=\{imageUrl\(post\.attachment_path\)\|\|"#"\}/);
 assert.match(panel,/href=\{channelAttachmentUrl\(post\.attachment_path,"file"\)!\}/);
 assert.match(panel,/rel="noopener noreferrer"/);
});
