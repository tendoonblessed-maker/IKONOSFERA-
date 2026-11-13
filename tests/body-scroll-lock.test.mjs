import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lockBodyScroll} from '../lib/body-scroll-lock.ts';

function createHarness({scrollX=0,scrollY=0,innerWidth=390,clientWidth=390,computedPadding='0px'}={}) {
 const style={
  position:'relative',top:'2px',left:'3px',right:'4px',width:'80%',
  overflow:'auto',overscrollBehavior:'contain',paddingRight:'6px'
 };
 const body={style};
 const document={body,documentElement:{clientWidth}};
 const scrollCalls=[];
 const window={
  scrollX,scrollY,innerWidth,
  getComputedStyle:()=>({paddingRight:computedPadding}),
  scrollTo:(x,y)=>scrollCalls.push([x,y])
 };
 return {body,document,window,scrollCalls,original:{...style}};
}

test('locks the body in place and compensates for the removed desktop scrollbar',()=>{
 const h=createHarness({scrollX:12,scrollY:320,innerWidth:400,clientWidth:388,computedPadding:'8px'});
 const release=lockBodyScroll(h.document,h.window);
 assert.equal(h.body.style.position,'fixed');
 assert.equal(h.body.style.top,'-320px');
 assert.equal(h.body.style.left,'-12px');
 assert.equal(h.body.style.right,'0');
 assert.equal(h.body.style.width,'auto');
 assert.equal(h.body.style.overflow,'hidden');
 assert.equal(h.body.style.overscrollBehavior,'none');
 assert.equal(h.body.style.paddingRight,'20px');
 release();
 assert.deepEqual(h.body.style,h.original);
 assert.deepEqual(h.scrollCalls,[[12,320]]);
});

test('restores every previous inline style and the page position exactly once',()=>{
 const h=createHarness({scrollX:4,scrollY:640});
 const release=lockBodyScroll(h.document,h.window);
 release();
 release();
 assert.deepEqual(h.body.style,h.original);
 assert.deepEqual(h.scrollCalls,[[4,640]]);
});

test('keeps existing padding when the viewport has no scrollbar gap',()=>{
 const h=createHarness({innerWidth:390,clientWidth:390,computedPadding:'48px'});
 const release=lockBodyScroll(h.document,h.window);
 assert.equal(h.body.style.paddingRight,'6px');
 assert.equal(h.body.style.left,'0px');
 assert.equal(h.body.style.right,'0');
 assert.equal(h.body.style.width,'auto');
 release();
 assert.equal(h.body.style.paddingRight,'6px');
});
