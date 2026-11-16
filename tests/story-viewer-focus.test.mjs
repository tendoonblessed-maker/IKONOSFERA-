import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {restoreDialogFocus,trapDialogTab} from '../lib/dialog-focus.ts';

function fixture(){
  const focused=[];
  const first={name:'first',focus(){focused.push('first');}};
  const middle={name:'middle',focus(){focused.push('middle');}};
  const last={name:'last',focus(){focused.push('last');}};
  const dialog={
    querySelectorAll(){return [first,middle,last];},
    contains(node){return node===first||node===middle||node===last;}
  };
  return {focused,first,middle,last,dialog};
}
function key(overrides={}){
  return {key:'Tab',shiftKey:false,prevented:false,preventDefault(){this.prevented=true;},...overrides};
}
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('story dialog wraps forward and backward Tab at its boundaries',()=>{
  const f=fixture();
  const forward=key();
  assert.equal(trapDialogTab(forward,f.dialog,f.last),true);
  assert.equal(forward.prevented,true);
  assert.deepEqual(f.focused,['first']);
  const backward=key({shiftKey:true});
  assert.equal(trapDialogTab(backward,f.dialog,f.first),true);
  assert.deepEqual(f.focused,['first','last']);
});

test('story dialog moves focus back inside when it was outside the modal',()=>{
  const f=fixture();
  const outside={name:'outside'};
  const forward=key();
  assert.equal(trapDialogTab(forward,f.dialog,outside),true);
  assert.deepEqual(f.focused,['first']);
  const backward=key({shiftKey:true});
  assert.equal(trapDialogTab(backward,f.dialog,outside),true);
  assert.deepEqual(f.focused,['first','last']);
});

test('ordinary Tab movement inside the dialog and non-Tab keys are untouched',()=>{
  const f=fixture();
  const tab=key();
  assert.equal(trapDialogTab(tab,f.dialog,f.middle),false);
  assert.equal(tab.prevented,false);
  const escape=key({key:'Escape'});
  assert.equal(trapDialogTab(escape,f.dialog,f.last),false);
  assert.equal(escape.prevented,false);
});

test('focus restoration avoids disconnected or hidden openers and prevents scroll jumps',()=>{
  const calls=[];
  const visible={isConnected:true,hasAttribute:()=>false,focus:options=>calls.push(options)};
  const disconnected={isConnected:false,hasAttribute:()=>false,focus:()=>calls.push('disconnected')};
  const hidden={isConnected:true,hasAttribute:name=>name==='hidden',focus:()=>calls.push('hidden')};
  restoreDialogFocus(visible);
  restoreDialogFocus(disconnected);
  restoreDialogFocus(hidden);
  assert.deepEqual(calls,[{preventScroll:true}]);
});

test('both story viewers wire focus trapping, initial focus and opener restoration',()=>{
  const home=source('components/StoriesStrip.tsx');
  const profile=source('components/ProfilePanel.tsx');
  for(const component of [home,profile]){
    assert.match(component,/trapDialogTab\(e(?:vent)?,storyDialogRef\.current,document\.activeElement\)/);
    assert.match(component,/storyCloseRef\.current\?\.focus\(\{preventScroll:true\}\)/);
    assert.match(component,/restoreDialogFocus\(previousFocus\)/);
    assert.match(component,/ref=\{storyDialogRef\}/);
    assert.match(component,/ref=\{storyCloseRef\}/);
  }
});
