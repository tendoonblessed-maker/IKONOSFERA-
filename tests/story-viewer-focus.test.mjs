import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {restoreDialogFocus,restoreDialogFocusInside,trapDialogTab} from '../lib/dialog-focus.ts';
import {addStoryPausePointer,removeStoryPausePointer} from '../lib/story-pause-pointers.ts';

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
function fixture(customControls,sharedFocused){
  const focused=sharedFocused??[];
  const controls=customControls??[
    makeControl(focused,'first'),
    makeControl(focused,'middle'),
    makeControl(focused,'last')
  ];
  const nonTabStop={name:'programmatic-only',tabIndex:-1};
  let dialog;
  dialog={
    querySelectorAll(){return controls;},
    contains(node){return node===dialog||node===nonTabStop||controls.includes(node);},
    focus(){focused.push('dialog');}
  };
  return {focused,first:controls[0],middle:controls[1],last:controls[2],controls,dialog,nonTabStop};
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

test('Tab from the dialog container or a programmatic-only descendant stays in the modal',()=>{
  const f=fixture();
  assert.equal(f.dialog.contains(f.nonTabStop),true);

  const fromContainer=key();
  assert.equal(trapDialogTab(fromContainer,f.dialog,f.dialog),true);
  assert.equal(fromContainer.prevented,true);
  assert.deepEqual(f.focused,['first']);

  const fromProgrammaticChild=key({shiftKey:true});
  assert.equal(trapDialogTab(fromProgrammaticChild,f.dialog,f.nonTabStop),true);
  assert.equal(fromProgrammaticChild.prevented,true);
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
  const f=fixture(controls,focused);
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
  ],focused);
  const tab=key();
  assert.equal(trapDialogTab(tab,f.dialog,null),true);
  assert.equal(tab.prevented,true);
  assert.deepEqual(f.focused,['dialog']);
});

function makeOpener(focused,name,options={}) {
  const control=makeControl(focused,name,options);
  control.isConnected=options.connected!==false;
  control.hasAttribute=attribute=>(
    (attribute==='hidden'&&Boolean(options.hidden))||
    (attribute==='tabindex'&&Boolean(options.explicitTabIndex))
  );
  control.focus=focusOptions=>focused.push({name,options:focusOptions});
  return control;
}

test('focus restoration skips unavailable openers but preserves explicit programmatic focus targets',()=>{
  const focused=[];
  const candidates=[
    makeOpener(focused,'disconnected',{connected:false}),
    makeOpener(focused,'hidden',{hidden:true}),
    makeOpener(focused,'disabled',{disabled:true}),
    makeOpener(focused,'disabled-fieldset',{ancestorDisabled:true}),
    makeOpener(focused,'inert-ancestor',{ancestorInert:true}),
    makeOpener(focused,'aria-hidden-ancestor',{ancestorAriaHidden:true}),
    makeOpener(focused,'display-none',{display:'none'}),
    makeOpener(focused,'visibility-hidden',{visibility:'hidden'}),
    makeOpener(focused,'non-focusable',{tabIndex:-1}),
    makeOpener(focused,'programmatic-tabindex-minus-one',{tabIndex:-1,explicitTabIndex:true}),
    makeOpener(focused,'visible')
  ];
  for(const candidate of candidates)restoreDialogFocus(candidate);
  assert.deepEqual(focused,[
    {name:'programmatic-tabindex-minus-one',options:{preventScroll:true}},
    {name:'visible',options:{preventScroll:true}}
  ]);
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


test('programmatic focus escapes return to the close control or a safe dialog fallback',()=>{
  const f=fixture();
  const outside={name:'outside'};
  assert.equal(restoreDialogFocusInside(f.dialog,outside,f.first),true);
  assert.deepEqual(f.focused,['first']);

  // Focus already inside the modal is left untouched.
  assert.equal(restoreDialogFocusInside(f.dialog,f.middle,f.first),false);
  assert.deepEqual(f.focused,['first']);

  const onlyHidden=[makeControl(f.focused,'hidden',{hidden:true})];
  const empty=fixture(onlyHidden,f.focused);
  assert.equal(restoreDialogFocusInside(empty.dialog,outside,f.first),true);
  assert.deepEqual(f.focused,['first','dialog']);
});

test('both story viewers guard programmatic focusin escapes and clean up the listener',()=>{
  const home=source('components/StoriesStrip.tsx');
  const profile=source('components/ProfilePanel.tsx');
  for(const component of [home,profile]){
    assert.match(component,/const onFocusIn=\(event:FocusEvent\)=>\{/);
    assert.match(component,/event\.target instanceof Element&&!dialog\.contains\(event\.target\)/);
    assert.match(component,/restoreDialogFocusInside\(dialog,event\.target,storyCloseRef\.current\)/);
    assert.match(component,/document\.addEventListener\('focusin',onFocusIn\)/);
    assert.match(component,/document\.removeEventListener\('focusin',onFocusIn\)/);
  }
});

test('story pause resumes only after all active pointers are released',()=>{
  const pointers=new Set();
  assert.equal(addStoryPausePointer(pointers,7),true);
  assert.equal(addStoryPausePointer(pointers,11),true);
  assert.equal(pointers.size,2);
  assert.equal(removeStoryPausePointer(pointers,7),true);
  assert.equal(pointers.size,1);
  // Pointerleave and pointercancel can race with pointerup; release is idempotent.
  assert.equal(removeStoryPausePointer(pointers,7),true);
  assert.equal(removeStoryPausePointer(pointers,11),false);
  assert.equal(removeStoryPausePointer(pointers,11),false);
  assert.equal(pointers.size,0);
});

test('both story viewers release hold-to-pause on pointerleave and clean pointer state',()=>{
  const home=source('components/StoriesStrip.tsx');
  const profile=source('components/ProfilePanel.tsx');
  for(const component of [home,profile]){
    assert.match(component,/pausedPointersRef=useRef<Set<number>>\(new Set\(\)\)/);
    assert.match(component,/onPointerDown=\{event=>set(?:Story)?Paused\(addStoryPausePointer\(pausedPointersRef\.current,event\.pointerId\)\)\}/);
    assert.match(component,/onPointerUp=\{event=>set(?:Story)?Paused\(removeStoryPausePointer\(pausedPointersRef\.current,event\.pointerId\)\)\}/);
    assert.match(component,/onPointerCancel=\{event=>set(?:Story)?Paused\(removeStoryPausePointer\(pausedPointersRef\.current,event\.pointerId\)\)\}/);
    assert.match(component,/onPointerLeave=\{event=>set(?:Story)?Paused\(removeStoryPausePointer\(pausedPointersRef\.current,event\.pointerId\)\)\}/);
    assert.match(component,/pausedPointersRef\.current\.clear\(\)/);
  }
});
