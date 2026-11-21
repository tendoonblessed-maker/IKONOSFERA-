import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadSocial(fetchImpl) {
  const source = readFileSync(new URL('../lib/social.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const exports = {};
  const sandbox = {
    exports,
    process: {env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
    require(id) {
      if (id === '@/lib/supabase-rest') return {apiUrl:'https://supabase.invalid'};
      throw new Error('Unexpected import: '+id);
    },
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    Date,
    Array,
    Object,
    Set,
    Error,
    TypeError,
    RangeError,
    RegExp,
    String,
    Number,
    Boolean,
    JSON,
    Promise,
    Math
  };
  vm.runInNewContext(compiled, sandbox, {timeout:1000});
  return exports;
}

test('social read deadline aborts a stalled request and returns a readable error', async () => {
  const social = loadSocial(async () => new Promise(() => {}));
  await assert.rejects(
    social.withSocialReadTimeout(signal => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true});
    }), 5),
    /Сервер не ответил вовремя/
  );
});

test('social read deadline rejects a result that arrives after the deadline', async () => {
  const social = loadSocial(async () => new Promise(() => {}));
  await assert.rejects(
    social.withSocialReadTimeout(() => new Promise(resolve => setTimeout(() => resolve('late'), 15)), 5),
    /Сервер не ответил вовремя/
  );
});

test('successful social reads clear their deadline timer', async () => {
  const social = loadSocial(async () => new Promise(() => {}));
  let signal;
  const value = await social.withSocialReadTimeout(current => {
    signal = current;
    return Promise.resolve('ok');
  }, 5);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(value, 'ok');
  assert.equal(signal.aborted, false);
});

test('non-timeout failures are preserved and invalid deadlines are rejected', async () => {
  const social = loadSocial(async () => new Promise(() => {}));
  await assert.rejects(social.withSocialReadTimeout(async () => {
    throw new Error('permission denied');
  }, 50), /permission denied/);
  await assert.rejects(social.withSocialReadTimeout(async () => 'unused', 0), /timeoutMs must be positive/);
  assert.equal(social.SOCIAL_READ_TIMEOUT_MS,18_000);
});

test('GET and the read-only count RPC are bounded, while mutations are not auto-aborted', async () => {
  const calls = [];
  let responseBody = 'stall';
  const social = loadSocial(async (url, init) => {
    calls.push({url,init});
    return {
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
    };
  });

  await assert.rejects(
    social.getFullProfile('jwt-test','11111111-1111-4111-8111-111111111111'),
    /Сервер не ответил вовремя/
  );
  assert.ok(calls[0].init.signal,'GET carries an AbortController signal');

  responseBody = [{id:'11111111-1111-4111-8111-111111111111'}];
  const updated = await social.updateFullProfile(
    'jwt-test',
    '11111111-1111-4111-8111-111111111111',
    {bio:'updated'}
  );
  assert.equal(updated.id,'11111111-1111-4111-8111-111111111111');
  assert.equal(calls.at(-1).init.signal,undefined,'PATCH must not be automatically aborted');

  responseBody = [{channel_id:'22222222-2222-4222-8222-222222222222',subscribers:3}];
  const counts = await social.getChannelSubscriberCounts('jwt-test',['22222222-2222-4222-8222-222222222222']);
  assert.equal(counts['22222222-2222-4222-8222-222222222222'],3);
  assert.ok(calls.at(-1).init.signal,'read-only POST RPC carries an AbortController signal');
  assert.equal(calls.at(-1).init.headers.Authorization,'Bearer jwt-test');
  assert.equal(calls.at(-1).init.cache,'no-store');
});
