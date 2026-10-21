import type { FC } from '../../../lib/teact/teact';
import React, { memo, useEffect, useRef, useState } from '../../../lib/teact/teact';

import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import { getEthernetString } from '../../../util/ethernetLang';
import { cssToMod } from '../../../util/ethernetThemeUtils';

import Modal from '../../ui/Modal';

import styles from './ThemeCssEditorModal.module.scss';

type OwnProps = {
  isOpen: boolean;
  themeName?: string;
  initialCss: string;
  onClose: () => void;
  onSave: (name: string, css: string) => Promise<void>;
};

const QUICK_TOKENS = [
  // Цвета
  { label: '--color-background', insert: 'var(--color-background)' },
  { label: '--color-background-secondary', insert: 'var(--color-background-secondary)' },
  { label: '--color-primary', insert: 'var(--color-primary)' },
  { label: '--color-icon-buttons', insert: 'var(--color-icon-buttons)' },
  { label: '--color-text', insert: 'var(--color-text)' },
  { label: '--color-links', insert: 'var(--color-links)' },
  { label: '--color-borders', insert: 'var(--color-borders)' },
  // Скругления
  { label: '--border-radius-messages', insert: 'var(--border-radius-messages)' },
  { label: '--border-radius-ui', insert: 'var(--border-radius-ui)' },
  { label: '--border-radius-buttons', insert: 'var(--border-radius-buttons)' },
  { label: '--avatar-radius', insert: 'var(--avatar-radius)' },
];

