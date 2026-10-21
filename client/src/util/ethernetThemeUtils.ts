import type { HermesMod } from '../types/ethernet';

/**
 * Разделяет CSS темы на блок переменных :root и блок пользовательского CSS.
 * Позволяет безопасно редактировать переменные через интерфейс без потери кастомных правил.
 */
export function splitThemeCss(css: string): { rootCss: string; customCss: string } {
  if (!css || typeof css !== 'string') return { rootCss: '', customCss: '' };

  const rootIndex = css.indexOf(':root');
  if (rootIndex === -1) {
    return { rootCss: '', customCss: css.trim() };
  }

  const openBrace = css.indexOf('{', rootIndex);
  if (openBrace === -1) {
    return { rootCss: '', customCss: css.trim() };
  }

  let depth = 1;
  let closeBrace = -1;
  for (let i = openBrace + 1; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }

  if (closeBrace === -1) {
    return { rootCss: css, customCss: '' };
  }

  const rootCss = css.slice(0, closeBrace + 1);
  const rawCustom = css.slice(closeBrace + 1).trim();
  const cleanedCustom = rawCustom
    .replace(/^\s*\/\* === (Кастомные стили CSS|Пользовательские стили CSS|Custom CSS)[^/]*\*\/[\r\n]*/i, '')
    .trim();

  return { rootCss, customCss: cleanedCustom };
}

/**
 * Преобразует параметры EthernetMod в валидный CSS.
 * Сохраняет пользовательский блок customCss без потерь!
 */
