import { describe, expect, it } from 'vitest';

import { getEthernetString } from '../ethernetLang';

const makeLang = (code: string) => {
  const fn = (key: string) => `fallback:${key}`;
  (fn as any).code = code;
  return fn as any;
};

describe('getEthernetString', () => {
  it('возвращает русскую строку для ru-локали', () => {
    expect(getEthernetString(makeLang('ru'), 'EthernetPlugins')).toBe('Плагины');
    expect(getEthernetString(makeLang('ru-RU'), 'EthernetPlugins')).toBe('Плагины');
  });

  it('возвращает английскую строку для en-локали', () => {
    expect(getEthernetString(makeLang('en'), 'EthernetPlugins')).toBe('Plugins');
    expect(getEthernetString(makeLang('en-US'), 'EthernetPlugins')).toBe('Plugins');
  });

  it('фоллбэк на lang(), если ключ не из словаря', () => {
    expect(getEthernetString(makeLang('ru'), 'UnknownKey')).toBe('fallback:UnknownKey');
  });

  it('возвращает сам ключ, если lang отсутствует', () => {
    expect(getEthernetString(undefined, 'EthernetPlugins')).toBe('Плагины');
    expect(getEthernetString(undefined, 'TotallyMissing')).toBe('TotallyMissing');
  });
});
