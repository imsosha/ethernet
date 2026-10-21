import { useEffect, useState } from '../lib/teact/teact';

const STORAGE_KEY = 'sidebar_pinned';
const EVENT_NAME = 'sidebar-pinned-changed';

export function getIsSidebarPinned(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-sidebar-pinned') === 'true';
}

export function setIsSidebarPinned(pinned: boolean) {
  if (typeof document === 'undefined') return;

  const current = getIsSidebarPinned();
  if (current === pinned) return;

  if (pinned) {
    document.documentElement.setAttribute('data-sidebar-pinned', 'true');
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {}
  } else {
    document.documentElement.removeAttribute('data-sidebar-pinned');
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { pinned } }));
}

export function toggleSidebarPinned(): boolean {
  const next = !getIsSidebarPinned();
  setIsSidebarPinned(next);
  return next;
}

export function initSidebarPinned(): void {
  if (typeof window === 'undefined') return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      document.documentElement.setAttribute('data-sidebar-pinned', 'true');
    }
  } catch {}
}

export function useIsSidebarPinned(): boolean {
  const [pinned, setPinned] = useState(getIsSidebarPinned);

  useEffect(() => {
    const handleUpdate = () => {
      setPinned(getIsSidebarPinned());
    };

    window.addEventListener(EVENT_NAME, handleUpdate);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-sidebar-pinned') {
          handleUpdate();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sidebar-pinned'] });

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      observer.disconnect();
    };
  }, []);

  return pinned;
}

// Auto-run init
if (typeof document !== 'undefined') {
  initSidebarPinned();
}