const ThemeCssEditorModal: FC<OwnProps> = ({
  isOpen,
  themeName,
  initialCss,
  onClose,
  onSave,
}) => {
  const lang = useLang();
  const [name, setName] = useState(themeName || '');
  const [css, setCss] = useState(initialCss || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavedJustNow, setIsSavedJustNow] = useState(false);

  const originalCssRef = useRef(initialCss || '');
  const textareaRef = useRef<HTMLTextAreaElement>();

  // Синхронизация при открытии
  useEffect(() => {
    if (isOpen) {
      setName(themeName || '');
      setCss(initialCss || '');
      originalCssRef.current = initialCss || '';
      setIsSavedJustNow(false);
    }
  }, [isOpen, themeName, initialCss]);

  // Мгновенный предпросмотр (0ms hot-reload в DOM)
  const applyLiveCss = useLastCallback((newCss: string) => {
    try {
      let styleEl = document.getElementById('ethernet-active-theme-style') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'ethernet-active-theme-style';
        document.head.appendChild(styleEl);
      }
      const importantCss = newCss.replace(/(--[\w-]+)\s*:\s*([^;!]+);/g, '$1: $2 !important;');
      styleEl.textContent = importantCss;

      // Применяем переменные на htmlStyle
      const parsedMod = cssToMod(newCss);
      const loaderApi = window.ethernet || window.hermes;
      if (loaderApi?.applyMod) {
        loaderApi.applyMod(parsedMod);
      }
    } catch (err) {
      console.error('[ThemeCssEditorModal] Live preview error:', err);
    }
  });

  const handleCssChange = useLastCallback((newVal: string) => {
    setCss(newVal);
    applyLiveCss(newVal);
  });

  const handleSave = useLastCallback(async () => {
    const cleanName = name.trim().replace(/[^\w\u0400-\u04FF-]+/g, '-').replace(/^-+|-+$/g, '') || 'Тема';
    setIsSaving(true);
    try {
      await onSave(cleanName, css);
      originalCssRef.current = css;
      setIsSavedJustNow(true);
      setTimeout(() => {
        setIsSavedJustNow(false);
      }, 2000);
      onClose();
    } catch (err) {
      console.error('[ThemeCssEditorModal] Save error:', err);
    } finally {
      setIsSaving(false);
    }
  });

  // Откат предпросмотра при закрытии без сохранения или подтверждение сохранения
  const handleClose = useLastCallback(() => {
    if (css !== originalCssRef.current) {
      const confirmSave = window.confirm(getEthernetString(lang, 'EthernetUnsavedThemeConfirm'));
      if (confirmSave) {
        void handleSave();
        return;
      }
    }
    applyLiveCss(originalCssRef.current);
    onClose();
  });

  // Глобальный перехват Ctrl+S / Cmd+S для быстрого сохранения
  useEffect(() => {
    if (!isOpen) return undefined;
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onGlobalKey, true);
    return () => window.removeEventListener('keydown', onGlobalKey, true);
  }, [isOpen, handleSave]);

  // Поддержка клавиши Tab (вставка 2 пробелов) и Ctrl+S внутри textarea
  const handleKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void handleSave();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const updated = val.substring(0, start) + '  ' + val.substring(end);
      textarea.value = updated;
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      handleCssChange(updated);
    }
  });

  const insertAtCursor = useLastCallback((textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      handleCssChange(css + (css ? '\n\n' : '') + textToInsert);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const updated = val.substring(0, start) + textToInsert + val.substring(end);
    textarea.value = updated;
    const newPos = start + textToInsert.length;
    textarea.selectionStart = textarea.selectionEnd = newPos;
    textarea.focus();
    handleCssChange(updated);
  });

  const tokenChipsRef = useRef<HTMLDivElement>();
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  const handleTokenWheel = useLastCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  });

  const handleChipsMouseDown = useLastCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    startXRef.current = e.pageX - (tokenChipsRef.current?.offsetLeft || 0);
    scrollLeftRef.current = tokenChipsRef.current?.scrollLeft || 0;
  });

  const handleChipsMouseMove = useLastCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !tokenChipsRef.current) return;
    e.preventDefault();
    const x = e.pageX - (tokenChipsRef.current?.offsetLeft || 0);
    const walk = (x - startXRef.current) * 1.5;
    tokenChipsRef.current.scrollLeft = scrollLeftRef.current - walk;
  });

  const handleChipsMouseUp = useLastCallback(() => {
    isDraggingRef.current = false;
  });

  const lineCount = css ? css.split('\n').length : 0;
  const charCount = css.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      className={styles.modalRoot}
      title={themeName ? `${getEthernetString(lang, 'EthernetEditTheme')}: ${themeName}` : getEthernetString(lang, 'EthernetNewTheme')}
    >
      <div className={styles.root}>
        {/* Верхняя строка: чистое поле названия темы без плашек */}
        <div className={styles.nameInputWrapper}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value.replace(/\.css$/i, ''))}
            placeholder={getEthernetString(lang, 'EthernetThemeName')}
            className={styles.nameInput}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        {/* Панель переменных: плавный горизонтальный скролл */}
        <div className={styles.tokensRow}>
          <span className={styles.tokensLabel}>{getEthernetString(lang, 'EthernetVariables')}:</span>
          <div
            ref={tokenChipsRef}
            className={styles.tokenChips}
            onWheel={handleTokenWheel}
            onMouseDown={handleChipsMouseDown}
            onMouseMove={handleChipsMouseMove}
            onMouseUp={handleChipsMouseUp}
            onMouseLeave={handleChipsMouseUp}
          >
            {QUICK_TOKENS.map((token) => (
              <button
                type="button"
                key={token.label}
                className={styles.tokenChip}
                onClick={() => insertAtCursor(token.insert)}
                title={`${getEthernetString(lang, 'EthernetInsertVariable')} ${token.insert}`}
              >
                {token.label.replace('--color-', '').replace('--border-radius-', 'r-')}
              </button>
            ))}
          </div>
        </div>

        {/* Рабочая область кода */}
        <div className={styles.codeAreaWrapper}>
          <textarea
            ref={textareaRef}
            value={css}
            onChange={(e) => handleCssChange(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={getEthernetString(lang, 'EthernetCssPlaceholder')}
            className={styles.codeTextarea}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        {/* Нижняя панель действий */}
        <div className={styles.bottomBar}>
          <span className={styles.statsText}>
            {getEthernetString(lang, 'EthernetLines')}: {lineCount} · {getEthernetString(lang, 'EthernetCharacters')}: {charCount}
          </span>
          <div className={styles.actionsRight}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className={styles.cancelBtn}
            >
              {lang('Cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={styles.saveBtn}
            >
              {isSaving ? getEthernetString(lang, 'EthernetSaving') : (isSavedJustNow ? getEthernetString(lang, 'EthernetSaved') : getEthernetString(lang, 'EthernetActionSave'))}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default memo(ThemeCssEditorModal);
