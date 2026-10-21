import { useEffect, useState } from '../lib/teact/teact';

const STORAGE_KEY = 'left_column_collapsed';
const EVENT_NAME = 'left-column-collapse-changed';

export function getIsLeftColumnCollapsed(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-left-column-collapsed') === 'true';
}

export function setIsLeftColumnCollapsed(collapsed: boolean, force = false) {
  if (typeof document === 'undefined') return;

  const current = getIsLeftColumnCollapsed();
  if (!force && current === collapsed) return;

  if (collapsed) {
    document.documentElement.setAttribute('data-left-column-collapsed', 'true');
    document.documentElement.style.setProperty('--left-column-width', '4.25rem');
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {}
  } else {
    document.documentElement.removeAttribute('data-left-column-collapsed');
    const saved = parseFloat(document.documentElement.style.getPropertyValue('--saved-left-column-width'));
    const targetWidth = (saved && saved >= 260 && saved <= 600) ? `${saved}px` : '27rem';
    document.documentElement.style.setProperty('--left-column-width', targetWidth);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { collapsed } }));
}

export function toggleLeftColumnCollapsed(): boolean {
  const next = !getIsLeftColumnCollapsed();
  setIsLeftColumnCollapsed(next);
  return next;
}

export function initLeftColumnCollapsed(): void {
  if (typeof window === 'undefined') return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      document.documentElement.setAttribute('data-left-column-collapsed', 'true');
      document.documentElement.style.setProperty('--left-column-min-width', '4.25rem');
      document.documentElement.style.setProperty('--left-column-max-width', '35rem');
      document.documentElement.style.setProperty('--left-column-width', '4.25rem');
    }
  } catch {}
}

export function useIsLeftColumnCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(getIsLeftColumnCollapsed);

  useEffect(() => {
    const handleUpdate = () => {
      setCollapsed(getIsLeftColumnCollapsed());
    };

    window.addEventListener(EVENT_NAME, handleUpdate);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-left-column-collapsed') {
          handleUpdate();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-left-column-collapsed'] });

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      observer.disconnect();
    };
  }, []);

  return collapsed;
}

// Auto-run init
if (typeof document !== 'undefined') {
  initLeftColumnCollapsed();
}
