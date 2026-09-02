import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import { SettingsScreens } from '../../../types';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import { cssToMod, modToCss } from '../../../util/ethernetThemeUtils';
import { getEthernetString } from '../../../util/ethernetLang';

import Island from '../../gili/layout/Island';
import Button from '../../ui/Button';
import ConfirmDialog from '../../ui/ConfirmDialog';
import Icon from '../../common/icons/Icon';
import InputText from '../../ui/InputText';
import ListItem from '../../ui/ListItem';
import Loading from '../../ui/Loading';
import Modal from '../../ui/Modal';
import PromptDialog from '../../modals/prompt/PromptDialog';
import TextArea from '../../ui/TextArea';
import DocumentationModal from './DocumentationModal';

import styles from './SettingsEthernetThemes.module.scss';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type ThemeInfo = { name: string; active: boolean };

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
    const picked = await api.pickFile('css');
    if (!picked) return;
    const name = picked.name.replace(/\.css$/i, '') || 'Тема';
    await api.themeSave(name, picked.content);
    const parsedMod = cssToMod(picked.content);
    await api.modSet(parsedMod);
    await api.themeActivate(name);
    if (loader?.applyTheme) await loader.applyTheme(name);
    await loadThemes();
  });

  const handleExportActiveTheme = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    const currentMod = (await api.modGet()) || {};
    const activeTheme = themes?.find((t) => t.active);
    const themeName = activeTheme ? activeTheme.name.replace(/\.css$/, '') : 'default';
    const css = modToCss(currentMod, themeName);
    await api.saveFile({
      defaultName: `${themeName}.css`,
      content: css,
      ext: 'css',
      filterName: 'CSS Theme',
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

  const handleSaveCss = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const loader = window.ethernet || window.hermes;
    if (!api || editingName === undefined) return;
    const name = editingName.trim().replace(/[^\w\u0400-\u04FF-]+/g, '-').replace(/^-+|-+$/g, '') || 'Тема';
    await api.themeSave(name, editingCss);
    const parsedMod = cssToMod(editingCss);
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
    const rawName = theme.name.replace(/\.css$/, '');
    await api.themeActivate(rawName);
    try {
      const css = await api.themeRead(theme.name);
      if (css) {
        const parsedMod = cssToMod(css);
        await api.modSet(parsedMod);
        if (loader?.applyMod) loader.applyMod(parsedMod);
      }
    } catch (err) {
      console.error('[ethernet] activate error', err);
    }
    if (loader?.applyTheme) await loader.applyTheme(rawName);
    await loadThemes();
  });

  const handleActivateDefault = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const loader = window.ethernet || window.hermes;
    if (!api) return;
    await api.themeActivate(null);
    if (loader?.clearTheme) {
      await loader.clearTheme();
    }
    const defaultMod = (await api.modGet()) || {};
    if (loader?.applyMod) loader.applyMod(defaultMod);
    await loadThemes();
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
                icon={isDefaultActive ? 'check' : undefined}
                multiline
                narrow
                onClick={handleActivateDefault}
              >
                <span className="title">{getEthernetString(lang, 'EthernetThemeDefault')}</span>
                {isDefaultActive && <span className="subtitle">{getEthernetString(lang, 'EthernetThemeActive')}</span>}
              </ListItem>

              {/* Пользовательские и импортированные темы */}
              {themes.map((theme) => {
                const displayName = theme.name.replace(/\.css$/, '');
                return (
                  <ListItem
                    key={theme.name}
                    icon={theme.active ? 'check' : undefined}
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
                      title: getEthernetString(lang, 'EthernetExportCss'),
                      icon: 'download',
                      handler: async () => {
                        const api = window.ethernetDesktop || window.hermesDesktop;
                        if (!api) return;
                        const css = await api.themeRead(theme.name);
                        await api.saveFile({
                          defaultName: theme.name,
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
                    <span className="title">{displayName}</span>
                    <span className="subtitle">
                      {theme.active ? `${getEthernetString(lang, 'EthernetThemeActive')}` : ''}
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
      <Modal
        isOpen={editingName !== undefined}
        onClose={() => setEditingName(undefined)}
        title={editingName ? `${getEthernetString(lang, 'EthernetEditTheme')}: ${editingName}` : getEthernetString(lang, 'EthernetNewTheme')}
      >
        <div className={styles.editor}>
          <InputText
            value={editingName || ''}
            onChange={(e) => setEditingName(e.currentTarget.value.replace(/\.css$/i, ''))}
            placeholder={getEthernetString(lang, 'EthernetThemeName')}
          />
          <TextArea
            value={editingCss}
            onChange={(e) => setEditingCss(e.currentTarget.value)}
            className={styles.cssArea}
          />
          <div className={styles.editorButtons}>
            <Button onClick={() => setEditingName(undefined)} color="translucent">
              {lang('Cancel')}
            </Button>
            <Button onClick={handleSaveCss}>
              {getEthernetString(lang, 'EthernetActionSave')}
            </Button>
          </div>
        </div>
      </Modal>

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
