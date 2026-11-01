import { describe, expect, it } from 'vitest';

// CJS-модуль из Electron-слоя; в тестах импортируется через Node-interop.
import proxyParser from '../../electron/proxy-parser.cjs';

const { parseProxyUri, serializeProxyUri } = proxyParser as {
  parseProxyUri: (uri: string) => any;
  serializeProxyUri: (proxy: any) => string;
};

describe('parseProxyUri', () => {
  it('парсит tg://socks с авторизацией', () => {
    const proxy = parseProxyUri('tg://socks?server=1.2.3.4&port=1080&user=alice&pass=secret');
    expect(proxy).not.toBeNull();
    expect(proxy.protocol).toBe('socks5');
    expect(proxy.server).toBe('1.2.3.4');
    expect(proxy.port).toBe(1080);
    expect(proxy.auth).toEqual({ username: 'alice', password: 'secret' });
  });

  it('парсит https://t.me/socks без авторизации', () => {
    const proxy = parseProxyUri('https://t.me/socks?server=proxy.example.com&port=9050');
    expect(proxy).not.toBeNull();
    expect(proxy.server).toBe('proxy.example.com');
    expect(proxy.port).toBe(9050);
    expect(proxy.auth).toBeUndefined();
  });

  it('парсит tg://http прокси', () => {
    const proxy = parseProxyUri('tg://http?server=5.6.7.8&port=3128');
    expect(proxy).not.toBeNull();
    expect(proxy.protocol).toBe('http');
    expect(proxy.port).toBe(3128);
  });

  it('парсит классические socks5:// URI', () => {
    const proxy = parseProxyUri('socks5://bob:hunter2@10.0.0.1:7778');
    expect(proxy).not.toBeNull();
    expect(proxy.protocol).toBe('socks5');
    expect(proxy.server).toBe('10.0.0.1');
    expect(proxy.port).toBe(7778);
    expect(proxy.auth).toEqual({ username: 'bob', password: 'hunter2' });
  });

  it('отклоняет некорректный порт', () => {
    expect(parseProxyUri('tg://socks?server=1.2.3.4&port=99999')).toBeNull();
    expect(parseProxyUri('tg://socks?server=1.2.3.4&port=abc')).toBeNull();
  });

  it('отклоняет пустой и мусорный ввод', () => {
    expect(parseProxyUri('')).toBeNull();
    expect(parseProxyUri(undefined as any)).toBeNull();
    expect(parseProxyUri('not a proxy at all')).toBeNull();
  });

  it('генерирует id и сохраняет исходную ссылку', () => {
    const raw = 'tg://socks?server=1.2.3.4&port=1080';
    const proxy = parseProxyUri(raw);
    expect(proxy.id).toBeTruthy();
    expect(proxy.rawLink).toBe(raw);
  });
});

describe('serializeProxyUri', () => {
  it('сериализует обратно в валидный URI с авторизацией', () => {
    const parsed = parseProxyUri('socks5://alice:secret@1.2.3.4:1080')!;
    const serialized = serializeProxyUri(parsed);
    const reparsed = parseProxyUri(serialized)!;
    expect(reparsed).not.toBeNull();
    expect(reparsed.server).toBe('1.2.3.4');
    expect(reparsed.port).toBe(1080);
    expect(reparsed.auth).toEqual({ username: 'alice', password: 'secret' });
  });

  it('сериализует прокси без авторизации', () => {
    const parsed = parseProxyUri('tg://http?server=5.6.7.8&port=3128')!;
    const serialized = serializeProxyUri(parsed);
    const reparsed = parseProxyUri(serialized)!;
    expect(reparsed.protocol).toBe('http');
    expect(reparsed.auth).toBeUndefined();
  });
});
