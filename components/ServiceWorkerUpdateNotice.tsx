'use client';

import { useEffect, useState } from 'react';
import {
  controllerChangeResult,
  shouldShowWaitingServiceWorkerUpdate,
} from '@/lib/service-worker-update';

export default function ServiceWorkerUpdateNotice() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    let disposed = false;
    let controlled = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (disposed) return;
      const next = controllerChangeResult(controlled);
      controlled = next.controlled;
      if (next.updateAvailable) setAvailable(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (disposed) return;
      if (shouldShowWaitingServiceWorkerUpdate(controlled, Boolean(registration.waiting))) {
        setAvailable(true);
      }
    }).catch(() => {
      // Offline, unsupported or blocked registration must not affect chat startup.
    });

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
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
