import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_GHOST_SETTINGS,
  getEffectiveGhostSettings,
  getGhostStorage,
  getIsNftGiftsDisabled,
  type GhostStorage,
  isGhostActionBlocked,
  isLocallyDeletedMessage,
  markLocallyDeletedMessages,
  saveGhostStorage,
} from '../ghostMode';

// В тестовой среде localStorage недоступен (Node >= 22 требует --localstorage-file),
// поэтому состояние задаём напрямую через saveGhostStorage(..., false).
function resetToDefaults() {
  saveGhostStorage({
    global: { ...DEFAULT_GHOST_SETTINGS },
    accounts: {},
  }, false);
}

describe('getEffectiveGhostSettings', () => {
  beforeEach(resetToDefaults);
  afterEach(resetToDefaults);

  it('по умолчанию возвращает дефолтные настройки', () => {
    const settings = getEffectiveGhostSettings();
    expect(settings.enabled).toBe(DEFAULT_GHOST_SETTINGS.enabled);
    expect(settings.dontReadMessages).toBe(DEFAULT_GHOST_SETTINGS.dontReadMessages);
    expect(settings.sendWithoutSound).toBe('never');
  });

  it('настройки аккаунта переопределяют глобальные', () => {
    saveGhostStorage({
      global: { ...DEFAULT_GHOST_SETTINGS, dontReadMessages: true },
      accounts: { user1: { ...DEFAULT_GHOST_SETTINGS, dontReadMessages: false } },
    }, false);
    expect(getEffectiveGhostSettings('user1').dontReadMessages).toBe(false);
    expect(getEffectiveGhostSettings('user2').dontReadMessages).toBe(true);
  });

  it('явное false в аккаунте не заменяется дефолтом', () => {
    saveGhostStorage({
      global: { ...DEFAULT_GHOST_SETTINGS },
      accounts: { user1: { ...DEFAULT_GHOST_SETTINGS, enabled: false } },
    }, false);
    expect(getEffectiveGhostSettings('user1').enabled).toBe(false);
  });
});

describe('isGhostActionBlocked', () => {
  beforeEach(resetToDefaults);
  afterEach(resetToDefaults);

  it('блокирует действия при включённом ghost-режиме', () => {
    expect(isGhostActionBlocked('readMessages')).toBe(Boolean(DEFAULT_GHOST_SETTINGS.dontReadMessages));
    expect(isGhostActionBlocked('sendTyping')).toBe(Boolean(DEFAULT_GHOST_SETTINGS.dontSendTyping));
  });

  it('ничего не блокирует при выключенном ghost-режиме', () => {
    saveGhostStorage({
      global: { ...DEFAULT_GHOST_SETTINGS, enabled: false },
      accounts: {},
    }, false);
    expect(isGhostActionBlocked('readMessages')).toBe(false);
    expect(isGhostActionBlocked('sendOnline')).toBe(false);
  });

  it('настройка аккаунта влияет только на него', () => {
    saveGhostStorage({
      global: { ...DEFAULT_GHOST_SETTINGS, dontReadStories: false },
      accounts: { user1: { ...DEFAULT_GHOST_SETTINGS, dontReadStories: true } },
    }, false);
    expect(isGhostActionBlocked('readStories', 'user1')).toBe(true);
    expect(isGhostActionBlocked('readStories', 'other')).toBe(false);
  });
});

describe('локально удалённые сообщения', () => {
  it('помеченные id считаются удалёнными до истечения', () => {
    markLocallyDeletedMessages([101, 202]);
    expect(isLocallyDeletedMessage(101)).toBe(true);
    expect(isLocallyDeletedMessage(202)).toBe(true);
    expect(isLocallyDeletedMessage(303)).toBe(false);
  });
});

describe('getIsNftGiftsDisabled / хранилище', () => {
  beforeEach(resetToDefaults);
  afterEach(resetToDefaults);

  it('переключение disableNftGifts меняет флаг', () => {
    expect(getIsNftGiftsDisabled()).toBe(DEFAULT_GHOST_SETTINGS.disableNftGifts);
    saveGhostStorage({
      global: { ...DEFAULT_GHOST_SETTINGS, disableNftGifts: true },
      accounts: {},
    }, false);
    expect(getIsNftGiftsDisabled()).toBe(true);
  });

  it('getGhostStorage отдаёт сохранённое состояние', () => {
    const storage: GhostStorage = getGhostStorage();
    expect(storage.global).toEqual(DEFAULT_GHOST_SETTINGS);
    expect(storage.accounts).toEqual({});
  });
});
