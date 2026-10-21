import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import { SettingsScreens } from '../../../types';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import buildClassName from '../../../util/buildClassName';
import {
  buildUniversalThemeJson,
  cssToMod,
  modToCss,
  parseUniversalTheme,
  type UniversalThemePlugin,
} from '../../../util/ethernetThemeUtils';
import { formatVersion, isSvgIcon, sanitizeSvg } from '../../../util/svgIconUtils';
import { getEthernetString } from '../../../util/ethernetLang';

import Island from '../../gili/layout/Island';
import Button from '../../ui/Button';
import ConfirmDialog from '../../ui/ConfirmDialog';
import Icon from '../../common/icons/Icon';
import ListItem from '../../ui/ListItem';
import Loading from '../../ui/Loading';
import PromptDialog from '../../modals/prompt/PromptDialog';
import DocumentationModal from './DocumentationModal';
import ThemeCssEditorModal from './ThemeCssEditorModal';
import { ETH_DEFAULT_COLORS } from './SettingsEthernetThemeEditor';

import styles from './SettingsEthernetThemes.module.scss';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type ThemeInfo = {
  name: string;
  rawName?: string;
  displayName?: string;
  version?: string;
  author?: string;
  description?: string;
  icon?: string;
  pluginsCount?: number;
  hasPlugins?: boolean;
  active: boolean;
};

