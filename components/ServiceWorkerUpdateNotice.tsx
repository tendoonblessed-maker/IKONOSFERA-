'use client';

import { useEffect, useState } from 'react';
import {
  controllerChangeResult,
  createServiceWorkerUpdateChecker,
  shouldCheckServiceWorkerUpdate,
  shouldShowWaitingServiceWorkerUpdate,
} from '@/lib/service-worker-update';

export default function ServiceWorkerUpdateNotice() {
  const [available, setAvailable] = useState(false);

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
      <button type="button" onClick={() => window.location.reload()}>
        Обновить
      </button>
    </aside>
  );
}
