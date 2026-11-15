import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {handleInstallHelpDialogKeydown} from '../lib/install-help-dialog.ts';

function makeEvent(key) {
  let prevented = 0;
  return {event:{key,preventDefault(){prevented++;}},prevented:()=>prevented};
}

test('Escape closes install help and prevents browser default',()=>{
  const input=makeEvent('Escape');
  let closed=0;
  assert.equal(handleInstallHelpDialogKeydown(input.event,{focus(){}},()=>{closed++;}),true);
  assert.equal(input.prevented(),1);
  assert.equal(closed,1);
});

test('Tab and Shift+Tab stay on the single dialog action without scrolling',()=>{
  for(const key of ['Tab','Shift+Tab']) {
    const input=makeEvent('Tab');
    input.event.shiftKey=key==='Shift+Tab';
    let focused=0;
    let options=null;
    assert.equal(handleInstallHelpDialogKeydown(input.event,{focus(value){focused++;options=value;}},()=>{}),true);
    assert.equal(input.prevented(),1);
    assert.equal(focused,1);
    assert.deepEqual(options,{preventScroll:true});
  }
});

test('Tab remains contained even if the action button is temporarily unavailable',()=>{
  const input=makeEvent('Tab');
  assert.equal(handleInstallHelpDialogKeydown(input.event,null,()=>{}),true);
  assert.equal(input.prevented(),1);
});

test('unrelated keys do not close or steal focus',()=>{
  const input=makeEvent('ArrowDown');
  let focused=0,closed=0;
  assert.equal(handleInstallHelpDialogKeydown(input.event,{focus(){focused++;}},()=>{closed++;}),false);
  assert.equal(input.prevented(),0);
  assert.equal(focused,0);
  assert.equal(closed,0);
});

test('install help is labelled, focused, contained, and restores focus on close',()=>{
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(shell,/handleInstallHelpDialogKeydown\(event,focusTarget,\(\)=>setInstallHelp\(false\)\)/);
  assert.match(shell,/document\.addEventListener\('focusin',onFocusIn\)/);
  assert.match(shell,/document\.removeEventListener\('focusin',onFocusIn\)/);
  assert.match(shell,/focusTarget\?\.focus\(\{preventScroll:true\}\)/);
  assert.match(shell,/previousFocus\?\.isConnected\)previousFocus\.focus\(\{preventScroll:true\}\)/);
  assert.match(shell,/role="dialog" aria-modal="true" aria-labelledby="ik-install-help-title" aria-describedby="ik-install-help-description"/);
  assert.match(shell,/ref=\{installHelpActionRef\}/);
  assert.match(shell,/event\.target===event\.currentTarget\)setInstallHelp\(false\)/);
});
