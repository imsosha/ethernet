import type { HermesMod } from '../types/ethernet';

export function modToCss(mod: HermesMod, themeName = 'Кастомная'): string {
  const lines: string[] = [
    `/* Hermes Telegram Theme: ${themeName} */`,
    `:root {`,
  ];

  if (mod.colors) {
    for (const [k, v] of Object.entries(mod.colors)) {
      if (v) {
        const cleanVal = String(v).replace(/\s*!important/g, '').trim();
        lines.push(`  ${k}: ${cleanVal};`);
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
    if (mod.radii.messages !== undefined) lines.push(`  --border-radius-messages: ${mod.radii.messages}px;`);
    if (mod.radii.buttons !== undefined) lines.push(`  --border-radius-buttons: ${mod.radii.buttons}px;`);
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
    lines.push(`  --hermes-disable-snap-effect: true;`);
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

  lines.push(`}`);
  return lines.join('\n') + '\n';
}

export function cssToMod(css: string): HermesMod {
  const mod: HermesMod = {
    colors: {},
    radii: {},
    blurTargets: {},
  };

  const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;

  while ((match = varRegex.exec(css)) !== null) {
    const key = `--${match[1]}`;
    const rawVal = match[2].trim();

    if (key.startsWith('--color-')) {
      const cleanVal = rawVal.replace(/\s*!important/g, '').trim();
      if (cleanVal.startsWith('#') || cleanVal.startsWith('rgb')) {
        mod.colors![key] = cleanVal;
      }
    } else if (key === '--border-radius-ui') {
      mod.radii!.ui = parseInt(rawVal, 10) || 16;
    } else if (key === '--border-radius-messages') {
      mod.radii!.messages = parseInt(rawVal, 10) || 15;
    } else if (key === '--border-radius-buttons') {
      mod.radii!.buttons = parseInt(rawVal, 10) || 12;
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
    } else if (key === '--hermes-disable-snap-effect') {
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
    }
  }

  return mod;
}
