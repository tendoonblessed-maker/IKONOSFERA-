import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const VALID='abcdefab-cdef-4abc-8def-abcdefabcdef';
const SECOND='01234567-89ab-4cde-8fab-0123456789ab';
const INVALID=[
  '-'.repeat(36),
  '1'.repeat(36),
  'abcdefab--cdef-4abc-8def-abcdefabcdef',
  'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz'
];
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function setup(handler=async()=>({ok:true,json:async()=>[]})){
  const source=read('lib/social.ts');
  const compiled=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const calls=[];
  const exports={};
  const context={
    exports,
    process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
    fetch:async(url,options)=>{
      calls.push({url,options});
      return handler(url,options,calls.length);
    },
    require(name){
      assert.equal(name,'@/lib/supabase-rest');
      return {apiUrl:'https://unit.test'};
    }
  };
  vm.runInNewContext(compiled,context,{timeout:2000,filename:'social.cjs'});
  return {api:exports,calls};
}

test('contact story lookup rejects malformed UUIDs and deduplicates case-insensitively',async()=>{
  const {api,calls}=setup();
  const result=await api.getContactsStories('signed-user-jwt',[
    VALID,VALID.toUpperCase(),...INVALID,SECOND
  ]);
  assert.deepEqual(Array.from(result),[]);
  assert.equal(calls.length,1);
  const url=new URL(calls[0].url);
  assert.equal(url.pathname,'/rest/v1/stories');
  assert.equal(url.searchParams.get('user_id'),`in.(${VALID},${SECOND})`);
  assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
  assert.equal(calls[0].options.cache,'no-store');
});

test('channel subscriber RPC receives only canonical unique channel UUIDs',async()=>{
  let body=null;
  const {api,calls}=setup(async(_url,options)=>({
    ok:true,
    json:async()=>{
      body=JSON.parse(options.body);
      return [{channel_id:VALID,subscribers:7}];
    }
  }));
  const counts=await api.getChannelSubscriberCounts('signed-user-jwt',[
    VALID,VALID.toUpperCase(),...INVALID,SECOND
  ]);
  assert.deepEqual(body,{p_ids:[VALID,SECOND]});
  assert.deepEqual({...counts},{[VALID]:7});
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
});

test('malformed selected channel IDs fail closed without a network request',async()=>{
  const {api,calls}=setup();
  for(const id of INVALID)assert.equal(await api.getChannelById('jwt',id),null);
  assert.equal(calls.length,0);
});

test('canonical selected channel IDs still use the authenticated scoped query',async()=>{
  const {api,calls}=setup();
  assert.equal(await api.getChannelById('signed-user-jwt',VALID),null);
  assert.equal(calls.length,1);
  const url=new URL(calls[0].url);
  assert.equal(url.pathname,'/rest/v1/channels');
  assert.equal(url.searchParams.get('id'),'eq.'+VALID);
  assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
});

const THIRD='fedcba98-7654-4321-8abc-fedcba987654';
const FOURTH='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UNREQUESTED='99999999-8888-4777-8666-555555555555';

test('channel subscriber counts fail closed on malformed and unrequested RPC rows',async()=>{
  const {api,calls}=setup(async()=>({
    ok:true,
    json:async()=>[
      {channel_id:VALID,subscribers:7},
      {channel_id:SECOND,subscribers:'12'},
      {channel_id:THIRD,subscribers:-1},
      {channel_id:FOURTH,subscribers:'1.5'},
      {channel_id:VALID,subscribers:99},
      {channel_id:UNREQUESTED,subscribers:4},
      {channel_id:'not-a-uuid',subscribers:2},
      null,
      {channel_id:THIRD,subscribers:'9007199254740992'},
      {channel_id:FOURTH,subscribers:true}
    ]
  }));
  const counts=await api.getChannelSubscriberCounts('signed-user-jwt',[VALID,SECOND,THIRD,FOURTH]);
  assert.deepEqual({...counts},{[VALID]:7,[SECOND]:12});
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
});

test('channel subscriber counts return an empty map for a non-array RPC response',async()=>{
  const {api,calls}=setup(async()=>({ok:true,json:async()=>({unexpected:true})}));
  assert.deepEqual({...await api.getChannelSubscriberCounts('jwt',[VALID])},{});
  assert.equal(calls.length,1);
});


test('invalid-only social ID batches avoid empty PostgREST requests',async()=>{
  const {api,calls}=setup();
  assert.deepEqual(Array.from(await api.getContactsStories('jwt',INVALID)),[]);
  assert.deepEqual({...await api.getChannelSubscriberCounts('jwt',INVALID)},{});
  assert.equal(calls.length,0);
});
