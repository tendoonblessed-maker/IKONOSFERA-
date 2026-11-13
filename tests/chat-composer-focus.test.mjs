import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  captureComposerSelection,
  focusComposerIfCurrent
} from '../lib/chat-composer-focus.js';

function textarea({value='hello world',start=3,end=3,direction='none',connected=true}={}) {
  return {
    value,
    selectionStart:start,
    selectionEnd:end,
    selectionDirection:direction,
    isConnected:connected,
    focusCalls:[],
    rangeCalls:[],
    focus(options){this.focusCalls.push(options);},
    setSelectionRange(nextStart,nextEnd,nextDirection){
      this.rangeCalls.push([nextStart,nextEnd,nextDirection]);
      this.selectionStart=nextStart;
      this.selectionEnd=nextEnd;
      this.selectionDirection=nextDirection;
    }
  };
}

test('captures the current caret and selection direction without focusing',()=>{
  const field=textarea({start:2,end:7,direction:'backward'});
  assert.deepEqual(captureComposerSelection(field),{
    start:2,end:7,direction:'backward'
  });
  assert.deepEqual(field.focusCalls,[]);
  assert.equal(captureComposerSelection(null),null);
  assert.equal(captureComposerSelection({...field,selectionStart:NaN}),null);
});

test('explicit reply focus restores the previous caret without changing draft text',()=>{
  const field=textarea({value:'Привет, мир',start:4,end:8,direction:'forward'});
  const selection=captureComposerSelection(field);
  const before=field.value;
  assert.equal(focusComposerIfCurrent(field,selection,()=>true),true);
  assert.deepEqual(field.focusCalls,[{preventScroll:true}]);
  assert.deepEqual(field.rangeCalls,[[4,8,'forward']]);
  assert.equal(field.value,before);
});

test('restored selection is clamped when the active draft is shorter',()=>{
  const field=textarea({value:'abc',start:2,end:10,direction:'backward'});
  assert.equal(focusComposerIfCurrent(field,{
    start:2,end:10,direction:'backward'
  },()=>true),true);
  assert.deepEqual(field.rangeCalls,[[2,3,'backward']]);
});

test('stale chat or account context never receives deferred focus',()=>{
  const field=textarea();
  assert.equal(focusComposerIfCurrent(field,captureComposerSelection(field),()=>false),false);
  assert.deepEqual(field.focusCalls,[]);
  assert.deepEqual(field.rangeCalls,[]);
});

test('detached composers are never focused even when the context guard passes',()=>{
  const field=textarea({connected:false});
  assert.equal(focusComposerIfCurrent(field,captureComposerSelection(field),()=>true),false);
  assert.deepEqual(field.focusCalls,[]);
});

test('a missing selection still permits an intentional current-context focus',()=>{
  const field=textarea();
  assert.equal(focusComposerIfCurrent(field,null,()=>true),true);
  assert.deepEqual(field.focusCalls,[{preventScroll:true}]);
  assert.deepEqual(field.rangeCalls,[]);
});

test('reply focus is invalidated on chat/account changes and background suspension',()=>{
  const source=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  const replyStart=source.indexOf('function replyToMessage(');
  const replyEnd=source.indexOf('\n  async function sendMessage',replyStart);
  assert.ok(replyStart>=0&&replyEnd>replyStart);
  const reply=source.slice(replyStart,replyEnd);

  assert.match(source,/const composerFocusRequestRef=useRef\(0\)/);
  assert.match(source,/composerFocusRequestRef\.current\+\+/);
  assert.match(source,/window\.addEventListener\('pagehide',invalidateComposerFocus\)/);
  assert.match(source,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
  assert.match(reply,/const chatId=selected/);
  assert.match(reply,/const ownerId=userId/);
  assert.match(reply,/const generation=chatContextGenerationRef\.current/);
  assert.match(reply,/captureComposerSelection\(field\)/);
  assert.match(reply,/window\.requestAnimationFrame\(\(\)=>\{/);
  assert.match(reply,/focusComposerIfCurrent\(field,selection/);
  assert.match(reply,/selectedRef\.current===chatId/);
  assert.match(reply,/chatContextGenerationRef\.current===generation/);
  assert.match(reply,/draftScopeRef\.current\.ownerId===ownerId/);
  assert.match(reply,/draftScopeRef\.current\.chatId===chatId/);
  assert.match(reply,/document\.visibilityState==='visible'/);
  assert.doesNotMatch(source,/requestAnimationFrame\(\(\)=>composerRef\.current\?\.focus\(\)\)/);
});
