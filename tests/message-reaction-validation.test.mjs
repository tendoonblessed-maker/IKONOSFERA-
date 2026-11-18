import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {normalizeMessageReactions,REACTION_EMOJIS} from '../lib/message-reaction-validation.ts';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('normalize only valid reactions for requested message IDs',()=>{
 const rows=[
  {message_id:A,user_id:B,emoji:REACTION_EMOJIS[0]},
  {message_id:C,user_id:B,emoji:REACTION_EMOJIS[1]},
  {message_id:A,user_id:'bad-id',emoji:REACTION_EMOJIS[0]},
  {message_id:A,user_id:C,emoji:'not-an-allowed-reaction'},
  {message_id:'bad-id',user_id:C,emoji:REACTION_EMOJIS[0]},
  null,[],42
 ];
 assert.deepEqual(normalizeMessageReactions(rows,[A]),[{message_id:A,user_id:B,emoji:REACTION_EMOJIS[0]}]);
});

test('normalize UUID casing and deduplicate one reaction per message and user',()=>{
 const rows=[
  {message_id:A.toUpperCase(),user_id:B.toUpperCase(),emoji:REACTION_EMOJIS[0]},
  {message_id:A,user_id:B,emoji:REACTION_EMOJIS[1]},
 ];
 assert.deepEqual(normalizeMessageReactions(rows,[A.toUpperCase()]),[{message_id:A,user_id:B,emoji:REACTION_EMOJIS[0]}]);
});

test('malformed non-array responses and invalid requested IDs fail closed',()=>{
 assert.deepEqual(normalizeMessageReactions({message_id:A,user_id:B,emoji:REACTION_EMOJIS[0]},[A]),[]);
 assert.deepEqual(normalizeMessageReactions([{message_id:A,user_id:B,emoji:REACTION_EMOJIS[0]}],['invalid']),[]);
 assert.deepEqual(normalizeMessageReactions([],[]),[]);
});

test('direct-message reaction API applies runtime normalization and shared emoji list',()=>{
 const api=file('lib/supabase-rest.ts');
 const social=file('lib/social.ts');
 assert.match(api,/http<unknown>\('\/rest\/v1\/message_reactions/);
 assert.match(api,/normalizeMessageReactions\(rows,messageIds\)/);
 assert.match(social,/import \{ REACTION_EMOJIS \} from "@\/lib\/message-reaction-validation"/);
 assert.match(social,/export \{ REACTION_EMOJIS \}/);
});
