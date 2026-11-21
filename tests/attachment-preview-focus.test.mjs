import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {attachmentPreviewTabAction} from '../lib/attachment-preview-focus.ts';

const component=readFileSync(new URL('../components/ChatAttachmentPreview.tsx',import.meta.url),'utf8');

test('when sending disables every control, Tab stays on the dialog',()=>{
 assert.equal(attachmentPreviewTabAction(-1,0,false),'dialog');
 assert.equal(attachmentPreviewTabAction(-1,0,true),'dialog');
 assert.equal(attachmentPreviewTabAction(0,0,false),'dialog');
});

test('focus outside the control list is directed to the first or last control',()=>{
 assert.equal(attachmentPreviewTabAction(-1,3,false),'first');
 assert.equal(attachmentPreviewTabAction(-1,3,true),'last');
 assert.equal(attachmentPreviewTabAction(4,3,false),'first');
 assert.equal(attachmentPreviewTabAction(4,3,true),'last');
});

test('Tab wraps only at the first and last controls',()=>{
 assert.equal(attachmentPreviewTabAction(0,3,true),'last');
 assert.equal(attachmentPreviewTabAction(2,3,false),'first');
 assert.equal(attachmentPreviewTabAction(0,3,false),null);
 assert.equal(attachmentPreviewTabAction(1,3,false),null);
 assert.equal(attachmentPreviewTabAction(2,3,true),null);
});

test('a single focusable control wraps in either direction',()=>{
 assert.equal(attachmentPreviewTabAction(0,1,false),'first');
 assert.equal(attachmentPreviewTabAction(0,1,true),'last');
});

test('attachment preview is focusable as fallback and announces send progress',()=>{
 assert.match(component,/tabIndex=\{-1\} aria-busy=\{sending\}/);
 assert.match(component,/role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(component,/if\(action==='dialog'\)dialog\.focus\(\)/);
 assert.match(component,/document\.addEventListener\('keydown',onKeyDown\)/);
});
