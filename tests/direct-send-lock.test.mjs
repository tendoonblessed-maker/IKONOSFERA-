import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  tryAcquireInFlightLock,
  tryAcquireAccountInFlightLock,
  releaseInFlightLock
} from '../lib/send-lock.mjs';

test('only one direct chat submission can acquire the lock before React rerenders', () => {
  const lock = { active: false };

  assert.equal(tryAcquireInFlightLock(lock), true);
  assert.equal(tryAcquireInFlightLock(lock), false);
  assert.equal(lock.active, true);

  releaseInFlightLock(lock);
  assert.equal(lock.active, false);
  assert.equal(tryAcquireInFlightLock(lock), true);
});

test('text and attachment submissions share one account lock', () => {
  const ref = { current: { ownerId: 'account-a', active: false } };

  const textLock = tryAcquireAccountInFlightLock(ref, 'account-a');
  assert.ok(textLock);
  assert.equal(tryAcquireAccountInFlightLock(ref, 'account-a'), null);

  releaseInFlightLock(textLock);
  assert.ok(tryAcquireAccountInFlightLock(ref, 'account-a'));
});

test('both direct send handlers acquire synchronously and release their captured lock', async () => {
  const shell = await readFile(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  const textStart = shell.indexOf('async function sendMessage(');
  const textEnd = shell.indexOf('async function toggleSavedContact(', textStart);
  const mediaStart = shell.indexOf('async function sendAttachment(');
  const mediaEnd = shell.indexOf('async function logout(', mediaStart);

  assert.ok(textStart >= 0 && textEnd > textStart, 'text send handler must exist');
  assert.ok(mediaStart >= 0 && mediaEnd > mediaStart, 'attachment send handler must exist');

  const textSend = shell.slice(textStart, textEnd);
  const mediaSend = shell.slice(mediaStart, mediaEnd);
  for (const handler of [textSend, mediaSend]) {
    assert.ok(handler.includes('const sendLock=tryAcquireAccountInFlightLock(directSendLockRef,userId);'));
    assert.ok(handler.includes('if(!sendLock)return;'));
    assert.ok(handler.includes('finally{releaseInFlightLock(sendLock);if(userIdRef.current===userId)setSending(false);}'));
    assert.ok(handler.includes('catch(e){if(userIdRef.current===userId)setError(userFacingError(e));}'));
    assert.ok(handler.indexOf('tryAcquireAccountInFlightLock') < handler.indexOf('try{'),
      'lock must be acquired before the network request');
  }
  assert.ok(shell.includes("const directSendLockRef=useRef({ownerId:'',active:false})"));
  assert.ok(shell.includes('const userIdRef=useRef(userId);\n  userIdRef.current=userId;'));
});

test('account changes isolate locks from late previous-account completions', () => {
  const ref = { current: { ownerId: 'account-a', active: false } };
  const oldAccountLock = tryAcquireAccountInFlightLock(ref, 'account-a');

  assert.ok(oldAccountLock);
  assert.equal(tryAcquireAccountInFlightLock(ref, 'account-a'), null);

  const newAccountLock = tryAcquireAccountInFlightLock(ref, 'account-b');
  assert.ok(newAccountLock);
  assert.notEqual(newAccountLock, oldAccountLock);
  assert.equal(ref.current.active, true);
  assert.equal(tryAcquireAccountInFlightLock(ref, 'account-b'), null);

  // A delayed finally from account A must not release account B's lock.
  releaseInFlightLock(oldAccountLock);
  assert.equal(ref.current.active, true);
  assert.equal(tryAcquireAccountInFlightLock(ref, 'account-b'), null);

  releaseInFlightLock(newAccountLock);
  assert.ok(tryAcquireAccountInFlightLock(ref, 'account-b'));
});

test('stale direct send completions cannot update the next account UI', async () => {
  const shell = await readFile(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');

  assert.ok(shell.includes('useLayoutEffect(()=>{\n    // A previous account\'s pending POST'));
  assert.ok(shell.includes("userIdRef.current='';\n    directSendLockRef.current={ownerId:'',active:false};\n    setSending(false);"));

  const textStart = shell.indexOf('async function sendMessage(');
  const textEnd = shell.indexOf('async function toggleSavedContact(', textStart);
  const mediaStart = shell.indexOf('async function sendAttachment(');
  const mediaEnd = shell.indexOf('async function logout(', mediaStart);
  const textSend = shell.slice(textStart, textEnd);
  const mediaSend = shell.slice(mediaStart, mediaEnd);

  assert.ok(textSend.includes('if(userIdRef.current===userId&&selectedRef.current===chatId&&draftsOwnerRef.current===userId)'));
  assert.ok(textSend.includes('if(userIdRef.current===userId&&draftsOwnerRef.current===userId&&'));
  assert.ok(textSend.includes('if(userIdRef.current===userId&&reply)'));
  assert.ok(mediaSend.includes('if(userIdRef.current===userId)setNotice("Вложение отправлено.");'));
});
