import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 DIRECT_MESSAGE_SEARCH_MAX_OFFSET,DIRECT_MESSAGE_SEARCH_MAX_RESULTS,
 DIRECT_MESSAGE_SEARCH_PAGE_SIZE,getDirectMessageSearchPageState
} from '../lib/supabase-rest.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('direct history search paginates until the final supported offset',()=>{
 assert.equal(DIRECT_MESSAGE_SEARCH_PAGE_SIZE,30);
 assert.equal(DIRECT_MESSAGE_SEARCH_MAX_OFFSET,600);
 assert.equal(DIRECT_MESSAGE_SEARCH_MAX_RESULTS,630);
 assert.deepEqual(getDirectMessageSearchPageState(0,31),{hasMore:true,limitReached:false});
 assert.deepEqual(getDirectMessageSearchPageState(570,31),{hasMore:true,limitReached:false});
});

test('direct history search discloses the cap only when more matches exist beyond it',()=>{
 assert.deepEqual(getDirectMessageSearchPageState(600,31),{hasMore:false,limitReached:true});
 assert.deepEqual(getDirectMessageSearchPageState(600,30),{hasMore:false,limitReached:false});
 assert.deepEqual(getDirectMessageSearchPageState(Number.NaN,31),{hasMore:true,limitReached:false});
 assert.deepEqual(getDirectMessageSearchPageState(-1,31),{hasMore:true,limitReached:false});
});

test('PostgREST requests and the search panel share the documented bounded-page contract',()=>{
 const api=source('lib/supabase-rest.ts');
 const app=source('components/AppShell.tsx');
 const panel=source('components/DirectMessageSearchPanel.tsx');
 const migration=source('supabase/migrations/20261029_080000_direct_message_full_history_search.sql');
 assert.match(api,/p_limit:DIRECT_MESSAGE_SEARCH_PAGE_SIZE\+1/);
 assert.match(api,/Math\.min\(DIRECT_MESSAGE_SEARCH_MAX_OFFSET,Math\.floor\(offset\)\)/);
 assert.match(migration,/offset greatest\(0,least\(coalesce\(p_offset,0\),600\)\)/);
 assert.match(app,/getDirectMessageSearchPageState\(offset,matches\.length\)/);
 assert.match(app,/limitReached=\{messageSearchOwner\?\.chatId===selected/);
 assert.match(panel,/Показаны первые \{DIRECT_MESSAGE_SEARCH_MAX_RESULTS\} совпадений/);
 assert.match(panel,/role="status"/);
});
