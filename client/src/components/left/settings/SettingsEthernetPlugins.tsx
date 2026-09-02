import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import { getEthernetString } from '../../../util/ethernetLang';
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
  enabled: boolean;
};

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

  const loadPlugins = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    const list = api ? await api.pluginsList() : [];
    if (list) {
      const disabledSet = new Set(list.filter((p) => !p.enabled).map((p) => p.id));
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
      // Сразу убираем внедренные элементы плагинов и стили из DOM
      document.querySelectorAll('.ethernet-peer-id-dc-container, [data-ethernet-plugin], #ethernet-peer-id-dc-styles').forEach((el) => el.remove());
    }
    if (!next && api?.clearLastCrashedPlugin) {
      await api.clearLastCrashedPlugin();
      setCrashedInfo(null);
    }
    setHasPendingReload(true);
    await loadPlugins();
  });

  const handleDismissCrash = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (api?.clearLastCrashedPlugin) {
      await api.clearLastCrashedPlugin();
      setCrashedInfo(null);
    }
  });

  const handleImportFile = useLastCallback(async () => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    const picked = await api.pickFile('js');
    if (!picked) return;
    const name = picked.name.replace(/\.js$/i, '');
    const id = await api.pluginSave({
      id: name,
      name,
      description: `Imported from ${picked.name}`,
      author: 'User',
      code: picked.content,
    });
    if (typeof id === 'string') {
      await api.pluginToggle(id);
    }
    await loadPlugins();
    setHasPendingReload(true);
  });

  const handleOpenEditor = useLastCallback(async (id?: string) => {
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (id && api) {
      const data = await api.pluginRead(id);
      let manifest = { name: id, description: '', version: '0.1.0' };
      try {
        manifest = JSON.parse(data.manifest);
      } catch {}
      setEditing({
        id,
        name: manifest.name || id,
        description: manifest.description || '',
        code: data.code || '',
      });
    } else {
      setEditing({
        name: '',
        description: '',
        code: '/**\n * Ethernet Plugin\n */\n\n(function() {\n  console.log("Hello from plugin!");\n})();\n',
      });
    }
  });

  const handleSave = useLastCallback(async () => {
    if (!editing || !editing.name.trim()) return;
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    const pluginId = editing.id || editing.name.trim().toLowerCase().replace(/[^\w-]+/g, '-');
    await api.pluginSave({
      id: pluginId,
      name: editing.name.trim(),
      description: editing.description.trim(),
      code: editing.code,
    });
    // Если создали новый плагин — включим его
    if (!editing.id) {
      await api.pluginToggle(pluginId);
    }
    setEditing(undefined);
    await loadPlugins();
    setHasPendingReload(true);
  });

  const handleToggle = useLastCallback(async (plugin: PluginInfo) => {
    if (isSafeMode) return;
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (!api) return;
    await api.pluginToggle(plugin.id);
    const updated = await api.pluginsList();
    if (updated) {
      const disabledSet = new Set(updated.filter((p) => !p.enabled).map((p) => p.id));
      (window as any).__ethernetDisabledPlugins = disabledSet;
      (window as any).__hermesDisabledPlugins = disabledSet;
      if (plugin.enabled) {
        document.querySelectorAll(`[data-plugin-id="${plugin.id}"], .ethernet-peer-id-dc-container`).forEach((el) => el.remove());
      }
    }
    await loadPlugins();
    setHasPendingReload(true);
  });

  const handleDelete = useLastCallback(async () => {
    if (!deletingId) return;
    const api = window.ethernetDesktop || window.hermesDesktop;
    if (api) {
      await api.pluginDelete(deletingId);
    }
    setDeletingId(undefined);
    await loadPlugins();
    setHasPendingReload(true);
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
                  <span>⚠️ {getEthernetString(lang, 'EthernetSafeModePluginCrashed')}: {crashedInfo.id}</span>
                  <button
                    type="button"
                    style="background: none; border: none; color: inherit; cursor: pointer; padding: 0 4px;"
                    onClick={handleDismissCrash}
                  >
                    ✕
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
                    {lang.isRtl ? 'الوضع الآمن مفعّل' : 'Безопасный режим активен'}
                  </span>
                  <span className={styles.safeModeAlertDesc}>
                    {lang.isRtl ? 'تم إيقاف جميع الإضافات مؤقتاً ولن يتم تنفيذها.' : 'Все плагины временно заблокированы и не выполняются.'}
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
                  multiline
                  narrow
                  onClick={() => handleToggle(plugin)}
                  contextActions={[{
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
                    <Switcher
                      label={plugin.name}
                      checked={isSafeMode ? false : plugin.enabled}
                      inactive
                      noAnimation
                    />
                  )}
                >
                  <span className="title">{plugin.name}</span>
                  <span className="subtitle">
                    {isSafeMode ? (
                      <span style="color: var(--color-primary);">
                        {lang.isRtl ? 'معطل в الوضع الآمن' : 'Отключено в Safe Mode'}
                      </span>
                    ) : (
                      <>
                        {plugin.description || plugin.id}
                        {plugin.version && ` · v${plugin.version}`}
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
                {lang.isRtl ? 'إعادة تحميل العميل الآن؟' : 'Перезагрузить клиент сейчас?'}
              </span>
              <span className={styles.reloadSubtitle}>
                {lang.isRtl ? 'مطلوب لتطبيق تغييرات الإضافات' : 'Требуется для применения изменений'}
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
              {lang.isRtl ? 'إعادة التحميل' : 'Перезагрузить'}
            </Button>
            <Button
              size="smaller"
              color="translucent"
              className={styles.dismissBtn}
              onClick={() => setHasPendingReload(false)}
            >
              {lang.isRtl ? 'لاحقاً' : 'Позже'}
            </Button>
          </div>
        </Island>
      )}

      {/* Редактор плагина */}
      <Modal
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
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

const DEFAULT_PLUGIN_TEMPLATE = `// Hermes Plugin Template
// API: window.hermes { api, store, on, off, emit, addStyle, log }
(function () {
  const { log, addStyle, on, api, store } = window.hermes;
  log('Plugin initialized!');

  // 1. Стилизация UI
  addStyle(\`
    /* Ваши кастомные CSS правила */
  \`);

  // 2. Горячие клавиши
  on('keydown', ({ key, ctrl, shift }) => {
    if (ctrl && shift && key.toLowerCase() === 'h') {
      log('Hotkey Ctrl+Shift+H triggered');
    }
  });

  // 3. Перехват исходящих запросов к Telegram (Ghost Mode пример)
  // Блокировка отправки прочтения и статуса набора текста:
  /*
  api.beforeRequest((method, args) => {
    if (method === 'markMessageListRead' || method === 'markMessagesRead') {
      log('[Ghost] Blocked read receipts');
      return false; // Отменяем отправку на сервер
    }
    if (method === 'sendMessageAction') {
      log('[Ghost] Blocked typing indicator');
      return false;
    }
  });
  */

  // 4. Перехват входящих событий (Анти-удаление сообщений)
  /*
  api.onUpdate((update) => {
    if (update?.['@type'] === 'updateDeleteMessages') {
      log('[Anti-Recall] Intercepted message deletion:', update.messageIds);
      // return false; // Предотвратить удаление из локального состояния
    }
  });
  */
})();
`;

export default memo(SettingsEthernetPlugins);
