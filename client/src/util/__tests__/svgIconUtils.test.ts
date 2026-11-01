import { describe, expect, it } from 'vitest';

import { formatVersion, isSvgIcon, sanitizeSvg } from '../svgIconUtils';

describe('sanitizeSvg', () => {
  it('оставляет безопасный SVG без изменений', () => {
    const svg = '<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 2L2 7"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('<svg');
    expect(result).toContain('viewBox="0 0 24 24"');
    expect(result).toContain('M12 2L2 7');
  });

  it('вырезает <script> внутри SVG', () => {
    const svg = '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('<path');
  });

  it('вырезает обработчики событий (обычные и entity-обфусцированные)', () => {
    const svg = '<svg viewBox="0 0 24 24"><a onload="alert(1)"><path d="M0 0"/></a></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert(1)');
  });

  it('блокирует javascript: URI, включая entity-кодирование', () => {
    const svg = '<svg viewBox="0 0 24 24"><a xlink:href="javascript:alert(1)"><path d="M0 0"/></a>'
      + '<a href="&#106;&#97;&#118;&#97;script:alert(2)"><rect/></a></svg>';
    const result = sanitizeSvg(svg);
    expect(result.toLowerCase()).not.toContain('javascript:');
  });

  it('вырезает SMIL-анимации, способные инжектировать обработчики', () => {
    const svg = '<svg viewBox="0 0 24 24"><animate attributeName="onbegin" to="alert(1)"/><path d="M0 0"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('<animate');
  });

  it('вырезает обработчики событий у корневого <svg>', () => {
    const svg = '<svg viewBox="0 0 24 24" onload="alert(1)" onerror="alert(2)"><path d="M0 0"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('onload');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
  });

  it('блокирует javascript: URI у корневого <svg>', () => {
    const svg = '<svg viewBox="0 0 24 24" href="javascript:alert(1)"><path d="M0 0"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result.toLowerCase()).not.toContain('javascript:');
  });

  it('вырезает опасный style у корневого <svg>', () => {
    const svg = '<svg viewBox="0 0 24 24" style="background:url(javascript:alert(1))"><path d="M0 0"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result.toLowerCase()).not.toContain('javascript:');
  });

  it('вырезает foreignObject и use', () => {
    const svg = '<svg viewBox="0 0 24 24"><foreignObject><body>x</body></foreignObject>'
      + '<use href="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+"/><path d="M0 0"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('<foreignObject');
    expect(result).not.toContain('<use');
  });

  it('возвращает пустую строку для не-SVG входа', () => {
    expect(sanitizeSvg('<div>test</div>')).toBe('');
    expect(sanitizeSvg('')).toBe('');
    expect(sanitizeSvg(undefined)).toBe('');
  });

  it('возвращает пустую строку для сломанного SVG', () => {
    expect(sanitizeSvg('<svg><path></svg><oops>')).toBe('');
  });

  it('подставляет viewBox, если его нет', () => {
    const svg = '<svg width="48" height="48"><path d="M0 0"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('viewBox="0 0 48 48"');
  });

  it('обрабатывает data:image/svg+xml URI', () => {
    const encoded = encodeURIComponent('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>');
    const result = sanitizeSvg(`data:image/svg+xml,${encoded}`);
    expect(result).toContain('<svg');
    expect(result).toContain('M0 0');
  });

  it('растровые data-URI превращает в <img>', () => {
    const result = sanitizeSvg('data:image/png;base64,iVBORw0KGgo=');
    expect(result).toContain('<img');
    expect(result).toContain('data:image/png;base64,iVBORw0KGgo=');
  });
});

describe('isSvgIcon', () => {
  it('распознаёт svg и data:image', () => {
    expect(isSvgIcon('<svg viewBox="0 0 24 24"/>')).toBe(true);
    expect(isSvgIcon('data:image/png;base64,AAA')).toBe(true);
    expect(isSvgIcon('<div/>')).toBe(false);
    expect(isSvgIcon(undefined)).toBe(false);
  });
});

describe('formatVersion', () => {
  it('чистит мусор вокруг версии', () => {
    expect(formatVersion('1.2.3')).toBe('v1.2.3');
    expect(formatVersion('v2.0.0')).toBe('v2.0.0');
    expect(formatVersion('V3.1')).toBe('v3.1');
    expect(formatVersion('4.2.0 */ trailing')).toBe('v4.2.0');
    expect(formatVersion(':5.0.0')).toBe('v5.0.0');
    expect(formatVersion('')).toBe('');
    expect(formatVersion(undefined)).toBe('');
  });
});
