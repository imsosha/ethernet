import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useRef, useState } from '../../../lib/teact/teact';

import type { EthernetMod, EthernetRadii } from '../../../types/ethernet';

import buildClassName from '../../../util/buildClassName';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import { getEthernetString } from '../../../util/ethernetLang';

import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import Icon from '../../common/icons/Icon';
import RangeSlider from '../../ui/RangeSlider';
import { modToCss, cssToMod } from '../../../util/ethernetThemeUtils';

import './SettingsEthernetThemeEditor.scss';

export type { EthernetMod, EthernetRadii };

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

const COLOR_VARS: { key: string; langKey: string }[] = [
  { key: '--color-background', langKey: 'EthernetColorBackground' },
  { key: '--color-background-secondary', langKey: 'EthernetColorBackgroundSecondary' },
  { key: '--color-background-sidebar', langKey: 'EthernetColorBackgroundSidebar' },
  { key: '--color-text', langKey: 'EthernetColorText' },
  { key: '--color-links', langKey: 'EthernetColorLinks' },
  { key: '--color-text-secondary', langKey: 'EthernetColorTextSecondary' },
  { key: '--color-primary', langKey: 'EthernetColorPrimary' },
  { key: '--color-text-meta-colored', langKey: 'EthernetColorTextMetaColored' },
  { key: '--color-background-own', langKey: 'EthernetColorBackgroundOwn' },
  { key: '--color-chat-active', langKey: 'EthernetColorChatActive' },
];

const ANIMATION_PRESETS: { label: string; duration: number; curve: string }[] = [
  { label: 'Telegram', duration: 300, curve: '0.33, 1, 0.68, 1' },
  { label: 'Snappy', duration: 150, curve: '0.22, 1, 0.36, 1' },
  { label: 'Smooth', duration: 500, curve: '0.65, 0, 0.35, 1' },
  { label: 'Bouncy', duration: 400, curve: '0.34, 1.56, 0.64, 1' },
  { label: 'iOS', duration: 350, curve: '0.25, 0.1, 0.25, 1' },
];

export const ETH_DEFAULT_COLORS: Record<string, string> = {
  '--color-background': '#16171a',
  '--color-background-secondary': '#212328',
  '--color-background-secondary-accent': '#292c33',
  '--color-background-sidebar': '#1a1b1f',
  '--color-background-selected': '#2a2e37',
  '--color-borders': '#2a2d34',
  '--color-dividers': '#24272e',
  '--color-text': '#f3f4f6',
  '--color-links': '#58a6ff',
  '--color-text-secondary': '#9da7b7',
  '--color-primary': '#3b82f6',
  '--color-text-meta-colored': '#58a6ff',
  '--color-background-own': '#1e3a5f',
  '--color-chat-active': '#2b3d58',
};

const DEFAULT_MOD: EthernetMod = {
  colors: { ...ETH_DEFAULT_COLORS },
  radii: {
    ui: 16,
    messages: 16,
    buttons: 12,
    avatars: 50,
  },
  blurStrength: 20,
  blurGlare: 40,
  blurRefraction: 60,
  blurTargets: { sidebar: true, header: true, bubbles: true, menus: true },
  animationDuration: 350,
  animationCurve: '0.03, 0.97, 0.19, 0.99',
  animationsDisabled: false,
  chatWidth: 'wide',
};

// --- Вспомогательные функции для цвета ---
function hexToRgb(hex?: string): [number, number, number] {
  if (!hex || !hex.startsWith('#')) return [0, 0, 0];
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: break;
    }
    h *= 60;
  }
  return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const i = Math.floor((h / 60) % 6);
  const f = (h / 60) - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function getComputedColorHex(key: string, fallback = '#212121', depth = 0): string {
  if (typeof window === 'undefined' || depth > 5) return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  if (!raw) return fallback;
  const varMatch = raw.match(/^var\((--[^,\s)]+)/);
  if (varMatch) {
    return getComputedColorHex(varMatch[1], fallback, depth + 1);
  }
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  const match = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return fallback;
}

