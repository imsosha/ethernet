import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useRef, useState } from '../../../lib/teact/teact';

import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import buildClassName from '../../../util/buildClassName';
import { getEthernetString } from '../../../util/ethernetLang';
import { formatVersion, isSvgIcon, sanitizeSvg } from '../../../util/svgIconUtils';
import { getActions } from '../../../global';

import Button from '../../ui/Button';
import ConfirmDialog from '../../ui/ConfirmDialog';
import InputText from '../../ui/InputText';
import ListItem from '../../ui/ListItem';
import Loading from '../../ui/Loading';
import Modal from '../../ui/Modal';
import TextArea from '../../ui/TextArea';
import Switcher from '../../ui/Switcher';
import Island from '../../gili/layout/Island';
import Icon from '../../common/icons/Icon';
import DocumentationModal from './DocumentationModal';

import styles from './SettingsEthernetPlugins.module.scss';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type PluginInfo = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  icon?: string;
  themeDependency?: string;
  requiredForTheme?: string;
  enabled: boolean;
  permissions?: string[];
  grantedPermissions?: Record<string, boolean>;
  hasDangerousPermissions?: boolean;
  hasActiveDangerousPermissions?: boolean;
};

const DANGEROUS_PERMS_SET = new Set([
  'credentials',
  'telegram.updates',
  'network.intercept',
  'network.raw',
  'telegram.store',
  'desktop.ipc',
]);