export function modToCss(mod: HermesMod, themeName = 'Кастомная', customCssOverride?: string): string {
  const lines: string[] = [
    `/* Ethernet Telegram Theme: ${themeName} */`,
    `:root {`,
  ];

  if (mod.colors) {
    for (const [k, v] of Object.entries(mod.colors)) {
      if (v) {
        const cleanVal = String(v).replace(/\s*!important/g, '').trim();
        lines.push(`  ${k}: ${cleanVal};`);
        if (k === '--color-background') {
          lines.push(`  --theme-background-color: ${cleanVal};`);
        }
        if (k === '--color-primary' && /^#[0-9a-fA-F]{6}$/.test(cleanVal)) {
          const r = parseInt(cleanVal.slice(1, 3), 16);
          const g = parseInt(cleanVal.slice(3, 5), 16);
          const b = parseInt(cleanVal.slice(5, 7), 16);
          lines.push(`  --color-primary-rgb: ${r}, ${g}, ${b};`);
          lines.push(`  --color-primary-shade: color-mix(in srgb, ${cleanVal} 88%, black);`);
          lines.push(`  --color-primary-shade-darker: color-mix(in srgb, ${cleanVal} 80%, black);`);
          lines.push(`  --color-primary-shade-rgb: ${Math.round(r * 0.88)}, ${Math.round(g * 0.88)}, ${Math.round(b * 0.88)};`);
          lines.push(`  --color-primary-tint: color-mix(in srgb, ${cleanVal} 12%, transparent);`);
          lines.push(`  --color-primary-opacity: color-mix(in srgb, ${cleanVal} 15%, transparent);`);
          lines.push(`  --color-primary-opacity-hover: color-mix(in srgb, ${cleanVal} 25%, transparent);`);
          lines.push(`  --color-active: ${cleanVal};`);
          lines.push(`  --color-active-darker: color-mix(in srgb, ${cleanVal} 80%, black);`);
          lines.push(`  --accent-color: ${cleanVal};`);
          lines.push(`  --accent-background-color: color-mix(in srgb, ${cleanVal} 15%, transparent);`);
          lines.push(`  --accent-background-active-color: color-mix(in srgb, ${cleanVal} 25%, transparent);`);
          lines.push(`  --color-interactive-active: ${cleanVal};`);
        }
      }
    }
  }

  if (mod.radii) {
    if (mod.radii.ui !== undefined) lines.push(`  --border-radius-ui: ${mod.radii.ui}px;`);
    if (mod.radii.topbar !== undefined) lines.push(`  --border-radius-topbar: ${mod.radii.topbar}px;`);
    if (mod.radii.foldersSidebar !== undefined) lines.push(`  --border-radius-folders-sidebar: ${mod.radii.foldersSidebar / 16}rem;`);
    if (mod.radii.messages !== undefined) lines.push(`  --border-radius-messages: ${mod.radii.messages}px;`);
    if (mod.radii.buttons !== undefined) lines.push(`  --border-radius-buttons: ${mod.radii.buttons}px;`);
    if (mod.radii.input !== undefined) lines.push(`  --border-radius-input: ${mod.radii.input}px;`);
    if (mod.radii.avatars !== undefined) lines.push(`  --border-radius-avatars: ${mod.radii.avatars}%;`);
  }

  if (mod.blurStrength !== undefined) {
    lines.push(`  --blur-strength: ${mod.blurStrength}px;`);
  }
  if (mod.blurGlare !== undefined) {
    lines.push(`  --blur-glare: ${mod.blurGlare}%;`);
  }
  if (mod.blurRefraction !== undefined) {
    lines.push(`  --blur-refraction: ${mod.blurRefraction}%;`);
  }
  if (mod.blurTargets) {
    lines.push(`  --blur-sidebar: ${mod.blurTargets.sidebar ? 'true' : 'false'};`);
    lines.push(`  --blur-header: ${mod.blurTargets.header ? 'true' : 'false'};`);
    lines.push(`  --blur-bubbles: ${mod.blurTargets.bubbles ? 'true' : 'false'};`);
    lines.push(`  --blur-menus: ${mod.blurTargets.menus ? 'true' : 'false'};`);
  }

  if (mod.animationsDisabled) {
    lines.push(`  --slide-transition: 0ms linear;`);
    lines.push(`  --layer-transition: 0ms linear;`);
    lines.push(`  --animations-disabled: true;`);
  } else {
    const dur = mod.animationDuration !== undefined ? `${mod.animationDuration}ms` : '300ms';
    const curve = mod.animationCurve ? `cubic-bezier(${mod.animationCurve})` : 'cubic-bezier(0.33, 1, 0.68, 1)';
    lines.push(`  --slide-transition: ${dur} ${curve};`);
    lines.push(`  --layer-transition: ${dur} ${curve};`);
    if (mod.animationDuration !== undefined) lines.push(`  --animation-duration: ${mod.animationDuration}ms;`);
    if (mod.animationCurve) lines.push(`  --animation-curve: ${mod.animationCurve};`);
  }

  if (mod.disableSnapEffect) {
    lines.push(`  --ethernet-disable-snap-effect: true;`);
  }

  if (mod.chatWidth) {
    lines.push(`  --chat-width: ${mod.chatWidth};`);
  }
  if (mod.messageAlignOwn) {
    lines.push(`  --message-align-own: ${mod.messageAlignOwn};`);
  }
  if (mod.messageAlignOther) {
    lines.push(`  --message-align-other: ${mod.messageAlignOther};`);
  }
  if (mod.profileOpenMode) {
    lines.push(`  --profile-open-mode: ${mod.profileOpenMode};`);
  }
  if (mod.mediaMessageWidth) {
    lines.push(`  --media-message-width: ${mod.mediaMessageWidth};`);
  }
  if (mod.hideTitlebar) {
    lines.push('  --hide-titlebar: true;');
  }

  if (mod.wallpaperFile) {
    if (mod.wallpaperKind === 'color' || mod.wallpaperFile.startsWith('#') || mod.wallpaperFile.startsWith('rgb')) {
      lines.push(`  --custom-background: linear-gradient(${mod.wallpaperFile}, ${mod.wallpaperFile});`);
    } else if (mod.wallpaperFile.startsWith('data:')) {
      lines.push(`  --custom-background: url('${mod.wallpaperFile}');`);
    } else {
      lines.push(`  --custom-background: url('/ethernet/wallpapers/${mod.wallpaperFile}');`);
    }
  }

  lines.push(`}`);

  const customCss = customCssOverride !== undefined ? customCssOverride : mod.customCss;
  if (customCss && customCss.trim()) {
    lines.push('');
    lines.push('/* === Пользовательские стили CSS === */');
    lines.push(customCss.trim());
  }

  return lines.join('\n') + '\n';
}

/**
 * Парсит CSS темы в структуру EthernetMod, сохраняя все кастомные стили в customCss.
 */
