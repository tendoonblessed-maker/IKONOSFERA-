import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tryAcquireInFlightLock, releaseInFlightLock } from '../lib/send-lock.mjs';

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
