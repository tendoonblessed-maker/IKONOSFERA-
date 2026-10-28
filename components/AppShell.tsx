"use client";

import { useEffect, useState } from "react";
import { messages, isLocale, type Locale } from "@/lib/i18n";

type Screen = "chats" | "settings";
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PlatformInfo = {
  ios: boolean;
  standalone: boolean;
  online: boolean;
};

export default function AppShell() {
  const [locale, setLocale] = useState<Locale>("ru");
  const [screen, setScreen] = useState<Screen>("chats");
  const [platform, setPlatform] = useState<PlatformInfo>({ ios: false, standalone: false, online: true });
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const t = messages[locale];

  useEffect(() => {
    const stored = localStorage.getItem("ikonosfera-locale");
    const initial = isLocale(stored ?? "") ? (stored as Locale) : navigator.language.toLowerCase().startsWith("en") ? "en" : "ru";
    setLocale(initial);
    document.documentElement.lang = initial;

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    const refresh = () => setPlatform({ ios: isIOS, standalone: isStandalone, online: navigator.onLine });
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setShowInstall(false);
      setInstallPrompt(null);
      setPlatform({ ios: isIOS, standalone: true, online: navigator.onLine });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (isIOS && !isStandalone && localStorage.getItem("ikonosfera-install-tip-dismissed") !== "1") {
      setShowInstall(true);
    }

    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installation may be unavailable in private browsing or restricted environments.
      });
    }
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showInstall) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissInstall();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [showInstall, platform.ios]);

  function switchLocale() {
    const next: Locale = locale === "ru" ? "en" : "ru";
    localStorage.setItem("ikonosfera-locale", next);
    document.documentElement.lang = next;
    setLocale(next);
  }

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    setShowInstall(true);
  }

  function dismissInstall() {
    setShowInstall(false);
    if (platform.ios) localStorage.setItem("ikonosfera-install-tip-dismissed", "1");
  }

  return (
    <div className="shell">
      <aside className="sidebar" aria-label={t.conversations}>
        <div className="identity">
          <div className="brand-symbol" aria-hidden="true"><span /></div>
          <div className="brand-copy"><strong>ikonosfera</strong><span>{t.subtitle}</span></div>
          <span className="version-mark" aria-label={t.beta}>00</span>
        </div>

        <div className="sidebar-content">
          <div className="sidebar-head"><h1>{t.listTitle}</h1><span className="number-count">0</span></div>
          <button type="button" className="new-chat" disabled title={t.futureFeatures} aria-label={`${t.newMessage}. ${t.notYet}`}>
            <span aria-hidden="true">+</span>{t.newMessage}
          </button>
          <div className="empty-contacts" role="status">
            <span className="empty-contacts-icon" aria-hidden="true" />
            <strong>{t.zero}</strong>
            <p>{t.listHint}</p>
          </div>
        </div>

        <div className="sidebar-navigation" aria-label={t.shell}>
          <button type="button" className={screen === "chats" ? "side-nav-active" : ""} aria-current={screen === "chats" ? "page" : undefined} onClick={() => setScreen("chats")}>{t.conversations}</button>
          <button type="button" className={screen === "settings" ? "side-nav-active" : ""} aria-current={screen === "settings" ? "page" : undefined} onClick={() => setScreen("settings")}>{t.settings}</button>
        </div>
        <div className="sidebar-footer">
          <span className="small-status-dot" aria-hidden="true" />
          <span>{t.technical}</span>
          <span className="edition">alpha 0.1</span>
        </div>
      </aside>

      <div className="page-area">
        <header className="topbar">
          <div className="topbar-name"><span className="breadcrumb">IKONOSFERA</span><span className="sep" aria-hidden="true">/</span><span>{screen === "chats" ? t.conversations : t.settings}</span></div>
          <div className="topbar-actions">
            <span className="stage-indicator">{t.beta}</span>
            <button type="button" className="language-button" onClick={switchLocale} aria-label={t.switchLanguage}>{locale.toUpperCase()} <span aria-hidden="true">↕</span></button>
          </div>
        </header>

        <main className="main-area" id="main-content">
          {screen === "chats" ? (
            <div className="home-screen">
              <div className="ambient-mark" aria-hidden="true"><span className="ring-one"/><span className="ring-two"/><span className="ring-three"/><span className="ring-core"/></div>
              <div className="home-content">
                <p className="eyebrow"><span className="eyebrow-stroke" />{t.beginning}</p>
                <h2>{t.heading}</h2>
                <p className="intro-text">{t.headingText}</p>
                <div className="stage-grid" aria-label={t.currentStatus}>
                  <div className="stage-card"><span className="card-meta">01 / Interface</span><span className="card-value">{t.working}</span><span className="state-label ready"><span />{t.beta}</span></div>
                  <div className="stage-card"><span className="card-meta">02 / Messaging</span><span className="card-value">{t.unavailable}</span><span className="state-label pending"><span />{t.disconnected}</span></div>
                </div>
                <p className="subnote">{t.next}</p>
              </div>
              <div className="bottom-hint" role="status"><span className="hint-symbol" aria-hidden="true">i</span>{t.demoNotice}</div>
            </div>
          ) : (
            <div className="settings-screen">
              <p className="eyebrow"><span className="eyebrow-stroke" />{t.technical}</p>
              <h2>{t.settings}</h2>
              <p className="intro-text">{t.futureFeatures}</p>
              <section className="settings-card" aria-label={t.currentStatus}>
                <h3>{t.currentStatus}</h3>
                <div className="settings-line"><span>{t.backend}</span><strong>{t.disconnected}</strong></div>
                <div className="settings-line"><span>{t.platform}</span><strong>{platform.ios ? t.iphone : t.desktop}</strong></div>
                <div className="settings-line"><span>{t.appMode}</span><strong>{platform.standalone ? t.standalone : t.browser}</strong></div>
                <div className="settings-line"><span>{t.connectivity}</span><strong>{platform.online ? t.online : t.offline}</strong></div>
                <div className="settings-line"><span>{t.locale}</span><button type="button" className="inline-control" onClick={switchLocale}>{locale.toUpperCase()}</button></div>
              </section>
              <section className="settings-card" aria-label={t.pwaSettings}>
                <h3>{t.pwaSettings}</h3>
                <p className="settings-text">{t.accessibility}</p>
                {!platform.standalone && <button type="button" className="outline-button" onClick={install}>{installPrompt ? t.install : t.openInstall}</button>}
              </section>
            </div>
          )}
        </main>

        <nav className="bottom-nav" aria-label={t.shell}>
          <button type="button" aria-current={screen === "chats" ? "page" : undefined} className={screen === "chats" ? "bottom-nav-active" : ""} onClick={() => setScreen("chats")}>
            <span className="nav-circle" aria-hidden="true" />{t.conversations}
          </button>
          <button type="button" aria-current={screen === "settings" ? "page" : undefined} className={screen === "settings" ? "bottom-nav-active" : ""} onClick={() => setScreen("settings")}>
            <span className="nav-settings" aria-hidden="true" />{t.settings}
          </button>
        </nav>
      </div>

      {showInstall && !platform.standalone && (
        <div className="install-panel" role="dialog" aria-modal="true" aria-labelledby="install-title">
          <div className="install-sheet">
            <div className="install-drag" aria-hidden="true" />
            <span className="install-tag">IKONOSFERA / PWA</span>
            <h2 id="install-title">{platform.ios ? t.installInstructions : t.install}</h2>
            <p>{platform.ios ? t.iosInstruction : t.otherInstall}</p>
            <div className="install-steps" aria-hidden="true"><span>Safari</span><span>▢↑</span><span>+</span><span>IKONOSFERA</span></div>
            <p className="install-caption">{t.installationDescription}</p>
            <button type="button" className="primary-button" onClick={dismissInstall} autoFocus>{t.dismiss}</button>
          </div>
        </div>
      )}
    </div>
  );
}
