import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

process.env.NEXT_PUBLIC_SUPABASE_URL='https://ikonosfera-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-test-key';
const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
assert.doesNotMatch(source,/^import\s/m,'the REST module stays dependency-free for this isolated contract test');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {listMessages,listOlderMessages,listMessageReactions,listReplyTargets}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const appShell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');

test('private history and reaction GETs forward their lifecycle AbortSignal to fetch',async()=>{
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const historyController=new AbortController();
    const reactionsController=new AbortController();
    await listMessages('test-access-token','11111111-1111-4111-8111-111111111111',historyController.signal);
    await listMessageReactions('test-access-token',['22222222-2222-4222-8222-222222222222'],reactionsController.signal);

    assert.equal(calls.length,2);
    assert.equal(calls[0].options.signal,historyController.signal);
    assert.equal(calls[1].options.signal,reactionsController.signal);
    assert.match(calls[0].url,/\/rest\/v1\/messages\?/);
    assert.match(calls[1].url,/\/rest\/v1\/message_reactions\?/);
    assert.equal(calls[0].options.headers.Authorization,'Bearer test-access-token');
    assert.equal(calls[1].options.headers.Authorization,'Bearer test-access-token');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('aborting a private history lifecycle signal cancels the underlying fetch',async()=>{
  const originalFetch=globalThis.fetch;
  let receivedSignal;
  globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>{
    receivedSignal=options.signal;
    options.signal.addEventListener('abort',()=>{
      const error=new Error('The operation was aborted');
      error.name='AbortError';
      reject(error);
    },{once:true});
  });
  try{
    const controller=new AbortController();
    const pending=listMessages('test-access-token','11111111-1111-4111-8111-111111111111',controller.signal);
    assert.equal(receivedSignal,controller.signal);
    controller.abort();
    await assert.rejects(pending,error=>error?.name==='AbortError');
  }finally{
    globalThis.fetch=originalFetch;
  }
});


test('older direct history forwards its lifecycle AbortSignal and stable cursor',async()=>{
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const controller=new AbortController();
    await listOlderMessages('test-access-token','11111111-1111-4111-8111-111111111111',{
      id:'22222222-2222-4222-8222-222222222222',
      created_at:'2026-11-10T20:00:00.123456+00:00'
    },controller.signal);
    assert.equal(calls.length,1);
    assert.equal(calls[0].options.signal,controller.signal);
    assert.match(calls[0].url,/\/rest\/v1\/messages\?/);
    assert.match(calls[0].url,/created_at\.lt\./);
    assert.match(calls[0].url,/id\.lt\./);
    assert.equal(calls[0].options.headers.Authorization,'Bearer test-access-token');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('aborting an older direct history signal cancels the underlying fetch',async()=>{
  const originalFetch=globalThis.fetch;
  let receivedSignal;
  globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>{
    receivedSignal=options.signal;
    options.signal.addEventListener('abort',()=>{
      const error=new Error('The operation was aborted');
      error.name='AbortError';
      reject(error);
    },{once:true});
  });
  try{
    const controller=new AbortController();
    const pending=listOlderMessages('test-access-token','11111111-1111-4111-8111-111111111111',{
      id:'22222222-2222-4222-8222-222222222222',
      created_at:'2026-11-10T20:00:00.123456+00:00'
    },controller.signal);
    assert.equal(receivedSignal,controller.signal);
    controller.abort();
    await assert.rejects(pending,error=>error?.name==='AbortError');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('older direct history is cancelled on background/offline pause and chat cleanup',()=>{
  assert.match(appShell,/const olderHistoryAbortScopeRef=useRef\(createAbortableRequestScope\(\)\)/);
  assert.match(appShell,/listOlderMessages\(token,chatId,oldest,controller\.signal\)/);
  assert.match(appShell,/document\.visibilityState!=='visible'\|\|!navigator\.onLine\)return/);
  assert.match(appShell,/requestAbortScope\.abort\(\);olderHistoryAbortScopeRef\.current\.abort\(\);/);
  assert.match(appShell,/stopVisiblePolling\(\);requestAbortScope\.abort\(\);olderHistoryAbortScopeRef\.current\.abort\(\);/);
  assert.match(appShell,/document\.visibilityState==='visible'&&navigator\.onLine/);
  assert.match(appShell,/if\(controller\.signal\.aborted\)prependScrollRef\.current=null/);
});


test('aborting a lifecycle-scoped older-page reaction GET cancels the underlying fetch',async()=>{
  const originalFetch=globalThis.fetch;
  let receivedSignal;
  globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>{
    receivedSignal=options.signal;
    options.signal.addEventListener('abort',()=>{
      const error=new Error('The operation was aborted');
      error.name='AbortError';
      reject(error);
    },{once:true});
  });
  try{
    const controller=new AbortController();
    const pending=listMessageReactions('test-access-token',['22222222-2222-4222-8222-222222222222'],controller.signal);
    assert.equal(receivedSignal,controller.signal);
    controller.abort();
    await assert.rejects(pending,error=>error?.name==='AbortError');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('older-page reaction reads have independent scopes and are aborted on chat pause and cleanup',()=>{
  assert.match(appShell,/olderReactionAbortScopesRef=useRef<Set<ReturnType<typeof createAbortableRequestScope>>>\(new Set\(\)\)/);
  assert.match(appShell,/const reactionScope=createAbortableRequestScope\(\)/);
  assert.match(appShell,/listMessageReactions\(token,older\.map\(message=>message\.id\),reactionController\.signal\)/);
  assert.match(appShell,/if\(!stillInChat\(\)\|\|reactionController\.signal\.aborted\)return/);
  assert.match(appShell,/reactionScope\.clear\(reactionController\)/);
  assert.match(appShell,/olderHistoryAbortScopeRef\.current\.abort\(\);abortOlderReactionScopes\(\);/);
});


test('reply-target reads forward their lifecycle AbortSignal and remain chat-scoped',async()=>{
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const controller=new AbortController();
    await listReplyTargets('test-access-token','11111111-1111-4111-8111-111111111111',[
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222'
    ],controller.signal);
    assert.equal(calls.length,1);
    assert.equal(calls[0].options.signal,controller.signal);
    assert.match(calls[0].url,/chat_id=eq\.11111111-1111-4111-8111-111111111111/);
    assert.match(calls[0].url,/id=in\.\(/);
    assert.equal((calls[0].url.match(/22222222-2222-4222-8222-222222222222/g)||[]).length,1);
    assert.equal(calls[0].options.headers.Authorization,'Bearer test-access-token');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('aborting a reply-target lifecycle signal cancels the underlying fetch',async()=>{
  const originalFetch=globalThis.fetch;
  let receivedSignal;
  globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>{
    receivedSignal=options.signal;
    options.signal.addEventListener('abort',()=>{
      const error=new Error('The operation was aborted');
      error.name='AbortError';
      reject(error);
    },{once:true});
  });
  try{
    const controller=new AbortController();
    const pending=listReplyTargets('test-access-token','11111111-1111-4111-8111-111111111111',[
      '22222222-2222-4222-8222-222222222222'
    ],controller.signal);
    assert.equal(receivedSignal,controller.signal);
    controller.abort();
    await assert.rejects(pending,error=>error?.name==='AbortError');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('reply-target preview and quote-jump reads are cancelled on chat pause and retried on resume',()=>{
  assert.match(appShell,/replyTargetAbortScopesRef=useRef<Set<ReturnType<typeof createAbortableRequestScope>>>\(new Set\(\)\)/);
  assert.match(appShell,/listReplyTargets\(session\.access_token,chatId,ids,controller\.signal\)/);
  assert.match(appShell,/listReplyTargets\(token,chatId,\[id\],controller\.signal\)/);
  assert.match(appShell,/document\.visibilityState!=='visible'\|\|!navigator\.onLine\)return/);
  assert.match(appShell,/abortReplyTargetScopes\(\)/);
  assert.match(appShell,/setReplyTargetsRetryNonce\(n=>n\+1\)/);
  assert.match(appShell,/replyTargetsRetryNonce,selected/);
  assert.match(appShell,/replyTargetController\?\.signal\.aborted/);
  assert.match(appShell,/const requests=batches\.map\(async ids=>/);
  assert.match(appShell,/scope\.clear\(controller\)/);
});
