import { createContext, useContext, useEffect, useState } from 'react';
import './InstallPrompt.css';

const STORAGE_KEY = 'uclass_pwa_installed';
const API_BASE = () => import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const InstallContext = createContext({ canInstall: false, triggerInstall: () => {} });

export function useInstallPrompt() {
  return useContext(InstallContext);
}

export function InstallProvider({ children }) {
  const [prompt, setPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    let deferredEvent = null;
    let timer = null;

    const handler = e => {
      e.preventDefault();
      deferredEvent = e;
      // fires only when not installed — clear any old flag
      localStorage.removeItem(STORAGE_KEY);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setPrompt(deferredEvent);
        setVisible(true);
      }, 5000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, []);

  const recordInstall = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    fetch(`${API_BASE()}/pwa/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_agent: navigator.userAgent }),
    }).catch(() => {});
  };

  const triggerInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') recordInstall();
    setPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => setVisible(false);

  return (
    <InstallContext.Provider value={{ canInstall: !!prompt, triggerInstall }}>
      {children}
      {visible && prompt && (
        <div className="install-backdrop" onClick={handleDismiss}>
          <div className="install-popup" onClick={e => e.stopPropagation()}>
            <button className="install-close" onClick={handleDismiss} aria-label="Close">✕</button>
            <div className="install-icon">🎓</div>
            <div className="install-name">UClass</div>
            <button className="install-btn" onClick={triggerInstall}>
              📲 INSTALL THIS APP
            </button>
          </div>
        </div>
      )}
    </InstallContext.Provider>
  );
}

// Default export kept for backward compat — renders nothing (provider does the work)
export default function InstallPrompt() { return null; }
