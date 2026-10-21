/**
 * Безопасная обработка и рендеринг SVG-иконок для тем и плагинов.
 */

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

  // Удаляем потенциально опасные скрипты и обработчики событий
  let safe = trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');

  // Гарантируем корректное масштабирование через CSS
  if (!/viewBox=/i.test(safe)) {
    const widthMatch = safe.match(/width=["'](\d+)(?:px)?["']/i);
    const heightMatch = safe.match(/height=["'](\d+)(?:px)?["']/i);
    if (widthMatch && heightMatch) {
      safe = safe.replace(/<svg/i, `<svg viewBox="0 0 ${widthMatch[1]} ${heightMatch[1]}"`);
    } else {
      safe = safe.replace(/<svg/i, '<svg viewBox="0 0 24 24"');
    }
  }

  return safe;
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
