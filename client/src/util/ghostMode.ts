export type SendWithoutSoundOption = 'never' | 'always' | 'groups_only';

export type GhostSettings = {
  enabled: boolean;
  dontReadMessages: boolean;
  dontReadStories: boolean;
  dontSendOnline: boolean;
  dontSendTyping: boolean;
  autoOffline: boolean;
  readOnInteract: boolean;
  scheduleMessages: boolean;
  sendWithoutSound: SendWithoutSoundOption;
  saveDeletedMessages: boolean;
  saveEditsHistory: boolean;
  saveInBotDialogs: boolean;
  disableAds: boolean;
  disableAllNotifications: boolean;
  disableCloseToTray: boolean;
  disableNftGifts: boolean;
};

export const DEFAULT_GHOST_SETTINGS: GhostSettings = {
  enabled: true,
  dontReadMessages: true,
  dontReadStories: true,
  dontSendOnline: true,
  dontSendTyping: true,
  autoOffline: true,
  readOnInteract: false,
  scheduleMessages: false,
  sendWithoutSound: 'never',
  saveDeletedMessages: true,
  saveEditsHistory: true,
  saveInBotDialogs: false,
  disableAds: true,
  disableAllNotifications: false,
  disableCloseToTray: false,
  disableNftGifts: false,
};

export type GhostStorage = {
  global: GhostSettings;
  accounts: Record<string, GhostSettings>;
};

const STORAGE_KEY = 'ethernet_ghost_mode';

function loadStorage(): GhostStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          global: { ...DEFAULT_GHOST_SETTINGS, ...(parsed.global || {}) },
          accounts: parsed.accounts || {},
        };
      }
    }
  } catch {}
  return {
    global: { ...DEFAULT_GHOST_SETTINGS },
    accounts: {},
  };
}

function updateDomAdsAttribute() {
  if (typeof document !== 'undefined' && document.documentElement) {
    if (isAdsDisabled()) {
      document.documentElement.dataset.ethernetDisableAds = 'true';
    } else {
      delete document.documentElement.dataset.ethernetDisableAds;
    }
  }
}

function updateDomNftGiftsAttribute() {
  if (typeof document !== 'undefined' && document.documentElement) {
    if (getIsNftGiftsDisabled()) {
      document.documentElement.dataset.ethernetDisableNftGifts = 'true';
      document.documentElement.setAttribute('data-disable-nft-gifts', 'true');
    } else {
      delete document.documentElement.dataset.ethernetDisableNftGifts;
      document.documentElement.removeAttribute('data-disable-nft-gifts');
    }
  }
}

export function getIsNftGiftsDisabled(): boolean {
  return Boolean(currentStorage.global?.disableNftGifts);
}

let currentStorage: GhostStorage = loadStorage();

if (typeof window !== 'undefined') {
  (window as any).__ethernetGhostStorage = currentStorage;
  updateDomAdsAttribute();
  updateDomNftGiftsAttribute();

  if (window.ethernetDesktop?.onNotificationsDisabledChange) {
    window.ethernetDesktop.onNotificationsDisabledChange((disabled: boolean) => {
      const storage = getGhostStorage();
      if (storage.global.disableAllNotifications !== disabled) {
        saveGhostStorage({
          ...storage,
          global: {
            ...storage.global,
            disableAllNotifications: disabled,
          },
        }, false);
      }
    });
  }

  if (window.ethernetDesktop?.notificationsDisabledGet) {
    window.ethernetDesktop.notificationsDisabledGet().then((disabled: boolean) => {
      if (typeof disabled === 'boolean') {
        const storage = getGhostStorage();
        if (storage.global.disableAllNotifications !== disabled) {
          saveGhostStorage({
            ...storage,
            global: {
              ...storage.global,
              disableAllNotifications: disabled,
            },
          }, false);
        }
      }
    }).catch(() => {});
  }

  if (window.ethernetDesktop?.closeToTrayDisabledGet) {
    window.ethernetDesktop.closeToTrayDisabledGet().then((disabled: boolean) => {
      if (typeof disabled === 'boolean') {
        const storage = getGhostStorage();
        if (storage.global.disableCloseToTray !== disabled) {
          saveGhostStorage({
            ...storage,
            global: {
              ...storage.global,
              disableCloseToTray: disabled,
            },
          }, false);
        }
      }
    }).catch(() => {});
  }
}

const listeners = new Set<(storage: GhostStorage) => void>();

export function getGhostStorage(): GhostStorage {
  return currentStorage;
}

export function saveGhostStorage(storage: GhostStorage, syncToDesktop = true) {
  currentStorage = storage;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    }
  } catch {}
  if (typeof window !== 'undefined') {
    (window as any).__ethernetGhostStorage = storage;
    updateDomAdsAttribute();
    updateDomNftGiftsAttribute();
    if (syncToDesktop && window.ethernetDesktop?.notificationsDisabledSet) {
      window.ethernetDesktop.notificationsDisabledSet(Boolean(storage.global.disableAllNotifications));
    }
    if (syncToDesktop && window.ethernetDesktop?.closeToTrayDisabledSet) {
      window.ethernetDesktop.closeToTrayDisabledSet(Boolean(storage.global.disableCloseToTray));
    }
  }
  listeners.forEach((l) => {
    try { l(storage); } catch {}
  });
}