const SettingsEthernetThemes: FC<OwnProps> = ({ isActive, onReset }) => {
  const lang = useLang();
  const { openSettingsScreen, openChatByUsername } = getActions();

  const openThemeEditor = useLastCallback(() => {
    openSettingsScreen({ screen: SettingsScreens.EthernetThemeEditor });
  });

  const openThemeChannel = useLastCallback(() => {
    openChatByUsername({ username: 'ethTheme' });
  });

  const [themes, setThemes] = useState<ThemeInfo[] | undefined>();
  const [editingName, setEditingName] = useState<string | undefined>();
  const [editingCss, setEditingCss] = useState('');
  const [deletingName, setDeletingName] = useState<string | undefined>();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');

  const loadThemes = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const list = api ? await api.themesList() : [];
    setThemes(list || []);
  });

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  const handleSaveCurrentTheme = useLastCallback(async (name: string) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const loader = window.ethernet || window.hermes;
    if (!api) return;
    try {
      const cleanName = (name || '').trim().replace(/[^\w\u0400-\u04FF -]+/g, '').replace(/^-+|-+$/g, '') || 'Тема';
      const currentMod = (await api.modGet()) || {};
      const css = modToCss(currentMod, cleanName);
      const wpInfo = (currentMod.wallpaperFile) ? {
        file: currentMod.wallpaperFile,
        kind: currentMod.wallpaperKind || (/\.(mp4|webm)$/i.test(currentMod.wallpaperFile) ? 'video' : 'image'),
        slug: currentMod.wallpaperFile.replace(/\.[^.]+$/, ''),
        originalPath: currentMod.wallpaperOriginalPath,
      } : undefined;
      await api.themeSave(cleanName, css, wpInfo);
      await api.themeActivate(cleanName);
      if (loader?.applyTheme) {
        await loader.applyTheme(cleanName);
      }
    } catch (err) {
      console.error('[ethernet] save theme error', err);
    } finally {
      setIsSaveModalOpen(false);
      await loadThemes();
    }
  });

  const handleImportFile = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const loader = window.ethernet || window.hermes;
    if (!api) return;
    const picked = await api.pickFile('theme');
    if (!picked) return;
    const defaultName = picked.name.replace(/\.(css|eth|eth-theme|json)$/i, '') || 'Тема';
    const parsed = parseUniversalTheme(picked.content, defaultName);
    const themeName = (parsed.name || defaultName).trim();

    // 1. Разворачиваем зависимые плагины, если они запакованы в тему
    if (parsed.plugins && parsed.plugins.length > 0 && api.pluginSave) {
      for (const plugin of parsed.plugins) {
        try {
          await api.pluginSave({
            id: plugin.id,
            name: plugin.name,
            version: plugin.version,
            author: plugin.author,
            description: plugin.description,
            icon: plugin.icon,
            code: plugin.code,
            permissions: plugin.permissions,
            themeDependency: themeName,
            requiredForTheme: themeName,
            enabled: true,
          });
        } catch (pluginErr) {
          console.warn('[ethernet] Failed to unbundle plugin for theme:', plugin.name, pluginErr);
        }
      }
      window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
    }

    // 2. Сохраняем тему и активируем её
    await api.themeSave(themeName, parsed.css, parsed.wallpaper);
    if (parsed.mod) {
      await api.modSet(parsed.mod);
    }
    await api.themeActivate(themeName);
    if (loader?.applyTheme) await loader.applyTheme(themeName);
    await loadThemes();
  });

  const handleExportActiveTheme = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    const currentMod = (await api.modGet()) || {};
    const activeTheme = themes?.find((t) => t.active);
    const themeName = activeTheme
      ? (activeTheme.displayName || activeTheme.rawName || activeTheme.name.replace(/\.(css|eth|eth-theme|json)$/, ''))
      : 'default';
    const css = modToCss(currentMod, themeName);

    // Собираем плагины, привязанные к теме
    const allPlugins = api.pluginsList ? await api.pluginsList() : [];
    const themePlugins = allPlugins?.filter((p) => p.themeDependency === themeName || p.requiredForTheme === themeName) || [];
    const bundledPlugins: UniversalThemePlugin[] = [];
    if (themePlugins.length > 0 && api.pluginRead) {
      for (const tp of themePlugins) {
        try {
          const { code, manifest } = await api.pluginRead(tp.id);
          const manifestObj = typeof manifest === 'string' ? JSON.parse(manifest) : (manifest || {});
          bundledPlugins.push({
            id: tp.id,
            name: tp.name,
            version: tp.version,
            author: tp.author,
            description: tp.description,
            icon: tp.icon,
            code,
            permissions: manifestObj.permissions || tp.permissions,
          });
        } catch {}
      }
    }

    const universalJson = buildUniversalThemeJson({
      name: themeName,
      version: activeTheme?.version || '1.0.0',
      author: activeTheme?.author || 'User',
      description: activeTheme?.description || '',
      icon: activeTheme?.icon,
      css,
      mod: currentMod,
      wallpaper: currentMod.wallpaperFile ? {
        file: currentMod.wallpaperFile,
        kind: currentMod.wallpaperKind || 'image',
        slug: currentMod.wallpaperFile.replace(/\.[^.]+$/, ''),
        originalPath: currentMod.wallpaperOriginalPath,
      } : undefined,
      plugins: bundledPlugins,
    });

    await api.saveFile({
      defaultName: `${themeName}.eth`,
      content: universalJson,
      ext: 'eth',
      filterName: 'Ethernet Package (*.eth, *.json)',
    });
  });

  const handleOpenEditor = useLastCallback(async (name?: string) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    if (name) {
      setEditingName(name);
      setEditingCss(await api.themeRead(`${name}.css`));
    } else {
      const currentMod = (await api.modGet()) || {};
      setEditingName('');
      setEditingCss(modToCss(currentMod, 'Новая тема'));
    }
  });

  const handleSaveCss = useLastCallback(async (nameToSave: string, cssToSave: string) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const loader = window.ethernet || window.hermes;
    if (!api) return;
    const name = (nameToSave || '').trim().replace(/[^\w\u0400-\u04FF-]+/g, '-').replace(/^-+|-+$/g, '') || 'Тема';
    await api.themeSave(name, cssToSave);
    const parsed = parseUniversalTheme(cssToSave, name);
    const parsedMod = parsed.mod || cssToMod(parsed.css || cssToSave);
    await api.modSet(parsedMod);
    await api.themeActivate(name);
    if (loader?.applyTheme) await loader.applyTheme(name);
    await loadThemes();
    setEditingName(undefined);
  });

  const handleActivate = useLastCallback(async (theme: ThemeInfo) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const loader = window.ethernet || window.hermes;
    if (!api) return;
    const rawName = theme.rawName || theme.name.replace(/\.(css|eth|json|eth-theme)$/i, '');
    // Optimistic UI update: instantly move checkmark to selected theme
    setThemes((prev) => prev?.map((t) => ({ ...t, active: t.name === theme.name })));
    try {
      await api.themeActivate(rawName);
      if (loader?.applyTheme) await loader.applyTheme(rawName);
      window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
    } catch (err) {
      console.error('[ethernet] activate error', err);
    } finally {
      await loadThemes();
    }
  });

  const handleActivateDefault = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const loader = window.ethernet || window.hermes;
    if (!api) return;
    // Optimistic UI update: uncheck all custom themes so default is active
    setThemes((prev) => prev?.map((t) => ({ ...t, active: false })));
    try {
      await api.themeActivate(null);
      if (loader?.clearTheme) {
        await loader.clearTheme();
      }
      const defaultMod = (await api.modGet()) || {};
      const finalMod = {
        ...defaultMod,
        colors: (defaultMod.colors && Object.keys(defaultMod.colors).length > 0)
          ? defaultMod.colors
          : { ...ETH_DEFAULT_COLORS },
      };
      if (loader?.applyMod) loader.applyMod(finalMod);
      window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
    } catch (err) {
      console.error('[ethernet] activate default error', err);
    } finally {
      await loadThemes();
    }
  });

  const handleDelete = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api || !deletingName) return;
    await api.themeDelete(deletingName);
    setDeletingName(undefined);
    await loadThemes();
  });

  const isDefaultActive = !themes?.some((t) => t.active);

  return (
    <div className="settings-content custom-scroll">
      {themes === undefined ? (
        <Loading />
      ) : (
        <>
          {/* Верхняя карточка перехода в визуальный редактор */}
          <Island className={styles.topIsland}>
            <ListItem
              icon="brush"
              multiline
              narrow
              onClick={openThemeEditor}
            >
              <span className="title">{getEthernetString(lang, 'EthernetThemeEditor')}</span>
              <span className="subtitle">{getEthernetString(lang, 'EthernetThemeEditorDesc')}</span>
            </ListItem>
          </Island>

          {/* Панель иконок-действий и список тем */}
          <Island className={styles.mainIsland}>
            <div className={styles.iconActions}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => {
                  setNewThemeName('');
                  setIsSaveModalOpen(true);
                }}
                title={getEthernetString(lang, 'EthernetSaveCurrentTheme')}
              >
                <Icon name="check-filled" className={styles.btnIcon} />
                <span>{getEthernetString(lang, 'EthernetActionSave')}</span>
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={handleImportFile}
                title={getEthernetString(lang, 'EthernetImportCssFile')}
              >
                <Icon name="attach" className={styles.btnIcon} />
                <span>{getEthernetString(lang, 'EthernetActionImport')}</span>
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={handleExportActiveTheme}
                title={getEthernetString(lang, 'EthernetExportTheme')}
              >
                <Icon name="download" className={styles.btnIcon} />
                <span>{getEthernetString(lang, 'EthernetActionExport')}</span>
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => handleOpenEditor()}
                title={getEthernetString(lang, 'EthernetNewTheme')}
              >
                <Icon name="add" className={styles.btnIcon} />
                <span>{getEthernetString(lang, 'EthernetActionCreate')}</span>
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => setIsDocsModalOpen(true)}
                title={getEthernetString(lang, 'EthernetActionDocs')}
              >
                <Icon name="help" className={styles.btnIcon} />
                <span>{getEthernetString(lang, 'EthernetActionDocs')}</span>
              </button>
            </div>

            <div className={styles.sectionHeader}>
              {getEthernetString(lang, 'EthernetThemeSelection')}
            </div>

            <div className={styles.list}>
              {/* Стандартная тема */}
              <ListItem
                key="__default__"
                leftElement={(
                  <div className={buildClassName('ListItem-main-icon', styles.defaultThemeIcon)}>
                    <Icon name="brush" className={styles.defaultIconGraphic} />
                  </div>
                )}
                rightElement={isDefaultActive ? <Icon name="check" className={styles.activeCheckIcon} /> : undefined}
                multiline
                narrow
                onClick={handleActivateDefault}
              >
                <span className="title">{getEthernetString(lang, 'EthernetThemeDefault')}</span>
                {isDefaultActive && <span className="subtitle">{getEthernetString(lang, 'EthernetThemeActive')}</span>}
              </ListItem>

              {/* Пользовательские и импортированные темы */}
              {themes.map((theme) => {
                const displayName = theme.displayName || theme.rawName || theme.name.replace(/\.(css|eth|eth-theme|json)$/, '');
                const formattedVer = formatVersion(theme.version);
                const hasCustomIcon = Boolean(theme.icon && isSvgIcon(theme.icon));
                const cleanSvg = hasCustomIcon ? sanitizeSvg(theme.icon!) : undefined;

                return (
                  <ListItem
                    key={theme.name}
                    leftElement={
                      cleanSvg ? (
                        <div
                          className={buildClassName('ListItem-main-icon', styles.customSvgIcon)}
                          dangerouslySetInnerHTML={{ __html: cleanSvg }}
                        />
                      ) : (
                        <div className={buildClassName('ListItem-main-icon', styles.defaultThemeIcon)}>
                          <Icon name="brush" className={styles.defaultIconGraphic} />
                        </div>
                      )
                    }
                    rightElement={theme.active ? <Icon name="check" className={styles.activeCheckIcon} /> : undefined}
                    multiline
                    narrow
                    withPortalForMenu
                    onClick={() => handleActivate(theme)}
                    contextActions={[{
                      title: getEthernetString(lang, 'EthernetEditInEditor'),
                      icon: 'brush',
                      handler: () => {
                        handleActivate(theme);
                        openThemeEditor();
                      },
                    }, {
                      title: 'Экспорт универсального пакета (.eth)',
                      icon: 'download',
                      handler: async () => {
                        const api = window.ethernetDesktop || window.hermesDesktop;
                        if (!api) return;
                        const raw = await api.themeRead(theme.name);
                        const parsed = parseUniversalTheme(raw, displayName);
                        const allPlugins = api.pluginsList ? await api.pluginsList() : [];
                        const themePlugins = allPlugins?.filter((p) => p.themeDependency === displayName || p.requiredForTheme === displayName) || [];
                        const bundledPlugins: UniversalThemePlugin[] = [];
                        if (themePlugins.length > 0 && api.pluginRead) {
                          for (const tp of themePlugins) {
                            try {
                              const { code, manifest } = await api.pluginRead(tp.id);
                              const manifestObj = typeof manifest === 'string' ? JSON.parse(manifest) : (manifest || {});
                              bundledPlugins.push({
                                id: tp.id,
                                name: tp.name,
                                version: tp.version,
                                author: tp.author,
                                description: tp.description,
                                icon: tp.icon,
                                code,
                                permissions: manifestObj.permissions || tp.permissions,
                              });
                            } catch {}
                          }
                        }
                        const universalJson = buildUniversalThemeJson({
                          name: displayName,
                          version: theme.version || parsed.version || '1.0.0',
                          author: theme.author || parsed.author || 'User',
                          description: theme.description || parsed.description || '',
                          icon: theme.icon || parsed.icon,
                          css: parsed.css,
                          mod: parsed.mod,
                          plugins: bundledPlugins.length > 0 ? bundledPlugins : parsed.plugins,
                        });
                        await api.saveFile({
                          defaultName: `${displayName}.eth`,
                          content: universalJson,
                          ext: 'eth',
                          filterName: 'Ethernet Package (*.eth, *.json)',
                        });
                      },
                    }, {
                      title: getEthernetString(lang, 'EthernetExportCss'),
                      icon: 'download',
                      handler: async () => {
                        const api = window.ethernetDesktop || window.hermesDesktop;
                        if (!api) return;
                        const css = await api.themeRead(theme.name);
                        await api.saveFile({
                          defaultName: `${displayName}.css`,
                          content: css,
                          ext: 'css',
                        });
                      },
                    }, {
                      title: getEthernetString(lang, 'EthernetEditCssCode'),
                      icon: 'edit',
                      handler: () => handleOpenEditor(displayName),
                    }, {
                      title: lang('Delete'),
                      icon: 'delete',
                      destructive: true,
                      handler: () => setDeletingName(theme.name),
                    }]}
                  >
                    <div className={styles.themeTitleRow}>
                      <span className="title">{displayName}</span>
                      {Boolean(theme.pluginsCount && theme.pluginsCount > 0) && (
                        <span className={styles.pluginsBadge} title={`Тема включает ${theme.pluginsCount} плагин(ов)`}>
                          <Icon name="link" className={styles.pluginsBadgeIcon} />
                          <span>{theme.pluginsCount}</span>
                        </span>
                      )}
                    </div>
                    <span className="subtitle">
                      {theme.description ? `${theme.description} · ` : ''}
                      {theme.author ? `от ${theme.author}` : ''}
                      {formattedVer ? (theme.author ? ` · ${formattedVer}` : formattedVer) : ''}
                      {theme.active && (
                        <span className={styles.activeText}>
                          {(theme.description || theme.author || formattedVer) ? ' · ' : ''}
                          {getEthernetString(lang, 'EthernetThemeActive')}
                        </span>
                      )}
                    </span>
                  </ListItem>
                );
              })}
            </div>
          </Island>

          {/* Ссылка на канал с темами */}
          <Island className={styles.bottomIsland}>
            <ListItem
              icon="channel"
              multiline
              narrow
              ripple
              onClick={openThemeChannel}
            >
              <span className="title">{getEthernetString(lang, 'EthernetThemeChannel')}</span>
              <span className="subtitle">{getEthernetString(lang, 'EthernetThemeChannelDesc')}</span>
            </ListItem>
          </Island>
        </>
      )}

      {/* Модальное окно "Сохранить текущую тему" */}
      <PromptDialog
        isOpen={isSaveModalOpen}
        title={getEthernetString(lang, 'EthernetSaveCurrentTheme')}
        placeholder={getEthernetString(lang, 'EthernetThemeName')}
        initialValue=""
        submitText={getEthernetString(lang, 'EthernetActionSave')}
        onClose={() => setIsSaveModalOpen(false)}
        onSubmit={handleSaveCurrentTheme}
      />

      {/* Модальное окно редактирования CSS темы */}
      <ThemeCssEditorModal
        isOpen={editingName !== undefined}
        themeName={editingName || ''}
        initialCss={editingCss}
        onClose={() => setEditingName(undefined)}
        onSave={handleSaveCss}
      />

      <ConfirmDialog
        isOpen={Boolean(deletingName)}
        onClose={() => setDeletingName(undefined)}
        text={getEthernetString(lang, 'EthernetDeleteThemeConfirm')}
        confirmHandler={handleDelete}
        confirmIsDestructive
      />

      <DocumentationModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
        initialTab="themes"
      />
    </div>
  );
};

export default memo(SettingsEthernetThemes);