export function cssToMod(css: string): HermesMod {
  const { rootCss, customCss } = splitThemeCss(css);
  const targetCss = rootCss || css;

  const mod: HermesMod = {
    colors: {},
    radii: {},
    blurTargets: {},
    customCss: customCss || undefined,
  };

  const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;

  while ((match = varRegex.exec(targetCss)) !== null) {
    const key = `--${match[1]}`;
    const rawVal = match[2].trim();

    if (key.startsWith('--color-')) {
      const cleanVal = rawVal.replace(/\s*!important/g, '').trim();
      if (cleanVal.startsWith('#') || cleanVal.startsWith('rgb') || cleanVal.startsWith('hsl')) {
        mod.colors![key] = cleanVal;
      }
    } else if (key === '--border-radius-ui') {
      mod.radii!.ui = parseInt(rawVal, 10) || 16;
    } else if (key === '--border-radius-topbar') {
      mod.radii!.topbar = parseInt(rawVal, 10) || 24;
    } else if (key === '--border-radius-folders-sidebar') {
      const parsed = parseFloat(rawVal);
      mod.radii!.foldersSidebar = rawVal.endsWith('rem') ? Math.round(parsed * 16) : Math.round(parsed);
    } else if (key === '--border-radius-messages') {
      mod.radii!.messages = parseInt(rawVal, 10) || 15;
    } else if (key === '--border-radius-buttons') {
      mod.radii!.buttons = parseInt(rawVal, 10) || 12;
    } else if (key === '--border-radius-input') {
      mod.radii!.input = parseInt(rawVal, 10) || 24;
    } else if (key === '--border-radius-avatars') {
      mod.radii!.avatars = parseInt(rawVal, 10) || 50;
    } else if (key === '--blur-strength') {
      mod.blurStrength = parseInt(rawVal, 10) || 0;
    } else if (key === '--blur-glare') {
      mod.blurGlare = parseInt(rawVal, 10) || 0;
    } else if (key === '--blur-refraction') {
      mod.blurRefraction = parseInt(rawVal, 10) || 0;
    } else if (key === '--blur-sidebar') {
      mod.blurTargets!.sidebar = rawVal === 'true';
    } else if (key === '--blur-header') {
      mod.blurTargets!.header = rawVal === 'true';
    } else if (key === '--blur-bubbles') {
      mod.blurTargets!.bubbles = rawVal === 'true';
    } else if (key === '--blur-menus') {
      mod.blurTargets!.menus = rawVal === 'true';
    } else if (key === '--animations-disabled') {
      mod.animationsDisabled = rawVal === 'true';
    } else if (key === '--hermes-disable-snap-effect' || key === '--ethernet-disable-snap-effect') {
      mod.disableSnapEffect = rawVal === 'true';
    } else if (key === '--animation-duration') {
      mod.animationDuration = parseInt(rawVal, 10) || 300;
    } else if (key === '--animation-curve') {
      mod.animationCurve = rawVal;
    } else if (key === '--chat-width') {
      mod.chatWidth = rawVal;
    } else if (key === '--message-align-own') {
      mod.messageAlignOwn = rawVal as any;
    } else if (key === '--message-align-other') {
      mod.messageAlignOther = rawVal as any;
    } else if (key === '--profile-open-mode') {
      mod.profileOpenMode = rawVal as any;
    } else if (key === '--media-message-width') {
      mod.mediaMessageWidth = rawVal as any;
    } else if (key === '--hide-titlebar') {
      mod.hideTitlebar = rawVal === 'true';
    }
  }

  const wallpaperMatch = css.match(/\/\*\s*@wallpaper\s*(\{[\s\S]*?\})\s*\*\//i);
  if (wallpaperMatch) {
    try {
      const parsedWp = JSON.parse(wallpaperMatch[1]);
      if (parsedWp && parsedWp.file) {
        mod.wallpaperFile = parsedWp.file;
        mod.wallpaperKind = parsedWp.kind || 'image';
        mod.wallpaperOriginalPath = parsedWp.originalPath;
      }
    } catch {}
  }
  if (!mod.wallpaperFile) {
    const bgMatch = css.match(/--custom-background\s*:\s*url\s*\(\s*['"]?(data:[^'"]+)['"]?\s*\)/i);
    if (bgMatch) {
      mod.wallpaperFile = bgMatch[1];
      mod.wallpaperKind = 'image';
    }
  }

  return mod;
}

export type UniversalThemePlugin = {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  icon?: string;
  code: string;
  permissions?: string[];
};

export type UniversalEthPackage = {
  format: 'ethernet-v1' | 'ethernet-theme-v1';
  type?: 'theme' | 'plugin' | 'bundle';
  id?: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  icon?: string;
  // Свойства темы
  css?: string;
  mod?: HermesMod;
  wallpaper?: any;
  // Свойства отдельного плагина
  code?: string;
  permissions?: string[];
  themeDependency?: string;
  requiredForTheme?: string;
  // Вложенные зависимые плагины (для тем и бандлов)
  plugins?: UniversalThemePlugin[];
};

export type UniversalThemePackage = UniversalEthPackage;

export function parseEthPackage(rawContent: string, defaultName = 'Пакет'): UniversalEthPackage & {
  mod?: HermesMod;
  css: string;
  plugins: UniversalThemePlugin[];
} {
  const trimmed = rawContent.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const mod = parsed.mod || (parsed.css ? cssToMod(parsed.css) : undefined);
      return {
        format: parsed.format || 'ethernet-v1',
        type: parsed.type || (parsed.code && !parsed.css ? 'plugin' : 'theme'),
        id: parsed.id,
        name: parsed.name || defaultName,
        version: parsed.version,
        author: parsed.author,
        description: parsed.description,
        icon: parsed.icon,
        css: parsed.css || (mod ? modToCss(mod, parsed.name || defaultName) : ''),
        code: parsed.code,
        permissions: Array.isArray(parsed.permissions) ? parsed.permissions : undefined,
        themeDependency: parsed.themeDependency || parsed.requiredForTheme,
        requiredForTheme: parsed.requiredForTheme || parsed.themeDependency,
        mod,
        wallpaper: parsed.wallpaper,
        plugins: Array.isArray(parsed.plugins) ? parsed.plugins : [],
      };
    } catch {}
  }

  // Если передан чистый CSS файл
  const mod = cssToMod(trimmed);
  const nameMatch = trimmed.match(/@name[:=\s]+([^\r\n*]+)/i) || trimmed.match(/\/\*\s*Ethernet Telegram Theme:\s*([^\r\n*]+)/i);
  const verMatch = trimmed.match(/(?:@version|--theme-version)["':=\s]+([0-9a-zA-Z._-]+)/i);
  const authMatch = trimmed.match(/@author[:=\s]+([^\r\n*]+)/i);
  const descMatch = trimmed.match(/@description[:=\s]+([^\r\n*]+)/i);
  const iconMatch = trimmed.match(/@icon\s+([^\r\n]+)/i);
  const pluginsMatch = trimmed.match(/@plugins\s+(\[[\s\S]*?\])/i);

  let plugins: UniversalThemePlugin[] = [];
  if (pluginsMatch) {
    try {
      const parsed = JSON.parse(pluginsMatch[1]);
      if (Array.isArray(parsed)) plugins = parsed;
    } catch {}
  }

  const wallpaperMatch = trimmed.match(/@wallpaper\s+(\{[\s\S]*?\})/i);
  let wallpaper: any = undefined;
  if (wallpaperMatch) {
    try {
      wallpaper = JSON.parse(wallpaperMatch[1]);
    } catch {}
  }
  if (!wallpaper) {
    const bgMatch = trimmed.match(/--custom-background\s*:\s*url\s*\(\s*['"]?(data:[^'"]+)['"]?\s*\)/i);
    if (bgMatch) {
      wallpaper = {
        file: bgMatch[1],
        kind: 'image',
        slug: 'embedded',
      };
    }
  }

  return {
    format: 'ethernet-v1',
    type: 'theme',
    name: nameMatch ? nameMatch[1].trim() : defaultName,
    version: verMatch ? verMatch[1].trim().replace(/^[vV]+/, '') : undefined,
    author: authMatch ? authMatch[1].trim() : undefined,
    description: descMatch ? descMatch[1].trim() : undefined,
    icon: iconMatch ? iconMatch[1].trim().replace(/\s*\*\/.*$/, '') : undefined,
    css: trimmed,
    mod,
    wallpaper,
    plugins,
  };
}

export const parseUniversalTheme = parseEthPackage;

export function buildEthPackage(params: {
  type?: 'theme' | 'plugin' | 'bundle';
  id?: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  icon?: string;
  css?: string;
  mod?: HermesMod;
  wallpaper?: any;
  code?: string;
  permissions?: string[];
  themeDependency?: string;
  plugins?: UniversalThemePlugin[];
}): string {
  const pkg: UniversalEthPackage = {
    format: 'ethernet-v1',
    type: params.type || (params.code && !params.css ? 'plugin' : 'theme'),
    id: params.id,
    name: params.name,
    version: params.version || '1.0.0',
    author: params.author || 'User',
    description: params.description || '',
    icon: params.icon || undefined,
    css: params.css,
    mod: params.mod,
    wallpaper: params.wallpaper,
    code: params.code,
    permissions: params.permissions,
    themeDependency: params.themeDependency,
    plugins: params.plugins || [],
  };
  return JSON.stringify(pkg, null, 2);
}

export const buildUniversalThemeJson = buildEthPackage;

