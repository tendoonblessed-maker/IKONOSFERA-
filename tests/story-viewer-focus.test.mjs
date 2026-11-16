import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {restoreDialogFocus,trapDialogTab} from '../lib/dialog-focus.ts';

function makeControl(focused,name,options={}){
  const {
    tabIndex=0,disabled=false,hidden=false,ariaHidden=false,inert=false,
    ancestorHidden=false,ancestorInert=false,ancestorAriaHidden=false,
    ancestorDisabled=false,visible=true,display='block',visibility='visible'
  }=options;
  return {
    name,tabIndex,
    focus(){focused.push(name);},
    matches(selector){
      return selector===':disabled,[hidden],[aria-hidden="true"]'
        &&(disabled||hidden||ariaHidden||ancestorDisabled);
    },
    closest(selector){
      return selector==='[hidden],[inert],[aria-hidden="true"]'
        &&(hidden||inert||ariaHidden||ancestorHidden||ancestorInert||ancestorAriaHidden)
          ?{}:null;
    },
    getClientRects(){return visible&&display!=='none'?[{}]:[];},
    ownerDocument:{defaultView:{getComputedStyle(){return {display,visibility};}}}
  };
}
function fixture(customControls){
  const focused=[];
  const controls=customControls??[
    makeControl(focused,'first'),
    makeControl(focused,'middle'),
    makeControl(focused,'last')
  ];
  const dialog={
    querySelectorAll(){return controls;},
    contains(node){return controls.includes(node);},
    focus(){focused.push('dialog');}
  };
  return {focused,first:controls[0],middle:controls[1],last:controls[2],controls,dialog};
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

test('hidden, inert, disabled and non-rendered controls are excluded from the tab order',()=>{
  const focused=[];
  const controls=[
    makeControl(focused,'hidden',{hidden:true}),
    makeControl(focused,'negative-tabindex',{tabIndex:-1}),
    makeControl(focused,'disabled',{disabled:true}),
    makeControl(focused,'disabled-fieldset',{ancestorDisabled:true}),
    makeControl(focused,'aria-hidden',{ariaHidden:true}),
    makeControl(focused,'inert',{inert:true}),
    makeControl(focused,'hidden-ancestor',{ancestorHidden:true}),
    makeControl(focused,'inert-ancestor',{ancestorInert:true}),
    makeControl(focused,'aria-hidden-ancestor',{ancestorAriaHidden:true}),
    makeControl(focused,'display-none',{display:'none'}),
    makeControl(focused,'visibility-hidden',{visibility:'hidden'}),
    makeControl(focused,'visible-first'),
    makeControl(focused,'visible-last')
  ];
  const f=fixture(controls);
  const forward=key();
  assert.equal(trapDialogTab(forward,f.dialog,controls.at(-1)),true);
  assert.deepEqual(f.focused,['visible-first']);
  const backward=key({shiftKey:true});
  assert.equal(trapDialogTab(backward,f.dialog,controls.at(-2)),true);
  assert.deepEqual(f.focused,['visible-first','visible-last']);
});

test('a dialog with no rendered tab stops still prevents focus from escaping',()=>{
  const focused=[];
  const f=fixture([
    makeControl(focused,'hidden',{hidden:true}),
    makeControl(focused,'offscreen',{visible:false}),
    makeControl(focused,'disabled',{disabled:true})
  ]);
  const tab=key();
  assert.equal(trapDialogTab(tab,f.dialog,null),true);
  assert.equal(tab.prevented,true);
  assert.deepEqual(f.focused,['dialog']);
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
    assert.match(component,/ref=\{storyDialogRef\}\s+tabIndex=\{-1\}/);
    assert.match(component,/ref=\{storyCloseRef\}/);
  }
});