const SettingsEthernetPlugins: FC<OwnProps> = ({ isActive, onReset }) => {
  const lang = useLang();
  const { openChatByUsername } = getActions();

  const openPluginChannel = useLastCallback(() => {
    openChatByUsername({ username: 'ethPlugin' });
  });

  const [plugins, setPlugins] = useState<PluginInfo[] | undefined>();
  // редактор: undefined = закрыт, иначе черновик плагина
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; code: string } | undefined>();
  const [deletingId, setDeletingId] = useState<string | undefined>();
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [hasPendingReload, setHasPendingReload] = useState(false);
  const [isSafeMode, setIsSafeMode] = useState(false);
  const [crashedInfo, setCrashedInfo] = useState<{ id: string; error: string; time: number } | null>(null);

  // Настройки разрешений выбранного плагина
  const [selectedPluginForSettings, setSelectedPluginForSettings] = useState<PluginInfo | undefined>();
  const customSettingsRef = useRef<HTMLDivElement>();

  useEffect(() => {
    if (!selectedPluginForSettings) return;
    const pluginId = selectedPluginForSettings.id;
    const renderFn = (window as any).__ethernetRenderPluginSettings;

    const mount = () => {
      const container = customSettingsRef.current;
      if (container && renderFn) {
        renderFn(pluginId, container);
      }
    };

    mount();
    const t = setTimeout(mount, 40);

    const handleUpdate = () => {
      mount();
    };
    window.addEventListener('ethernet:plugins-updated', handleUpdate);

    return () => {
      clearTimeout(t);
      window.removeEventListener('ethernet:plugins-updated', handleUpdate);
      if (customSettingsRef.current) {
        customSettingsRef.current.innerHTML = '';
      }
    };
  }, [selectedPluginForSettings]);

  // Окно проверки безопасности перед импортом
  const [pendingImport, setPendingImport] = useState<{
    picked: { name: string; content: string };
    inspection: {
      valid: boolean;
      errors: string[];
      warnings: string[];
      declaredPermissions: string[];
      hasDangerousPermissions: boolean;
      dangerousPermissions: string[];
      metadata: Record<string, any>;
    };
    grantedPermissions: Record<string, boolean>;
  } | undefined>();

  // Сообщение о блокировке импорта из-за попытки обхода песочницы
  const [blockedImportMessage, setBlockedImportMessage] = useState<string | undefined>();

  const loadPlugins = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const list = api ? await api.pluginsList() : [];
    if (list) {
      const disabledSet = new Set(list.filter((p: PluginInfo) => !p.enabled).map((p: PluginInfo) => p.id));
      (window as any).__ethernetDisabledPlugins = disabledSet;
      (window as any).__hermesDisabledPlugins = disabledSet;
    }
    setPlugins(list);
  });

  const loadSafeModeState = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (api?.safeModeGet) {
      const isSafe = await api.safeModeGet();
      setIsSafeMode(isSafe);
      (window as any).__ethernetSafeMode = isSafe;
      (window as any).__hermesSafeMode = isSafe;
    }
    if (api?.lastCrashedPluginGet) {
      setCrashedInfo(await api.lastCrashedPluginGet());
    }
  });

  useEffect(() => {
    loadPlugins();
    loadSafeModeState();
  }, [loadPlugins, loadSafeModeState]);

  const handleToggleSafeMode = useLastCallback(async () => {
    const next = !isSafeMode;
    setIsSafeMode(next);
    (window as any).__ethernetSafeMode = next;
    (window as any).__hermesSafeMode = next;
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (api?.safeModeSet) {
      await api.safeModeSet(next);
    }
    if (next) {
      document.querySelectorAll('.ethernet-peer-id-dc-container, [data-ethernet-plugin], #ethernet-peer-id-dc-styles').forEach((el) => el.remove());
    }
    if (!next && api?.clearLastCrashedPlugin) {
      await api.clearLastCrashedPlugin();
      setCrashedInfo(null);
    }
    await loadPlugins();
    window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
  });

  const handleDismissCrash = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (api?.clearLastCrashedPlugin) {
      await api.clearLastCrashedPlugin();
      setCrashedInfo(null);
    }
  });

  const handleTogglePermission = useLastCallback(async (pluginId: string, permission: string, granted: boolean) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api?.pluginSetPermission) return;
    await api.pluginSetPermission(pluginId, permission, granted);

    setPlugins((prev) => prev?.map((p) => {
      if (p.id !== pluginId) return p;
      const updatedGranted = { ...(p.grantedPermissions || {}), [permission]: granted };
      return {
        ...p,
        grantedPermissions: updatedGranted,
        hasActiveDangerousPermissions: (p.permissions || []).some((perm) =>
          DANGEROUS_PERMS_SET.has(perm) && updatedGranted[perm] !== false
        ),
      };
    }));

    setSelectedPluginForSettings((prev) => {
      if (!prev || prev.id !== pluginId) return prev;
      const updatedGranted = { ...(prev.grantedPermissions || {}), [permission]: granted };
      return {
        ...prev,
        grantedPermissions: updatedGranted,
        hasActiveDangerousPermissions: (prev.permissions || []).some((perm) =>
          DANGEROUS_PERMS_SET.has(perm) && updatedGranted[perm] !== false
        ),
      };
    });

    window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
  });

  const handleImportFile = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    const picked = await api.pickFile('plugin');
    if (!picked) return;

    let contentToInspect = picked.content;
    let fallbackName = picked.name.replace(/\.(eth|js|json)$/i, '');
    let pkgMeta: any = {};

    if (picked.name.endsWith('.eth') || picked.content.trim().startsWith('{')) {
      try {
        const pkg = JSON.parse(picked.content);
        if (pkg.code) {
          contentToInspect = pkg.code;
          pkgMeta = { ...pkg };
          if (pkg.name) fallbackName = pkg.name;
        } else if (pkg.css) {
          setBlockedImportMessage('Выбранный .eth пакет является Темой оформления. Для импорта тем откройте раздел «Темы» и нажмите «Импорт темы».');
          return;
        }
      } catch {}
    }

    if (api.pluginInspect) {
      const inspection = await api.pluginInspect(contentToInspect);
      if (!inspection.valid) {
        setBlockedImportMessage(inspection.errors.join('\n\n'));
        return;
      }
      const initialGranted: Record<string, boolean> = {};
      (inspection.declaredPermissions || []).forEach((p: string) => {
        initialGranted[p] = true;
      });
      setPendingImport({
        picked: {
          ...picked,
          content: contentToInspect,
          name: fallbackName,
        },
        inspection: {
          ...inspection,
          metadata: { ...pkgMeta, ...(inspection.metadata || {}) },
        },
        grantedPermissions: initialGranted,
      });
      return;
    }

    const name = fallbackName;
    const id = await api.pluginSave({
      id: name,
      name,
      description: pkgMeta.description || `Imported from ${picked.name}`,
      author: pkgMeta.author || 'User',
      version: pkgMeta.version || '1.0.0',
      icon: pkgMeta.icon,
      code: contentToInspect,
    });
    if (typeof id === 'string') {
      await api.pluginToggle(id);
    }
    await loadPlugins();
    window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
  });

  const handleExportPlugin = useLastCallback(async (plugin: PluginInfo) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api || !api.pluginRead || !api.saveFile) return;
    try {
      const data = await api.pluginRead(plugin.id);
      let manifest: any = {};
      try {
        manifest = JSON.parse(data.manifest);
      } catch {}

      const pkg = {
        format: 'ethernet-v1',
        type: 'plugin',
        id: plugin.id,
        name: plugin.name,
        version: plugin.version || manifest.version || '1.0.0',
        author: plugin.author || manifest.author || 'User',
        description: plugin.description || manifest.description || '',
        icon: plugin.icon || manifest.icon || undefined,
        themeDependency: plugin.themeDependency || manifest.themeDependency || undefined,
        code: data.code || '',
        permissions: plugin.permissions || manifest.permissions || [],
      };

      await api.saveFile({
        defaultName: `${plugin.id}.eth`,
        content: JSON.stringify(pkg, null, 2),
        ext: 'eth',
        filterName: 'Ethernet Package (*.eth)',
      });
    } catch (err: any) {
      setBlockedImportMessage(`Не удалось экспортировать плагин: ${err.message || String(err)}`);
    }
  });

  const handleConfirmImport = useLastCallback(async () => {
    if (!pendingImport) return;
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;

    const { picked, inspection, grantedPermissions } = pendingImport;
    const meta = inspection.metadata || {};
    const name = meta.name || picked.name.replace(/\.(eth|js|json)$/i, '');
    try {
      const id = await api.pluginSave({
        name,
        description: meta.description || `Imported from ${picked.name}`,
        version: meta.version || '1.0.0',
        author: meta.author || 'User',
        icon: meta.icon,
        themeDependency: meta.themeDependency || meta.requiredForTheme,
        requiredForTheme: meta.requiredForTheme || meta.themeDependency,
        code: picked.content,
        permissions: inspection.declaredPermissions,
        grantedPermissions,
      });
      if (typeof id === 'string') {
        await api.pluginToggle(id);
      }
      setPendingImport(undefined);
      await loadPlugins();
      window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
    } catch (err: any) {
      setBlockedImportMessage(err.message || String(err));
    }
  });

  const handleOpenEditor = useLastCallback(async (id?: string) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (id && api) {
      const data = await api.pluginRead(id);
      let manifest = { name: id, description: '', version: '1.0.0' };
      try {
        manifest = JSON.parse(data.manifest);
      } catch {}
      const metaName = (data.code || '').match(/@name[:=\s]+([^\r\n*]+)/i);
      const metaDesc = (data.code || '').match(/@description[:=\s]+([^\r\n*]+)/i);
      setEditing({
        id,
        name: metaName ? metaName[1].trim() : (manifest.name || id),
        description: metaDesc ? metaDesc[1].trim() : (manifest.description || ''),
        code: data.code || '',
      });
    } else {
      setEditing({
        name: '',
        description: '',
        code: DEFAULT_PLUGIN_TEMPLATE,
      });
    }
  });

  const handleSave = useLastCallback(async () => {
    if (!editing || !editing.name.trim()) return;
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    const pluginId = editing.id || editing.name.trim().toLowerCase().replace(/[^\w-]+/g, '-');

    const metaVer = editing.code.match(/(?:@version|--plugin-version)["':=\s]+([0-9a-zA-Z._-]+)/i);
    const version = metaVer ? metaVer[1].trim().replace(/^[vV]+/, '') : undefined;
    const metaAuth = editing.code.match(/@author[:=\s]+([^\r\n*]+)/i);
    const author = metaAuth ? metaAuth[1].trim() : undefined;

    try {
      await api.pluginSave({
        id: pluginId,
        name: editing.name.trim(),
        description: editing.description.trim(),
        version,
        author,
        code: editing.code,
      });
      if (!editing.id) {
        await api.pluginToggle(pluginId);
      }
      setEditing(undefined);
      await loadPlugins();
      window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
    } catch (err: any) {
      setBlockedImportMessage(err.message || String(err));
    }
  });

  const handleToggle = useLastCallback(async (plugin: PluginInfo) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    await api.pluginToggle(plugin.id);
    const updated = await api.pluginsList();
    if (updated) {
      const disabledSet = new Set(updated.filter((p: PluginInfo) => !p.enabled).map((p: PluginInfo) => p.id));
      (window as any).__ethernetDisabledPlugins = disabledSet;
      (window as any).__hermesDisabledPlugins = disabledSet;
    }
    setSelectedPluginForSettings((prev) => (prev && prev.id === plugin.id ? { ...prev, enabled: !prev.enabled } : prev));
    await loadPlugins();
    window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
  });

  const handleDelete = useLastCallback(async () => {
    if (!deletingId) return;
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (api) {
      await api.pluginDelete(deletingId);
    }
    setDeletingId(undefined);
    await loadPlugins();
    window.dispatchEvent(new CustomEvent('ethernet:plugins-updated'));
  });

  return (
    <div className="settings-content custom-scroll">
      {plugins === undefined ? (
        <Loading />
      ) : (
        <>
          {/* Safe Mode Switcher & Crash Alert */}
          <Island className={styles.safeModeIsland}>
            <ListItem
              icon="lock"
              multiline
              narrow
              onClick={handleToggleSafeMode}
              rightElement={(
                <Switcher
                  label={getEthernetString(lang, 'EthernetSafeMode')}
                  checked={isSafeMode}
                  inactive
                />
              )}
            >
              <span className="title">{getEthernetString(lang, 'EthernetSafeMode')}</span>
              <span className="subtitle">{getEthernetString(lang, 'EthernetSafeModeDesc')}</span>
            </ListItem>

            {crashedInfo && (
              <div className={styles.crashAlert}>
                <div className={styles.crashAlertHeader}>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <Icon name="warning" style="font-size: 1.125rem;" />
                    <span>{getEthernetString(lang, 'EthernetSafeModePluginCrashed')}: {crashedInfo.id}</span>
                  </div>
                  <button
                    type="button"
                    style="background: none; border: none; color: inherit; cursor: pointer; padding: 0 4px; display: flex; align-items: center;"
                    onClick={handleDismissCrash}
                    title={lang('Close')}
                  >
                    <Icon name="close" style="font-size: 1rem;" />
                  </button>
                </div>
                <div className={styles.crashAlertBody}>{crashedInfo.error}</div>
              </div>
            )}
          </Island>

          <Island className={styles.mainIsland}>
            {isSafeMode && (
              <div className={styles.safeModeAlertBanner}>
                <Icon name="lock" className={styles.safeModeAlertIcon} />
                <div className={styles.safeModeAlertText}>
                  <span className={styles.safeModeAlertTitle}>
                    {getEthernetString(lang, 'EthernetSafeModeActive')}
                  </span>
                  <span className={styles.safeModeAlertDesc}>
                    {getEthernetString(lang, 'EthernetSafeModeBlocked')}
                  </span>
                </div>
              </div>
            )}

            <div className={styles.iconActions}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={handleImportFile}
                title={getEthernetString(lang, 'EthernetImportJsFile')}
              >
                <Icon name="attach" className={styles.btnIcon} />
                <span>{getEthernetString(lang, 'EthernetActionImport')}</span>
              </button>

              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => handleOpenEditor()}
                title={getEthernetString(lang, 'EthernetNewPlugin')}
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

            <ListItem icon="code" multiline narrow isStatic>
              <span className="subtitle">{getEthernetString(lang, 'EthernetPluginsHint')}</span>
            </ListItem>

            <div className={styles.list}>
              {plugins.map((plugin) => (
                <ListItem
                  key={plugin.id}
                  leftElement={
                    plugin.icon && isSvgIcon(plugin.icon) ? (
                      <div
                        className={buildClassName('ListItem-main-icon', styles.customSvgIcon)}
                        dangerouslySetInnerHTML={{ __html: sanitizeSvg(plugin.icon) }}
                      />
                    ) : (
                      <div className={buildClassName('ListItem-main-icon', styles.defaultPluginIcon)}>
                        <Icon name="link" className={styles.defaultIconGraphic} />
                      </div>
                    )
                  }
                  multiline
                  narrow
                  onClick={() => setSelectedPluginForSettings(plugin)}
                  contextActions={[{
                    title: getEthernetString(lang, 'EthernetActionSettings'),
                    icon: 'settings',
                    handler: () => setSelectedPluginForSettings(plugin),
                  }, {
                    title: 'Экспорт в .eth',
                    icon: 'download',
                    handler: () => handleExportPlugin(plugin),
                  }, {
                    title: lang('Edit'),
                    icon: 'edit',
                    handler: () => handleOpenEditor(plugin.id),
                  }, {
                    title: lang('Delete'),
                    icon: 'delete',
                    destructive: true,
                    handler: () => setDeletingId(plugin.id),
                  }]}
                  rightElement={(
                    <div className={styles.pluginItemRight}>
                      <button
                        type="button"
                        className={styles.settingsGearBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPluginForSettings(plugin);
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        title={getEthernetString(lang, 'EthernetActionSettings')}
                      >
                        <Icon name="settings" className={styles.gearIcon} />
                      </button>
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <Switcher
                          label={plugin.name}
                          checked={plugin.enabled}
                          onCheck={() => handleToggle(plugin)}
                        />
                      </div>
                    </div>
                  )}
                >
                  <div className={styles.pluginTitleRow}>
                    <span className="title">{plugin.name}</span>
                    {(plugin.themeDependency || plugin.requiredForTheme) && (
                      <span
                        className={styles.themeDepBadge}
                        title={`Этот плагин необходим для работы темы «${plugin.themeDependency || plugin.requiredForTheme}»`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPluginForSettings(plugin);
                        }}
                      >
                        <Icon name="brush" className={styles.themeBadgeIcon} />
                        <span>Тема: {plugin.themeDependency || plugin.requiredForTheme}</span>
                      </span>
                    )}
                    {plugin.hasDangerousPermissions && (
                      <span
                        className={styles.dangerBadge}
                        title={getEthernetString(lang, 'EthernetPluginDangerousBadgeTooltip')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPluginForSettings(plugin);
                        }}
                      >
                        !
                      </span>
                    )}
                  </div>
                  <span className="subtitle">
                    {isSafeMode && plugin.enabled ? (
                      <span style="color: var(--color-primary);">
                        {getEthernetString(lang, 'EthernetDisabledInSafeMode')}
                      </span>
                    ) : (
                      <>
                        {plugin.description || plugin.id}
                        {plugin.version && ` · ${formatVersion(plugin.version)}`}
                      </>
                    )}
                  </span>
                </ListItem>
              ))}
            </div>
          </Island>

          {/* Ссылка на канал с плагинами */}
          <Island className={styles.bottomIsland}>
            <ListItem
              icon="channel"
              multiline
              narrow
              ripple
              onClick={openPluginChannel}
            >
              <span className="title">{getEthernetString(lang, 'EthernetPluginChannel')}</span>
              <span className="subtitle">{getEthernetString(lang, 'EthernetPluginChannelDesc')}</span>
            </ListItem>
          </Island>
        </>
      )}

      {hasPendingReload && (
        <Island className={styles.reloadIsland}>
          <div className={styles.reloadBannerContent}>
            <Icon name="replace" className={styles.reloadIcon} />
            <div className={styles.reloadBannerText}>
              <span className={styles.reloadTitle}>
                {getEthernetString(lang, 'EthernetReloadClientPrompt')}
              </span>
              <span className={styles.reloadSubtitle}>
                {getEthernetString(lang, 'EthernetReloadRequired')}
              </span>
            </div>
          </div>
          <div className={styles.reloadBannerActions}>
            <Button
              size="smaller"
              className={styles.reloadBtn}
              onClick={() => {
                const api = window.ethernetDesktop || window.hermesDesktop;
                if (api) api.reload();
              }}
            >
              {getEthernetString(lang, 'EthernetActionReload')}
            </Button>
            <Button
              size="smaller"
              color="translucent"
              className={styles.dismissBtn}
              onClick={() => setHasPendingReload(false)}
            >
              {getEthernetString(lang, 'EthernetActionLater')}
            </Button>
          </div>
        </Island>
      )}

      {/* Модалка настроек плагина (просмотр и переключение разрешений) */}
      <Modal
        isOpen={selectedPluginForSettings !== undefined}
        onClose={() => setSelectedPluginForSettings(undefined)}
        className={styles.editorModalRoot}
        title={selectedPluginForSettings ? `${getEthernetString(lang, 'EthernetPluginSettings')}: ${selectedPluginForSettings.name}` : ''}
      >
        {selectedPluginForSettings && (
          <div className={styles.editor}>
            <div className={styles.pluginMetaHeader}>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                  {selectedPluginForSettings.icon && isSvgIcon(selectedPluginForSettings.icon) && (
                    <div
                      className={styles.customSvgIcon}
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(selectedPluginForSettings.icon) }}
                    />
                  )}
                  <div style="min-width: 0;">
                    <div className={styles.metaTitle}>{selectedPluginForSettings.name}</div>
                    <div className={styles.metaSubtitle}>
                      {selectedPluginForSettings.version ? `${formatVersion(selectedPluginForSettings.version)} · ` : ''}
                      {selectedPluginForSettings.author ? `Автор: ${selectedPluginForSettings.author}` : ''}
                    </div>
                  </div>
                </div>
                <Switcher
                  label={selectedPluginForSettings.name}
                  checked={selectedPluginForSettings.enabled}
                  onCheck={() => handleToggle(selectedPluginForSettings)}
                />
              </div>
              {(selectedPluginForSettings.themeDependency || selectedPluginForSettings.requiredForTheme) && (
                <div style="margin-top: 6px;">
                  <span className={styles.themeDepBadge}>
                    <Icon name="brush" className={styles.themeBadgeIcon} />
                    <span>Требуется для работы темы: {selectedPluginForSettings.themeDependency || selectedPluginForSettings.requiredForTheme}</span>
                  </span>
                </div>
              )}
              {selectedPluginForSettings.description && (
                <div style="font-size: 0.8125rem; color: var(--color-text); margin-top: 4px;">
                  {selectedPluginForSettings.description}
                </div>
              )}
            </div>

            {selectedPluginForSettings.hasDangerousPermissions && (
              <div className={styles.warningBox}>
                <span>{getEthernetString(lang, 'EthernetPluginDangerousWarning')}</span>
              </div>
            )}

            {/* Пользовательский интерфейс настроек плагина (generic для любых плагинов) */}
            <div
              ref={customSettingsRef}
              id={`ethernet-plugin-custom-settings-${selectedPluginForSettings.id}`}
              className={styles.customSettingsContainer}
            />

            <div className={styles.permissionsSectionTitle}>
              {getEthernetString(lang, 'EthernetPluginPermissions')}
            </div>

            {(!selectedPluginForSettings.permissions || selectedPluginForSettings.permissions.length === 0) ? (
              <div className={styles.noPermissionsText}>
                {getEthernetString(lang, 'EthernetPluginNoPermissions')}
              </div>
            ) : (
              <div className={styles.list}>
                {selectedPluginForSettings.permissions.map((perm) => {
                  const isGranted = selectedPluginForSettings.grantedPermissions?.[perm] !== false;
                  const isDangerous = DANGEROUS_PERMS_SET.has(perm);
                  const titleKey = `EthernetPerm_${perm.replace('.', '_')}`;
                  const descKey = `EthernetPermDesc_${perm.replace('.', '_')}`;

                  return (
                    <ListItem
                      key={perm}
                      multiline
                      narrow
                      onClick={() => handleTogglePermission(selectedPluginForSettings.id, perm, !isGranted)}
                      rightElement={(
                        <Switcher
                          label={getEthernetString(lang, titleKey)}
                          checked={isGranted}
                          onCheck={(checked) => handleTogglePermission(selectedPluginForSettings.id, perm, checked)}
                        />
                      )}
                    >
                      <div className={styles.permTitleRow}>
                        <span className="title">{getEthernetString(lang, titleKey)}</span>
                        {isDangerous && (
                          <span className={styles.dangerousTag}>
                            {getEthernetString(lang, 'EthernetPermissionDangerous')}
                          </span>
                        )}
                      </div>
                      <span className="subtitle">{getEthernetString(lang, descKey)}</span>
                    </ListItem>
                  );
                })}
              </div>
            )}

            <div className={styles.editorButtons}>
              <Button
                color="translucent"
                onClick={() => handleExportPlugin(selectedPluginForSettings)}
              >
                Экспорт .eth
              </Button>
              <Button
                color="translucent"
                onClick={() => {
                  const id = selectedPluginForSettings.id;
                  setSelectedPluginForSettings(undefined);
                  handleOpenEditor(id);
                }}
              >
                {lang('Edit')}
              </Button>
              <Button onClick={() => setSelectedPluginForSettings(undefined)}>
                {lang('Close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Модалка проверки безопасности перед импортом */}
      <Modal
        isOpen={pendingImport !== undefined}
        onClose={() => setPendingImport(undefined)}
        className={styles.editorModalRoot}
        title={getEthernetString(lang, 'EthernetImportConfirmTitle')}
      >
        {pendingImport && (
          <div className={styles.editor}>
            <div style="font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: 8px;">
              {getEthernetString(lang, 'EthernetImportConfirmPrompt')}
            </div>

            <div className={styles.pluginMetaHeader}>
              <div className={styles.metaTitle}>
                {pendingImport.inspection.metadata.name || pendingImport.picked.name}
              </div>
              <div className={styles.metaSubtitle}>
                {pendingImport.inspection.metadata.version ? `v${pendingImport.inspection.metadata.version} · ` : ''}
                {pendingImport.inspection.metadata.author ? `Автор: ${pendingImport.inspection.metadata.author}` : ''}
              </div>
              {pendingImport.inspection.metadata.description && (
                <div style="font-size: 0.8125rem; color: var(--color-text); margin-top: 4px;">
                  {pendingImport.inspection.metadata.description}
                </div>
              )}
            </div>

            {pendingImport.inspection.hasDangerousPermissions && (
              <div className={styles.warningBox}>
                <span>{getEthernetString(lang, 'EthernetPluginDangerousWarning')}</span>
              </div>
            )}

            <div className={styles.permissionsSectionTitle}>
              {getEthernetString(lang, 'EthernetPluginPermissions')}
            </div>

            {(!pendingImport.inspection.declaredPermissions || pendingImport.inspection.declaredPermissions.length === 0) ? (
              <div className={styles.noPermissionsText}>
                {getEthernetString(lang, 'EthernetPluginNoPermissions')}
              </div>
            ) : (
              <div className={styles.list}>
                {pendingImport.inspection.declaredPermissions.map((perm: string) => {
                  const isGranted = pendingImport.grantedPermissions[perm] !== false;
                  const isDangerous = DANGEROUS_PERMS_SET.has(perm);
                  const titleKey = `EthernetPerm_${perm.replace('.', '_')}`;
                  const descKey = `EthernetPermDesc_${perm.replace('.', '_')}`;

                  return (
                    <ListItem
                      key={perm}
                      multiline
                      narrow
                      onClick={() => {
                        setPendingImport((prev) => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            grantedPermissions: {
                              ...prev.grantedPermissions,
                              [perm]: !isGranted,
                            },
                          };
                        });
                      }}
                      rightElement={(
                        <Switcher
                          label={getEthernetString(lang, titleKey)}
                          checked={isGranted}
                          onCheck={(checked) => {
                            setPendingImport((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                grantedPermissions: {
                                  ...prev.grantedPermissions,
                                  [perm]: checked,
                                },
                              };
                            });
                          }}
                        />
                      )}
                    >
                      <div className={styles.permTitleRow}>
                        <span className="title">{getEthernetString(lang, titleKey)}</span>
                        {isDangerous && (
                          <span className={styles.dangerousTag}>
                            {getEthernetString(lang, 'EthernetPermissionDangerous')}
                          </span>
                        )}
                      </div>
                      <span className="subtitle">{getEthernetString(lang, descKey)}</span>
                    </ListItem>
                  );
                })}
              </div>
            )}

            <div className={styles.editorButtons}>
              <Button color="translucent" onClick={() => setPendingImport(undefined)}>
                {lang('Cancel')}
              </Button>
              <Button onClick={handleConfirmImport}>
                {getEthernetString(lang, 'EthernetActionImport')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Оповещение о блокировке импорта (Sandbox Violation) */}
      <ConfirmDialog
        isOpen={Boolean(blockedImportMessage)}
        onClose={() => setBlockedImportMessage(undefined)}
        title={getEthernetString(lang, 'EthernetImportBlockedTitle')}
        text={blockedImportMessage || ''}
        confirmLabel={lang('OK')}
        confirmHandler={() => setBlockedImportMessage(undefined)}
        confirmIsDestructive
      />

      {/* Редактор плагина */}
      <Modal
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
        className={styles.editorModalRoot}
        title={editing?.id ? `${getEthernetString(lang, 'EthernetEditPlugin')}: ${editing.name}` : getEthernetString(lang, 'EthernetNewPlugin')}
      >
        {editing && (
          <div className={styles.editor}>
            <InputText
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.currentTarget.value })}
              placeholder={getEthernetString(lang, 'EthernetPluginName')}
            />
            <InputText
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.currentTarget.value })}
              placeholder={getEthernetString(lang, 'EthernetPluginDescription')}
            />
            <TextArea
              value={editing.code}
              onChange={(e) => setEditing({ ...editing, code: e.currentTarget.value })}
              className={styles.codeArea}
            />
            <div className={styles.editorButtons}>
              <Button onClick={() => setEditing(undefined)} color="translucent">
                {lang('Cancel')}
              </Button>
              <Button onClick={handleSave}>
                {lang('Save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deletingId)}
        onClose={() => setDeletingId(undefined)}
        text={getEthernetString(lang, 'EthernetDeletePluginConfirm')}
        confirmHandler={handleDelete}
        confirmIsDestructive
      />

      <DocumentationModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
        initialTab="plugins"
      />
    </div>
  );
};

const DEFAULT_PLUGIN_TEMPLATE = `/**
 * @name My Plugin
 * @description Custom Ethernet plugin
 * @version 1.0.0
 * @author User
 * @icon <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
 * @permissions dom.style, ui.toast, storage.local
 */

(function () {
  const { log, addStyle, storage, on } = window.ethernet;
  log('Plugin initialized with sandboxed permissions!');

  // 1. Добавление кастомных CSS-стилей (требуется dom.style)
  addStyle(\`
    /* Ваши стили */
  \`);

  // 2. Изолированное хранилище данных плагина (требуется storage.local)
  storage.set('installedAt', Date.now());

  // 3. Автоматический коллбэк выгрузки при отключении плагина
  ethernet.onDestroy(() => {
    log('Plugin cleanly unloaded!');
  });
})();
`;

export default memo(SettingsEthernetPlugins);
