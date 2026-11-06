import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tryAcquireInFlightLock, tryAcquireAccountInFlightLock, releaseInFlightLock } from '../lib/send-lock.mjs';

test('only one direct chat submission can acquire the lock before React rerenders', () => {
  const lock = { active: false };

  assert.equal(tryAcquireInFlightLock(lock), true);
  assert.equal(tryAcquireInFlightLock(lock), false);
  assert.equal(lock.active, true);

  releaseInFlightLock(lock);
  assert.equal(lock.active, false);
  assert.equal(tryAcquireInFlightLock(lock), true);
});

test('text and attachment submissions share one lock', () => {
  const lock = { active: false };

  // A text submit owns the lock; an attachment submit in the same event turn
  // must not start a second upload or create a second message.
  assert.equal(tryAcquireInFlightLock(lock), true);
  assert.equal(tryAcquireInFlightLock(lock), false);

  releaseInFlightLock(lock);
  assert.equal(tryAcquireInFlightLock(lock), true);
});

test('both direct send handlers acquire synchronously and always release in finally', async () => {
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
    assert.match(handler, /if\(!tryAcquireInFlightLock\(directSendLockRef\.current\)\)return;/);
    assert.match(handler, /finally\{releaseInFlightLock\(directSendLockRef\.current\);setSending\(false\);\}/);
  }
  assert.match(shell, /const directSendLockRef=useRef\(\{active:false\}\)/);
});


test('account changes isolate in-flight locks from late previous-account completions', () => {
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

test('direct send completion handlers cannot update another account UI', async () => {
  const shell = await readFile(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');

  assert.match(shell, /const userIdRef=useRef\(userId\);\s*userIdRef\.current=userId;/);
  assert.match(shell, /useLayoutEffect\(\(\)=>\{\s*\/\/ A previous account's pending POST/);
  assert.match(shell, /userIdRef\.current=''[\s\S]{0,120}setSending\(false\)/);

  const textStart = shell.indexOf('async function sendMessage(');
  const textEnd = shell.indexOf('async function toggleSavedContact(', textStart);
  const mediaStart = shell.indexOf('async function sendAttachment(');
  const mediaEnd = shell.indexOf('async function logout(', mediaStart);
  const textSend = shell.slice(textStart, textEnd);
  const mediaSend = shell.slice(mediaStart, mediaEnd);

  for (const handler of [textSend, mediaSend]) {
    assert.match(handler, /tryAcquireAccountInFlightLock\(directSendLockRef,userId\)/);
    assert.match(handler, /finally\{releaseInFlightLock\(sendLock\);if\(userIdRef\.current===userId\)setSending\(false\);\}/);
    assert.match(handler, /catch\(e\)\{if\(userIdRef\.current===userId\)setError\(userFacingError\(e\)\);\}/);
  }
  assert.match(mediaSend, /if\(userIdRef\.current===userId\)setNotice\("Вложение отправлено\."\)/);
});
