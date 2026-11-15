'use client';

import { useEffect, useState } from 'react';
import {
  BEFORE_APP_UPDATE_EVENT,
  controllerChangeResult,
  createServiceWorkerUpdateChecker,
  reloadAfterPersistingDrafts,
  shouldCheckServiceWorkerUpdate,
  shouldShowWaitingServiceWorkerUpdate,
} from '@/lib/service-worker-update';

export default function ServiceWorkerUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    let disposed = false;
    let controlled = Boolean(navigator.serviceWorker.controller);
    let registration: ServiceWorkerRegistration | null = null;
    let updateNoticeShown = false;
    const runUpdateCheck = createServiceWorkerUpdateChecker();

    const announceUpdate = () => {
      updateNoticeShown = true;
      setAvailable(true);
    };

    const checkForUpdate = () => {
      const activeRegistration = registration;
      if (!activeRegistration || updateNoticeShown || !shouldCheckServiceWorkerUpdate({
        disposed,
        controlled,
        visible: document.visibilityState === 'visible',
        online: navigator.onLine,
        updateAvailable: updateNoticeShown,
      })) return;

      void runUpdateCheck(async () => {
        await activeRegistration.update();
        if (!disposed && shouldShowWaitingServiceWorkerUpdate(
          controlled,
          Boolean(activeRegistration.waiting),
        )) announceUpdate();
      });
    };

    const onControllerChange = () => {
      if (disposed) return;
      const next = controllerChangeResult(controlled);
      controlled = next.controlled;
      if (next.updateAvailable) announceUpdate();
    };
    const onVisibilityChange = () => checkForUpdate();
    const onOnline = () => checkForUpdate();
    const onFocus = () => checkForUpdate();
    // Do not let the update button interrupt an active IME pre-edit session.
    const onCompositionStart = () => setComposing(true);
    const onCompositionEnd = () => setComposing(false);

    document.addEventListener('compositionstart', onCompositionStart, true);
    document.addEventListener('compositionend', onCompositionEnd, true);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);

    void navigator.serviceWorker.register('/sw.js').then((nextRegistration) => {
      if (disposed) return;
      registration = nextRegistration;
      if (shouldShowWaitingServiceWorkerUpdate(controlled, Boolean(registration.waiting))) {
        announceUpdate();
      }
    }).catch(() => {
      // Offline, unsupported or blocked registration must not affect chat startup.
    });

    return () => {
      disposed = true;
      document.removeEventListener('compositionstart', onCompositionStart, true);
      document.removeEventListener('compositionend', onCompositionEnd, true);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!available) return null;

  return (
    <aside className="ik-sw-update-notice" role="status" aria-live="polite">
      <span>Доступна новая версия IKONOSFERA</span>
      <button type="button" disabled={composing}
        aria-describedby={composing ? 'ik-sw-update-composition-hint' : undefined}
        onClick={() => reloadAfterPersistingDrafts(
          () => window.dispatchEvent(new Event(BEFORE_APP_UPDATE_EVENT)),
          () => window.location.reload(),
        )}>
        {composing ? 'Завершите ввод…' : 'Обновить'}
      </button>
      {composing && <span id="ik-sw-update-composition-hint">
        Завершите ввод, затем обновите приложение.
      </span>}
    </aside>
  );
}