// Сворачивающаяся секция-аккордеон
const Section: FC<{ title: string; children: any; defaultOpen?: boolean }> = ({
  title, children, defaultOpen,
}) => {
  const [isOpen, setIsOpen] = useState(Boolean(defaultOpen));

  return (
    <div className="theme-editor-section">
      <button
        type="button"
        className="theme-editor-section-header"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`chevron ${isOpen ? 'open' : ''}`}>›</span>
        {title}
      </button>
      {isOpen && <div className="theme-editor-section-body">{children}</div>}
    </div>
  );
};

// --- Кастомный интерактивный RGB / HSV Color Picker ---
const CustomColorPicker: FC<{
  hex: string;
  onChange: (hex: string) => void;
}> = ({ hex, onChange }) => {
  const lang = useLang();
  const [rgb, setRgb] = useState<[number, number, number]>(() => hexToRgb(hex));
  const [hsv, setHsv] = useState<[number, number, number]>(() => {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHsv(r, g, b);
  });

  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const satValRef = useRef<HTMLDivElement>();

  useEffect(() => {
    const curRgb = hexToRgb(hex);
    setRgb(curRgb);
    const curHsv = rgbToHsv(curRgb[0], curRgb[1], curRgb[2]);
    setHsv(curHsv);
    hsvRef.current = curHsv;
  }, [hex]);

  const updateFromHsv = useLastCallback((h: number, s: number, v: number) => {
    const [newR, newG, newB] = hsvToRgb(h, s, v);
    const newHex = rgbToHex(newR, newG, newB);
    setHsv([h, s, v]);
    hsvRef.current = [h, s, v];
    setRgb([newR, newG, newB]);
    onChange(newHex);
  });

  const updateFromRgb = useLastCallback((r: number, g: number, b: number) => {
    const newHex = rgbToHex(r, g, b);
    const newHsv = rgbToHsv(r, g, b);
    setRgb([r, g, b]);
    setHsv(newHsv);
    hsvRef.current = newHsv;
    onChange(newHex);
  });

  const handleSatValPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();

    const updateCoord = (clientX: number, clientY: number) => {
      if (!satValRef.current) return;
      const rect = satValRef.current.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      updateFromHsv(hsvRef.current[0], s, v);
    };

    updateCoord(e.clientX, e.clientY);

    const onPointerMove = (moveEvt: PointerEvent) => {
      updateCoord(moveEvt.clientX, moveEvt.clientY);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', onPointerUp, { once: true });
  };

  const handleEyedropper = async () => {
    if (window.EyeDropper) {
      try {
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          const [newR, newG, newB] = hexToRgb(result.sRGBHex);
          updateFromRgb(newR, newG, newB);
        }
      } catch {}
    }
  };

  const [h, s, v] = hsv;
  const [r, g, b] = rgb;

  return (
    <div className="custom-color-picker">
      {/* 2D поле Saturation / Value */}
      <div
        ref={satValRef}
        className="sat-val-box"
        style={`background-color: hsl(${h}, 100%, 50%)`}
        onPointerDown={handleSatValPointerDown}
      >
        <div className="sat-val-white" />
        <div className="sat-val-black" />
        <div
          className="sat-val-handle"
          style={`left: ${s * 100}%; top: ${(1 - v) * 100}%; background-color: ${hex};`}
        />
      </div>

      {/* Hue Slider + Eyedropper */}
      <div className="hue-bar-row">
        <input
          type="range"
          className="hue-range"
          min="0"
          max="360"
          value={Math.round(h)}
          onChange={(e) => updateFromHsv(Number(e.currentTarget.value), s, v)}
        />
        {typeof window !== 'undefined' && 'EyeDropper' in window && (
          <button
            type="button"
            className="eyedropper-button"
            onClick={handleEyedropper}
            title={getEthernetString(lang, 'EthernetEyedropper')}
          >
            <Icon name="colorize" />
          </button>
        )}
      </div>

      {/* RGB слайдеры */}
      <div className="rgb-sliders">
        <div className="rgb-slider-row">
          <span className="rgb-label">R</span>
          <input
            type="range"
            min="0"
            max="255"
            value={r}
            className="rgb-range rgb-range-r"
            onChange={(e) => updateFromRgb(Number(e.currentTarget.value), g, b)}
          />
          <span className="rgb-value">{r}</span>
        </div>
        <div className="rgb-slider-row">
          <span className="rgb-label">G</span>
          <input
            type="range"
            min="0"
            max="255"
            value={g}
            className="rgb-range rgb-range-g"
            onChange={(e) => updateFromRgb(r, Number(e.currentTarget.value), b)}
          />
          <span className="rgb-value">{g}</span>
        </div>
        <div className="rgb-slider-row">
          <span className="rgb-label">B</span>
          <input
            type="range"
            min="0"
            max="255"
            value={b}
            className="rgb-range rgb-range-b"
            onChange={(e) => updateFromRgb(r, g, Number(e.currentTarget.value))}
          />
          <span className="rgb-value">{b}</span>
        </div>
      </div>
    </div>
  );
};