export function subscribeGhostStorage(listener: (storage: GhostStorage) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getEffectiveGhostSettings(userId?: string): GhostSettings {
  const base = (userId && currentStorage.accounts?.[userId]) || currentStorage.global || {};
  return {
    enabled: base.enabled !== undefined ? Boolean(base.enabled) : DEFAULT_GHOST_SETTINGS.enabled,
    dontReadMessages: base.dontReadMessages !== undefined ? Boolean(base.dontReadMessages) : DEFAULT_GHOST_SETTINGS.dontReadMessages,
    dontReadStories: base.dontReadStories !== undefined ? Boolean(base.dontReadStories) : DEFAULT_GHOST_SETTINGS.dontReadStories,
    dontSendOnline: base.dontSendOnline !== undefined ? Boolean(base.dontSendOnline) : DEFAULT_GHOST_SETTINGS.dontSendOnline,
    dontSendTyping: base.dontSendTyping !== undefined ? Boolean(base.dontSendTyping) : DEFAULT_GHOST_SETTINGS.dontSendTyping,
    autoOffline: base.autoOffline !== undefined ? Boolean(base.autoOffline) : DEFAULT_GHOST_SETTINGS.autoOffline,
    readOnInteract: base.readOnInteract !== undefined ? Boolean(base.readOnInteract) : DEFAULT_GHOST_SETTINGS.readOnInteract,
    scheduleMessages: base.scheduleMessages !== undefined ? Boolean(base.scheduleMessages) : DEFAULT_GHOST_SETTINGS.scheduleMessages,
    sendWithoutSound: base.sendWithoutSound || DEFAULT_GHOST_SETTINGS.sendWithoutSound,
    saveDeletedMessages: base.saveDeletedMessages !== undefined ? Boolean(base.saveDeletedMessages) : DEFAULT_GHOST_SETTINGS.saveDeletedMessages,
    saveEditsHistory: base.saveEditsHistory !== undefined ? Boolean(base.saveEditsHistory) : DEFAULT_GHOST_SETTINGS.saveEditsHistory,
    saveInBotDialogs: base.saveInBotDialogs !== undefined ? Boolean(base.saveInBotDialogs) : DEFAULT_GHOST_SETTINGS.saveInBotDialogs,
    disableAds: base.disableAds !== undefined ? Boolean(base.disableAds) : DEFAULT_GHOST_SETTINGS.disableAds,
    disableAllNotifications: base.disableAllNotifications !== undefined ? Boolean(base.disableAllNotifications) : DEFAULT_GHOST_SETTINGS.disableAllNotifications,
    disableCloseToTray: base.disableCloseToTray !== undefined ? Boolean(base.disableCloseToTray) : DEFAULT_GHOST_SETTINGS.disableCloseToTray,
  };
}

export function isAdsDisabled(userId?: string): boolean {
  const storage = (typeof window !== 'undefined' && (window as any).__ethernetGhostStorage) || currentStorage;
  const settings = (userId && storage.accounts?.[userId])
    ? { ...DEFAULT_GHOST_SETTINGS, ...storage.accounts[userId] }
    : { ...DEFAULT_GHOST_SETTINGS, ...(storage.global || {}) };

  return Boolean(settings.disableAds);
}

export function isAllNotificationsDisabled(userId?: string): boolean {
  const storage = (typeof window !== 'undefined' && (window as any).__ethernetGhostStorage) || currentStorage;
  const settings = (userId && storage.accounts?.[userId])
    ? { ...DEFAULT_GHOST_SETTINGS, ...storage.accounts[userId] }
    : { ...DEFAULT_GHOST_SETTINGS, ...(storage.global || {}) };

  return Boolean(settings.disableAllNotifications);
}

export function isCloseToTrayDisabled(): boolean {
  const storage = (typeof window !== 'undefined' && (window as any).__ethernetGhostStorage) || currentStorage;
  return Boolean(storage.global?.disableCloseToTray);
}

export function isGhostActionBlocked(
  action: 'readMessages' | 'readStories' | 'sendOnline' | 'sendTyping' | 'autoOffline',
  userId?: string,
): boolean {
  const storage = (typeof window !== 'undefined' && (window as any).__ethernetGhostStorage) || currentStorage;
  const settings = (userId && storage.accounts?.[userId])
    ? { ...DEFAULT_GHOST_SETTINGS, ...storage.accounts[userId] }
    : { ...DEFAULT_GHOST_SETTINGS, ...(storage.global || {}) };

  if (!settings.enabled) return false;
  switch (action) {
    case 'readMessages': return Boolean(settings.dontReadMessages);
    case 'readStories': return Boolean(settings.dontReadStories);
    case 'sendOnline': return Boolean(settings.dontSendOnline);
    case 'sendTyping': return Boolean(settings.dontSendTyping);
    case 'autoOffline': return Boolean(settings.autoOffline);
    default: return false;
  }
}

const locallyDeletedMessageTimestamps = new Map<number, number>();
const LOCAL_DELETE_EXPIRATION_MS = 120000; // 2 minutes

export function markLocallyDeletedMessages(ids: number[]) {
  const now = Date.now();
  ids.forEach((id) => locallyDeletedMessageTimestamps.set(id, now));
}

export function isLocallyDeletedMessage(id: number): boolean {
  const timestamp = locallyDeletedMessageTimestamps.get(id);
  if (!timestamp) return false;
  if (Date.now() - timestamp > LOCAL_DELETE_EXPIRATION_MS) {
    locallyDeletedMessageTimestamps.delete(id);
    return false;
  }
  return true;
}

export function unmarkLocallyDeletedMessage(id: number) {
  // Retain the mark within the 2-minute window to handle duplicate MTProto updates
}

