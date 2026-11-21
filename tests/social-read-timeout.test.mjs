import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {withSocialReadTimeout} from '../lib/social-read-timeout.mjs';

test('social read deadline aborts a stalled request and returns a readable error', async () => {
  await assert.rejects(
    withSocialReadTimeout(signal => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true});
    }), 5),
    /Сервер не ответил вовремя/
  );
});

test('social read deadline also rejects an operation that resolves after its deadline', async () => {
  await assert.rejects(
    withSocialReadTimeout(() => new Promise(resolve => setTimeout(() => resolve('late'), 15)), 5),
    /Сервер не ответил вовремя/
  );
});

test('successful social reads clear their deadline timer', async () => {
  let signal;
  const value = await withSocialReadTimeout(current => {
    signal = current;
    return Promise.resolve('ok');
  }, 5);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(value, 'ok');
  assert.equal(signal.aborted, false);
});

test('non-timeout failures are preserved and invalid deadlines are rejected', async () => {
  await assert.rejects(withSocialReadTimeout(async () => {
    throw new Error('permission denied');
  }, 50), /permission denied/);
  await assert.rejects(withSocialReadTimeout(async () => 'unused', 0), /timeoutMs must be positive/);
});

test('social GET and read-only count RPC are bounded, but mutations are not auto-aborted', async () => {
  const source = readFileSync(new URL('../lib/social.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const exports = {};
  const calls = [];
  let timeoutCalls = 0;
  let responseBody = [];
  const sandbox = {
    exports,
    process: {env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
    require(id) {
      if (id === '@/lib/supabase-rest') return {apiUrl:'https://supabase.invalid'};
      if (id === '@/lib/social-upload-id') return {createSocialUploadId:()=> 'test-upload-id'};
      if (id === '@/lib/social-read-timeout.mjs') return {
        withSocialReadTimeout(operation) {
          timeoutCalls += 1;
          return withSocialReadTimeout(operation, 5);
        }
      };
      throw new Error('Unexpected import: '+id);
    },
    fetch(url, init) {
      calls.push({url,init});
      return Promise.resolve({
        ok:true,
        status:200,
        json() {
          if (init.signal && responseBody === 'stall') {
            return new Promise((_, reject) => {
              init.signal.addEventListener('abort', () => reject(new Error('body aborted')), {once:true});
            });
          }
          return Promise.resolve(responseBody);
        }
      });
    },
    AbortController,
    encodeURIComponent,
    Date,
    Array,
    Object,
    Set,
    Error,
    RegExp,
    String,
    Number,
    Boolean,
    JSON,
    Promise,
    Math
  };
  vm.runInNewContext(compiled, sandbox, {timeout:1000});

  responseBody = 'stall';
  await assert.rejects(
    exports.getFullProfile('jwt-test','11111111-1111-4111-8111-111111111111'),
    /Сервер не ответил вовремя/
  );
  assert.equal(timeoutCalls, 1);
  assert.ok(calls[0].init.signal, 'GET carries an AbortController signal');

  responseBody = [{id:'11111111-1111-4111-8111-111111111111'}];
  const updated = await exports.updateFullProfile(
    'jwt-test',
    '11111111-1111-4111-8111-111111111111',
    {bio:'updated'}
  );
  assert.equal(updated.id,'11111111-1111-4111-8111-111111111111');
  assert.equal(timeoutCalls,1,'PATCH must not be wrapped in a read deadline');
  assert.equal(calls.at(-1).init.signal,undefined,'PATCH must not be automatically aborted');

  responseBody = [{channel_id:'22222222-2222-4222-8222-222222222222',subscribers:3}];
  const counts = await exports.getChannelSubscriberCounts('jwt-test',['22222222-2222-4222-8222-222222222222']);
  assert.equal(counts['22222222-2222-4222-8222-222222222222'],3);
  assert.equal(timeoutCalls,2,'the read-only POST RPC opts into the deadline explicitly');
  assert.ok(calls.at(-1).init.signal,'read-only POST RPC carries an AbortController signal');
  assert.equal(calls.at(-1).init.headers.Authorization,'Bearer jwt-test');
  assert.equal(calls.at(-1).init.cache,'no-store');
});