// Строка цвета: свотч + hex-кнопка (раскрывается при наведении) + сброс + дропдаун пикера
const ColorRow: FC<{
  label: string;
  cssKey: string;
  value?: string;
  onChange: (hex: string) => void;
  onReset: () => void;
}> = ({ label, cssKey, value, onChange, onReset }) => {
  const lang = useLang();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isHexOpen, setIsHexOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>();

  const displayHex = value || getComputedColorHex(cssKey);

  return (
    <div className="color-row">
      <div className="color-row-head">
        {/* Кругляшок цвета */}
        <button
          type="button"
          className="color-preview"
          style={`background-color: ${displayHex || 'transparent'}`}
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          title={label}
        />

        {/* Название */}
        <span className="color-label" onClick={() => setIsPickerOpen(!isPickerOpen)}>{label}</span>

        {/* Раскрывающийся по наведению блок HEX */}
        <div
          className="color-hex-wrapper"
          onMouseEnter={() => setIsHexOpen(true)}
          onMouseLeave={() => {
            if (document.activeElement !== inputRef.current) {
              setIsHexOpen(false);
            }
          }}
        >
          {isHexOpen ? (
            <div className="color-hex-input-box">
              <span className="color-hex-hash">#</span>
              <input
                ref={inputRef}
                type="text"
                className="color-hex-input"
                value={(displayHex || '').replace(/^#/, '')}
                placeholder="000000"
                maxLength={6}
                autoFocus
                onBlur={() => setIsHexOpen(false)}
                onChange={(e) => {
                  const v = e.currentTarget.value.replace(/[^0-9a-fA-F]/g, '');
                  onChange(v ? `#${v}` : '');
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="color-hex-button"
              onClick={() => setIsHexOpen(true)}
              title="HEX"
            >
              <span className="color-hex-button-text">#</span>
            </button>
          )}
        </div>

        {/* Сброс */}
        <button type="button" className="color-reset" onClick={onReset} title={getEthernetString(lang, 'EthernetResetColor')}>↺</button>
      </div>
      {isPickerOpen && (
        <div className="color-picker-dropdown">
          <CustomColorPicker
            hex={displayHex || '#000000'}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
};

// --- Главный компонент Редактора Темы ---
const SettingsEthernetThemeEditor: FC<OwnProps> = ({ isActive, onReset }) => {
  const lang = useLang();

  const [mod, setMod] = useState<EthernetMod>(DEFAULT_MOD);
  const [themeName, setThemeName] = useState<string | null>(null);
  const [wallpaperInfo, setWallpaperInfo] = useState<{ slug: string | null; file: string | null; originalPath?: string }>({ slug: null, file: null });

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  // Загружаем настройки, считываем активную тему и реальные цвета
  const loadThemeData = useLastCallback(async () => {
    let currentActiveName: string | null = null;
    let themeParsedMod: EthernetMod = {};

    const api = window.ethernetDesktop || window.hermesDesktop;
    const list = api ? await api.themesList() : [];
    const active = list?.find((t) => t.active);
    if (active) {
      currentActiveName = active.name.replace(/\.css$/, '');
      setThemeName(currentActiveName);
      try {
        const css = api ? await api.themeRead(active.name) : '';
        if (css) themeParsedMod = cssToMod(css);
      } catch {}
    } else {
      setThemeName(null);
    }

    const saved = (api ? await api.modGet() : null) || {};
    const mergedColors: Record<string, string> = {
      ...ETH_DEFAULT_COLORS,
      ...(themeParsedMod.colors || {}),
      ...(saved.colors || {}),
    };

    // Считываем реальные цвета из стилей активной темы, чтобы не было пустых/серых плашек
    for (const { key } of COLOR_VARS) {
      if (!mergedColors[key]) {
        mergedColors[key] = ETH_DEFAULT_COLORS[key] || getComputedColorHex(key, '#3b82f6');
      }
    }

    const nextMod: EthernetMod = {
      ...DEFAULT_MOD,
      ...themeParsedMod,
      ...saved,
      colors: mergedColors,
      chatWidth: saved.chatWidth || themeParsedMod.chatWidth || 'wide',
    };

    setMod(nextMod);

    fetch('/ethernet/wallpaper.json')
      .then((r) => r.json())
      .then((info) => {
        if (info && (info.file || info.slug)) {
          setWallpaperInfo(info);
          if (info.file && !nextMod.wallpaperFile) {
            setMod((prev) => ({
              ...prev,
              wallpaperFile: info.file,
              wallpaperKind: info.kind || (/\.(mp4|webm)$/i.test(info.file) ? 'video' : 'image'),
            }));
          }
        }
      })
      .catch(() => {});
  });

  useEffect(() => {
    if (isActive) {
      loadThemeData();
    }
  }, [isActive, loadThemeData]);

  // Живое сохранение и применение мода в моменте
  const update = useLastCallback(async (patch: Partial<EthernetMod>) => {
    setMod((prev) => {
      const next: EthernetMod = {
        ...prev,
        ...patch,
      };
      if (patch.colors) {
        next.colors = { ...(prev.colors || {}), ...patch.colors };
      }
      if (patch.radii) {
        next.radii = { ...(prev.radii || {}), ...patch.radii };
      }
      if (patch.blurTargets) {
        next.blurTargets = { ...(prev.blurTargets || {}), ...patch.blurTargets };
      }

      const desktopApi = window.ethernetDesktop || window.hermesDesktop;
      if (desktopApi) {
        desktopApi.modSet(next);
      }
      const loaderApi = window.ethernet || window.hermes;
      if (loaderApi?.applyMod) loaderApi.applyMod(next);

      // Если активна именованная сохраненная тема — обновляем ее файл
      if (themeName && themeName !== 'default' && desktopApi) {
        const css = modToCss(next, themeName);
        const wpFile = next.wallpaperFile || wallpaperInfo?.file;
        const wpInfo = (wpFile) ? {
          file: wpFile,
          kind: next.wallpaperKind || (wpFile && /\.(mp4|webm)$/i.test(wpFile) ? 'video' : 'image'),
          slug: wallpaperInfo?.slug || wpFile.replace(/\.[^.]+$/, ''),
          originalPath: wallpaperInfo?.originalPath,
        } : undefined;
        desktopApi.themeSave(themeName, css, wpInfo);
        desktopApi.themeActivate(themeName);
      }
      return next;
    });
  });

  const updateRadius = useLastCallback((key: keyof EthernetRadii, val: number) => {
    const currentRadii = mod.radii || {
      ui: 16,
      messages: 16,
      buttons: 12,
      avatars: 50,
    };
    update({
      radii: {
        ...currentRadii,
        [key]: val,
      },
    });
  });

  // Обои
  const handleWallpaperPick = useLastCallback(async () => {
    const desktopApi = window.ethernetDesktop || window.hermesDesktop;
    if (!desktopApi) return;
    const picked = await desktopApi.pickFile('wallpaper');
    if (!picked) return;
    const activeName = themeName || 'Кастомная';
    const res = await desktopApi.wallpaperSetFile({
      name: picked.name,
      base64: picked.content,
      originalPath: picked.path || picked.name,
      themeName: activeName,
    });
    const filename = res?.file || (typeof res === 'string' ? `${res}.png` : res?.slug ? `${res.slug}.png` : '');
    const isVideo = filename.endsWith('.mp4') || filename.endsWith('.webm');
    setWallpaperInfo({
      slug: res?.slug || (typeof res === 'string' ? res : 'custom'),
      file: filename,
      originalPath: res?.originalPath || picked.path || picked.name,
    });
    update({ wallpaperFile: filename, wallpaperKind: isVideo ? 'video' : 'image' });
    const loaderApi = window.ethernet || window.hermes;
    if (loaderApi?.wallpaperSet) {
      loaderApi.wallpaperSet(filename, isVideo ? 'video' : 'image');
    }
  });

  const handleWallpaperClear = useLastCallback(async () => {
    const desktopApi = window.ethernetDesktop || window.hermesDesktop;
    if (desktopApi) {
      await desktopApi.wallpaperClear();
    }
    setWallpaperInfo({ slug: null, file: null });
    update({ wallpaperFile: undefined, wallpaperKind: undefined });
    const loaderApi = window.ethernet || window.hermes;
    if (loaderApi?.wallpaperClear) {
      loaderApi.wallpaperClear();
    }
  });

  const setBlurTarget = useLastCallback((key: string, value: boolean) => {
    update({ blurTargets: { ...mod.blurTargets, [key]: value } });
  });

  const radii = mod.radii || {
    ui: mod.borderRadius ?? 16,
    messages: mod.borderRadius ?? 16,
    buttons: mod.borderRadius ? Math.max(2, mod.borderRadius - 4) : 12,
    avatars: 50,
  };

  return (
    <div className="settings-content custom-scroll theme-editor">
      {/* Секция Основные настройки (по умолчанию открыта) */}
      <Section title={getEthernetString(lang, 'EthernetSectionMain')} defaultOpen>
        <div className="colors-list">
          {COLOR_VARS.map(({ key, langKey }) => (
            <ColorRow
              key={key}
              cssKey={key}
              label={getEthernetString(lang, langKey)}
              value={mod.colors?.[key]}
              onChange={(hex) => update({ colors: { ...mod.colors, [key]: hex } })}
              onReset={() => {
                const colors = { ...mod.colors };
                delete colors[key];
                update({ colors });
              }}
            />
          ))}
        </div>

        {/* Скругления — прямо под списком цветов */}
        <div className="theme-editor-inline-group">
          <h4 className="theme-editor-group-title">{getEthernetString(lang, 'EthernetSectionRounding')}</h4>
          <RangeSlider
            label={getEthernetString(lang, 'EthernetRadiusUi')}
            min={0}
            max={32}
            value={radii.ui ?? 16}
            onChange={(v) => updateRadius('ui', v)}
          />
          <RangeSlider
            label={getEthernetString(lang, 'EthernetRadiusMessages')}
            min={0}
            max={32}
            value={radii.messages ?? 16}
            onChange={(v) => updateRadius('messages', v)}
          />
          <RangeSlider
            label={getEthernetString(lang, 'EthernetRadiusButtons')}
            min={0}
            max={24}
            value={radii.buttons ?? 12}
            onChange={(v) => updateRadius('buttons', v)}
          />
          <RangeSlider
            label={getEthernetString(lang, 'EthernetRadiusAvatars')}
            min={0}
            max={50}
            value={radii.avatars ?? 50}
            onChange={(v) => updateRadius('avatars', v)}
          />
        </div>

        {/* Обои — прямо под скруглениями */}
        <div className="theme-editor-inline-group">
          <h4 className="theme-editor-group-title">{getEthernetString(lang, 'EthernetSectionWallpaper')}</h4>
          <div className="theme-editor-buttons-row">
            <Button onClick={handleWallpaperPick} className="block">{getEthernetString(lang, 'EthernetWallpaperPick')}</Button>
            {wallpaperInfo.slug && (
              <Button onClick={handleWallpaperClear} color="translucent" className="block">{getEthernetString(lang, 'EthernetWallpaperClear')}</Button>
            )}
          </div>
          {wallpaperInfo.file && (
            <div className="wallpaper-preview-box">
              {wallpaperInfo.file.endsWith('.mp4') || wallpaperInfo.file.endsWith('.webm') ? (
                <video src={`/ethernet/wallpapers/${wallpaperInfo.file}`} autoPlay loop muted playsInline className="wallpaper-thumb" />
              ) : (
                <img src={`/ethernet/wallpapers/${wallpaperInfo.file}`} alt="" className="wallpaper-thumb" />
              )}
            </div>
          )}
          <span className="theme-editor-hint">{getEthernetString(lang, 'EthernetWallpaperHint')}</span>
        </div>

        {/* Ширина чата — 3 центрированные кнопки */}
        <div className="theme-editor-inline-group">
          <h4 className="theme-editor-group-title">{getEthernetString(lang, 'EthernetChatWidth')}</h4>
          <div className="anim-presets chat-width-presets">
            {[
              { key: 'default', label: getEthernetString(lang, 'EthernetWidthDefault') },
              { key: 'wide', label: getEthernetString(lang, 'EthernetWidthWide') },
              { key: 'full', label: getEthernetString(lang, 'EthernetWidthFull') },
            ].map(({ key, label }) => (
              <button
                type="button"
                key={key}
                className={buildClassName('anim-preset', (mod.chatWidth || 'default') === key && 'active')}
                onClick={() => update({ chatWidth: key })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Выравнивание своих сообщений */}
        <div className="theme-editor-inline-group" style="margin-top: 0.75rem;">
          <h4 className="theme-editor-group-title">{getEthernetString(lang, 'EthernetMessageAlignOwn')}</h4>
          <div className="anim-presets chat-width-presets">
            {[
              { key: 'left', label: getEthernetString(lang, 'EthernetAlignLeft') },
              { key: 'center', label: getEthernetString(lang, 'EthernetAlignCenter') },
              { key: 'right', label: getEthernetString(lang, 'EthernetAlignRight') },
            ].map(({ key, label }) => (
              <button
                type="button"
                key={key}
                className={buildClassName('anim-preset', (mod.messageAlignOwn || 'right') === key && 'active')}
                onClick={() => update({ messageAlignOwn: key as any })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Выравнивание чужих сообщений */}
        <div className="theme-editor-inline-group" style="margin-top: 0.75rem;">
          <h4 className="theme-editor-group-title">{getEthernetString(lang, 'EthernetMessageAlignOther')}</h4>
          <div className="anim-presets chat-width-presets">
            {[
              { key: 'left', label: getEthernetString(lang, 'EthernetAlignLeft') },
              { key: 'center', label: getEthernetString(lang, 'EthernetAlignCenter') },
              { key: 'right', label: getEthernetString(lang, 'EthernetAlignRight') },
            ].map(({ key, label }) => (
              <button
                type="button"
                key={key}
                className={buildClassName('anim-preset', (mod.messageAlignOther || 'left') === key && 'active')}
                onClick={() => update({ messageAlignOther: key as any })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Гармошка Блюр */}
      <Section title={getEthernetString(lang, 'EthernetSectionBlur')}>
        <RangeSlider
          label={getEthernetString(lang, 'EthernetBlurStrength')}
          min={0}
          max={40}
          value={mod.blurStrength || 0}
          onChange={(v) => update({ blurStrength: v })}
        />
        <Checkbox label={getEthernetString(lang, 'EthernetBlurHeader')} checked={Boolean(mod.blurTargets?.header)} onChange={(e) => setBlurTarget('header', e.currentTarget.checked)} />
        <Checkbox label={getEthernetString(lang, 'EthernetBlurMenus')} checked={Boolean(mod.blurTargets?.menus)} onChange={(e) => setBlurTarget('menus', e.currentTarget.checked)} />
      </Section>

      {/* Гармошка Анимации */}
      <Section title={getEthernetString(lang, 'EthernetSectionAnimations')}>
        {/* 1. Галочка отключения анимаций на самом верху */}
        <Checkbox
          label={getEthernetString(lang, 'EthernetAnimationsOff')}
          checked={Boolean(mod.animationsDisabled)}
          onChange={(e) => update({ animationsDisabled: e.currentTarget.checked })}
        />

        {/* 2. Галочка отключения эффекта рассеивания сообщений */}
        <Checkbox
          label={getEthernetString(lang, 'EthernetDisableSnapEffect')}
          checked={Boolean(mod.disableSnapEffect)}
          onChange={(e) => update({ disableSnapEffect: e.currentTarget.checked })}
        />

        {!mod.animationsDisabled && (
          <>
            {/* 3. Слайдер длительности */}
            <RangeSlider
              label={getEthernetString(lang, 'EthernetAnimationSpeed')}
              min={50}
              max={1000}
              step={10}
              value={mod.animationDuration || 300}
              onChange={(d) => update({ animationDuration: d })}
            />

            {/* 3. Пресеты анимаций над графиком */}
            <div className="anim-presets">
              {ANIMATION_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  className={buildClassName(
                    'anim-preset',
                    mod.animationDuration === p.duration && mod.animationCurve === p.curve && 'active',
                  )}
                  onClick={() => update({ animationDuration: p.duration, animationCurve: p.curve })}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* 4. График и координаты */}
            <BezierEditor
              curve={mod.animationCurve || '0.33, 1, 0.68, 1'}
              duration={mod.animationDuration || 300}
              onChange={(curve) => update({ animationCurve: curve })}
            />
          </>
        )}
      </Section>
    </div>
  );
};

// --- Интерактивный график cubic-bezier ---
const BezierEditor: FC<{
  curve: string;
  duration?: number;
  onChange: (curve: string) => void;
}> = ({ curve, duration = 300, onChange }) => {
  const nums = curve.split(',').map((n) => parseFloat(n.trim()));
  const [x1, y1, x2, y2] = nums.length === 4 ? nums : [0.33, 1, 0.68, 1];

  const svgRef = useRef<SVGSVGElement>();
  const [isHovered, setIsHovered] = useState(false);

  const padX = 30;
  const width = 200;
  const baseY = 130;
  const unitH = 80;

  const toSvgX = (x: number) => padX + x * width;
  const toSvgY = (y: number) => baseY - y * unitH;

  const fromSvgX = (px: number) => (px - padX) / width;
  const fromSvgY = (py: number) => (baseY - py) / unitH;

  const numsRef = useRef([x1, y1, x2, y2]);
  numsRef.current = [x1, y1, x2, y2];

  const handlePointerDown = (point: 1 | 2) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const updateCoord = (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = 260 / rect.width;
      const scaleY = 180 / rect.height;
      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top) * scaleY;

      const rawX = Math.round(Math.max(0, Math.min(1, fromSvgX(px))) * 100) / 100;
      const rawY = Math.round(Math.max(-0.5, Math.min(1.5, fromSvgY(py))) * 100) / 100;

      const [curX1, curY1, curX2, curY2] = numsRef.current;
      if (point === 1) {
        onChange(`${rawX}, ${rawY}, ${curX2}, ${curY2}`);
      } else {
        onChange(`${curX1}, ${curY1}, ${rawX}, ${rawY}`);
      }
    };

    updateCoord(e.clientX, e.clientY);

    const onPointerMove = (moveEvt: PointerEvent) => {
      updateCoord(moveEvt.clientX, moveEvt.clientY);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', onPointerUp, { once: true });
  };

  const p0 = { x: toSvgX(0), y: toSvgY(0) };
  const p1 = { x: toSvgX(x1), y: toSvgY(y1) };
  const p2 = { x: toSvgX(x2), y: toSvgY(y2) };
  const p3 = { x: toSvgX(1), y: toSvgY(1) };
  const pathD = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;

  return (
    <div
      className="bezier-editor"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="bezier-visual-row">
        <svg
          ref={svgRef}
          className="bezier-svg"
          viewBox="0 0 260 180"
        >
          {/* Рамка единичной области (0,0) -> (1,1) */}
          <rect
            x={toSvgX(0)}
            y={toSvgY(1)}
            width={width}
            height={unitH}
            className="bezier-unit-box"
          />

          {/* Диагональная направляющая */}
          <line
            x1={toSvgX(0)}
            y1={toSvgY(0)}
            x2={toSvgX(1)}
            y2={toSvgY(1)}
            className="bezier-diagonal-line"
          />

          {/* Связующие линии (негативный контраст) */}
          <line
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            className="bezier-handle-line"
          />
          <line
            x1={p3.x}
            y1={p3.y}
            x2={p2.x}
            y2={p2.y}
            className="bezier-handle-line"
          />

          {/* Кривая Безье */}
          <path d={pathD} className="bezier-curve" />

          {/* Концы (P0, P3) */}
          <circle cx={p0.x} cy={p0.y} r="3.5" className="bezier-endpoint" />
          <circle cx={p3.x} cy={p3.y} r="3.5" className="bezier-endpoint" />

          {/* Негативная ручка P1 */}
          <g
            className="bezier-handle-group"
            onPointerDown={handlePointerDown(1)}
            style="cursor: grab;"
          >
            <circle cx={p1.x} cy={p1.y} r="8" className="bezier-handle-outer" />
            <circle cx={p1.x} cy={p1.y} r="3" className="bezier-handle-inner" />
          </g>

          {/* Негативная ручка P2 */}
          <g
            className="bezier-handle-group"
            onPointerDown={handlePointerDown(2)}
            style="cursor: grab;"
          >
            <circle cx={p2.x} cy={p2.y} r="8" className="bezier-handle-outer" />
            <circle cx={p2.x} cy={p2.y} r="3" className="bezier-handle-inner" />
          </g>
        </svg>

        {/* Анимированный кубик Preview */}
        <div className="bezier-preview-column">
          <div className="bezier-preview-track">
            <div
              className={buildClassName('bezier-preview-cube', isHovered && 'hovered')}
              style={`animation-duration: ${duration}ms; animation-timing-function: cubic-bezier(${curve});`}
            />
          </div>
        </div>
      </div>

      {/* Координаты — сетка 2x2 в телеграмовском стиле */}
      <div className="bezier-coords-grid">
        <div className="bezier-coord">
          <span className="bezier-coord-label">X₁</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={x1}
            onChange={(e) => onChange(`${Number(e.currentTarget.value)}, ${y1}, ${x2}, ${y2}`)}
          />
        </div>
        <div className="bezier-coord">
          <span className="bezier-coord-label">Y₁</span>
          <input
            type="number"
            min={-0.5}
            max={1.5}
            step={0.01}
            value={y1}
            onChange={(e) => onChange(`${x1}, ${Number(e.currentTarget.value)}, ${x2}, ${y2}`)}
          />
        </div>
        <div className="bezier-coord">
          <span className="bezier-coord-label">X₂</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={x2}
            onChange={(e) => onChange(`${x1}, ${y1}, ${Number(e.currentTarget.value)}, ${y2}`)}
          />
        </div>
        <div className="bezier-coord">
          <span className="bezier-coord-label">Y₂</span>
          <input
            type="number"
            min={-0.5}
            max={1.5}
            step={0.01}
            value={y2}
            onChange={(e) => onChange(`${x1}, ${y1}, ${x2}, ${Number(e.currentTarget.value)}`)}
          />
        </div>
      </div>
    </div>
  );
};

export default memo(SettingsEthernetThemeEditor);
