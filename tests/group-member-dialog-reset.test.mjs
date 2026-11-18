import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resetGroupMemberDialogState} from '../lib/group-member-dialog-reset.mjs';

test('member dialog reset returns a closed dialog and clears the search query',()=>{
  const state=resetGroupMemberDialogState();
  assert.deepEqual(state,{open:false,query:''});
  const another=resetGroupMemberDialogState();
  state.query='old search';
  assert.equal(another.query,'');
});

test('GroupPanel resets member dialog state on group and account context changes',()=>{
  const panel=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');
  assert.match(panel,/resetGroupMemberDialogState/);
  assert.match(panel,/setMembersOpen\(memberDialogState\.open\)/);
  assert.match(panel,/setMemberSearch\(memberDialogState\.query\)/);
  assert.match(panel,/\},\[group\.id,userId\]\)/);
});
