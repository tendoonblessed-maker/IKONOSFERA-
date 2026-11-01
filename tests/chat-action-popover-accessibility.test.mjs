import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const component=read('components/FloatingActionMenu.tsx');

test('action popovers expose non-modal dialog semantics for native buttons',()=>{
 assert.match(component,/useRole\(context,\{role:'dialog'\}\)/);
 assert.doesNotMatch(component,/useRole\(context,\{role:'menu'\}\)/);
 assert.match(component,/'aria-label':label/);
 assert.match(component,/'aria-modal':false/);
});

test('keyboard and pointer dismissal still close the popover',()=>{
 assert.match(component,/useDismiss\(context,\{outsidePress:true,escapeKey:true\}\)/);
 assert.match(component,/onClick:\(event\)=>\{/);
 assert.match(component,/target\.closest\('button'\)\)setOpen\(false\)/);
});

test('non-modal focus manager restores focus to the action trigger',()=>{
 assert.match(component,/<FloatingFocusManager context=\{context\} modal=\{false\} returnFocus>/);
 assert.match(component,/ref=\{refs\.setReference\}/);
 assert.match(component,/ref=\{refs\.setFloating\}/);
});

test('both existing action surfaces use the labelled shared popover',()=>{
 const row=read('components/ChatInboxRow.tsx');
 const shell=read('components/AppShell.tsx');
 assert.match(row,/<FloatingActionMenu[\s\S]*?label=\{'Действия с чатом '\+name\}/);
 assert.match(shell,/<FloatingActionMenu label="Действия с чатом"/);
});
