/**
 * Безопасная обработка и рендеринг SVG-иконок для тем и плагинов.
 *
 * Санитизация выполняется через DOM-парсер (DOMParser в XML-режиме),
 * а не через regex: парсер декодирует HTML-сущности и разбирает вложенные
 * теги, поэтому обходы вида `<svg><a xlink:href="&#106;avascript:...">`
 * отсекаются надёжно.
 */

const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'frame',
  'object',
  'embed',
  'applet',
  'foreignobject',
  'use',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
  'handler',
  'listener',
  'link',
  'base',
  'meta',
]);

const URI_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction']);

function isSafeUri(value: string): boolean {
  const v = value.trim().toLowerCase().replace(/[\s]+/g, '');
  return !v.startsWith('javascript:')
    && !v.startsWith('vbscript:')
    && !v.startsWith('data:text')
    && !v.startsWith('data:application');
}

const CSS_DANGEROUS_URL = /\burl\s*\(\s*['"]?\s*(?!#|data:image\/(?!svg))/i;

function hasDangerousStyle(value: string): boolean {
  const v = value.toLowerCase();
  return v.includes('expression(') || v.includes('javascript:') || CSS_DANGEROUS_URL.test(value);
}

function sanitizeElement(el: Element): void {
  // 1. Чистим атрибуты самого элемента — включая корневой <svg>:
  // обработчики событий, опасные URI, опасные стили.
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')
      || (URI_ATTRS.has(name) && !isSafeUri(attr.value))
      || (name === 'style' && hasDangerousStyle(attr.value))) {
      el.removeAttribute(attr.name);
    }
  }
  // 2. Удаляем запрещённые дочерние элементы и чистим детей рекурсивно.
  for (const child of Array.from(el.children)) {
    if (FORBIDDEN_TAGS.has(child.tagName.toLowerCase())) {
      child.remove();
      continue;
    }
    sanitizeElement(child);
  }
}

export function sanitizeSvg(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('<svg') && !trimmed.startsWith('data:image/')) {
    return '';
  }

  if (trimmed.startsWith('data:image/svg+xml')) {
    // Data URI format for SVG
    try {
      const decoded = decodeURIComponent(trimmed.split(',')[1] || '');
      if (decoded.startsWith('<svg')) {
        return sanitizeSvg(decoded);
      }
    } catch {
      return '';
    }
  }

  if (trimmed.startsWith('data:image/')) {
    // Raster image format (PNG, WebP, JPEG)
    return `<img src="${trimmed}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  } catch {
    return '';
  }
  if (doc.querySelector('parsererror') || doc.documentElement?.nodeName.toLowerCase() !== 'svg') {
    return '';
  }

  sanitizeElement(doc.documentElement);

  if (!doc.documentElement.hasAttribute('viewBox')) {
    const width = doc.documentElement.getAttribute('width')?.match(/(\d+)/)?.[1];
    const height = doc.documentElement.getAttribute('height')?.match(/(\d+)/)?.[1];
    if (width && height) {
      doc.documentElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    } else {
      doc.documentElement.setAttribute('viewBox', '0 0 24 24');
    }
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

export function isSvgIcon(icon?: string): boolean {
  if (!icon || typeof icon !== 'string') return false;
  const t = icon.trim();
  return t.startsWith('<svg') || t.startsWith('data:image/');
}

export function formatVersion(ver?: string): string {
  if (!ver) return '';
  const clean = ver.trim().replace(/^[:= ]+/, '').replace(/\s*\*\/.*$/, '').replace(/^[vV]+/, '').trim();
  return clean ? `v${clean}` : '';
}
