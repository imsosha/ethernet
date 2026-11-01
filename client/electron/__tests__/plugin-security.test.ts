import { describe, expect, it } from 'vitest';

// CJS-модуль из Electron-слоя; тестируем экспортированные для этого функции.
import ethernetFs from '../../electron/ethernet-fs.cjs';

const { analyzePluginSecurity, parsePluginMetadata, parseDeclaredPermissions, cleanVersion } = ethernetFs as {
  analyzePluginSecurity: (code: string, declaredPermissions?: string[]) => {
    valid: boolean;
    errors: string[];
    warnings: string[];
    hasDangerousPermissions?: boolean;
    dangerousPermissions?: string[];
  };
  parsePluginMetadata: (code: string) => Record<string, string>;
  parseDeclaredPermissions: (code: string, manifest?: { permissions?: string[] }) => string[];
  cleanVersion: (ver?: string) => string;
};

describe('analyzePluginSecurity', () => {
  const safePlugin = `
    // @name Safe Plugin
    // @permissions dom.style, storage.local
    ethernet.addStyle('body { color: red; }');
    ethernet.storage.set('k', 1);
  `;

  it('пропускает безопасный плагин', () => {
    const result = analyzePluginSecurity(safePlugin, ['dom.style', 'storage.local']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('отклоняет пустой код', () => {
    expect(analyzePluginSecurity('').valid).toBe(false);
    expect(analyzePluginSecurity(undefined as any).valid).toBe(false);
  });

  it('отклоняет eval()', () => {
    const result = analyzePluginSecurity('eval("1+1")', []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('eval'))).toBe(true);
  });

  it('отклоняет new Function()', () => {
    const result = analyzePluginSecurity('const f = new Function("return 1");', []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Function'))).toBe(true);
  });

  it('отклоняет require()', () => {
    const result = analyzePluginSecurity('require("fs")', []);
    expect(result.valid).toBe(false);
  });

  it('отклоняет доступ к process.*', () => {
    const result = analyzePluginSecurity('const p = process.env;', []);
    expect(result.valid).toBe(false);
  });

  it('требует permissions для перехвата сети', () => {
    const result = analyzePluginSecurity('ethernet.api.beforeRequest(cb);', []);
    expect(result.valid).toBe(false);
    const ok = analyzePluginSecurity('ethernet.api.beforeRequest(cb);', ['network.intercept']);
    expect(ok.valid).toBe(true);
  });

  it('требует credentials для доступа к user_auth', () => {
    const result = analyzePluginSecurity('localStorage.getItem(\'user_auth\')', []);
    expect(result.valid).toBe(false);
    const ok = analyzePluginSecurity('localStorage.getItem(\'user_auth\')', ['credentials']);
    expect(ok.valid).toBe(true);
  });

  it('помечает опасные разрешения', () => {
    const result = analyzePluginSecurity(safePlugin, ['credentials', 'dom.style']);
    expect(result.hasDangerousPermissions).toBe(true);
    expect(result.dangerousPermissions).toContain('credentials');
  });
});

describe('parsePluginMetadata', () => {
  it('парсит директивы @name/@description/@version/@author', () => {
    const code = `
      // @name Мой плагин
      // @description Делает красиво
      // @version 1.2.3
      // @author Иванов
    `;
    const meta = parsePluginMetadata(code);
    expect(meta.name).toBe('Мой плагин');
    expect(meta.description).toBe('Делает красиво');
    expect(meta.version).toBe('1.2.3');
    expect(meta.author).toBe('Иванов');
  });

  it('парсит themeDependency', () => {
    const meta = parsePluginMetadata('// @themeDependency Sakura');
    expect(meta.themeDependency).toBe('Sakura');
  });

  it('достаёт svg-иконку из @icon', () => {
    const meta = parsePluginMetadata('// @icon <svg viewBox="0 0 24 24"><path d="M0 0"/></svg>');
    expect(meta.icon).toContain('<svg');
  });

  it('возвращает пустой объект для пустого кода', () => {
    expect(parsePluginMetadata('')).toEqual({});
    expect(parsePluginMetadata(undefined as any)).toEqual({});
  });
});

describe('parseDeclaredPermissions', () => {
  it('берёт разрешения из манифеста и из кода', () => {
    const code = '// @permissions dom.style, ui.toast';
    const result = parseDeclaredPermissions(code, { permissions: ['storage.local', 'dom.style'] });
    expect(result).toContain('dom.style');
    expect(result).toContain('ui.toast');
    expect(result).toContain('storage.local');
  });

  it('убирает дубликаты', () => {
    const result = parseDeclaredPermissions('// @permissions dom.style', { permissions: ['dom.style'] });
    expect(result.filter((p) => p === 'dom.style')).toHaveLength(1);
  });
});

describe('cleanVersion', () => {
  it('чистит префиксы и мусор', () => {
    expect(cleanVersion('1.0.0')).toBe('1.0.0');
    expect(cleanVersion('v2.0')).toBe('2.0');
    expect(cleanVersion(': 3.0.0')).toBe('3.0.0');
    expect(cleanVersion('4.0.0 */ x')).toBe('4.0.0');
    expect(cleanVersion('')).toBe('');
    expect(cleanVersion(undefined)).toBe('');
  });
});
