import type { FC } from '../../../lib/teact/teact';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from '../../../lib/teact/teact';

import buildClassName from '../../../util/buildClassName';
import { getEthernetString } from '../../../util/ethernetLang';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';

import Island from '../../gili/layout/Island';
import Icon from '../../common/icons/Icon';
import Switcher from '../../ui/Switcher';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';

import styles from './SettingsEthernetNetwork.module.scss';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

export type ProxyConfig = {
  id: string;
  name: string;
  protocol: 'socks5' | 'http';
  server: string;
  port: number;
  auth?: {
    username?: string;
    password?: string;
  };
  rawLink?: string;
  ping?: number;
};

type ProxyState = {
  enabled: boolean;
  activeProxyId: string | null;
  proxies: ProxyConfig[];
};

const SettingsEthernetNetwork: FC<OwnProps> = ({ isActive, onReset }) => {
  const lang = useLang();

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  const ethernet = (window as any).ethernetDesktop;

  // Custom Proxy State
  const [proxyState, setProxyState] = useState<ProxyState>({
    enabled: false,
    activeProxyId: null,
    proxies: [],
  });

  const [pings, setPings] = useState<Record<string, number>>({});
  const [testingPingId, setTestingPingId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProxyId, setEditingProxyId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'link' | 'manual'>('link');

  // Form Fields
  const [linkInput, setLinkInput] = useState('');
  const [formName, setFormName] = useState('');
  const [formProtocol, setFormProtocol] = useState<'socks5' | 'http'>('socks5');
  const [formServer, setFormServer] = useState('');
  const [formPort, setFormPort] = useState(1080);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');

  // Load States
  const loadState = useCallback(async () => {
    if (!hermes) return;
    try {
      if (ethernet.proxyGetState) {
        const state = await ethernet.proxyGetState();
        if (state) {
          setProxyState({
            enabled: Boolean(state.enabled),
            activeProxyId: state.activeProxyId || null,
            proxies: Array.isArray(state.proxies) ? state.proxies : [],
          });
        }
      }
    } catch (e) {
      console.error('[Network] Failed to load state', e);
    }
  }, [ethernet]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Custom Proxy Handlers
  const handleToggleProxyMaster = useCallback(async (newVal?: boolean) => {
    if (!ethernet?.proxyToggle) return;
    const targetVal = typeof newVal === 'boolean' ? newVal : !proxyState.enabled;
    const newState = await ethernet.proxyToggle(targetVal);
    if (newState) {
      setProxyState({
        enabled: Boolean(newState.enabled),
        activeProxyId: newState.activeProxyId || null,
        proxies: Array.isArray(newState.proxies) ? newState.proxies : [],
      });
      window.dispatchEvent(new CustomEvent('ethernet-network-changed'));
    }
  }, [ethernet, proxyState.enabled]);

  const handleSetActiveProxy = async (id: string) => {
    if (!ethernet?.proxySetActive) return;
    const newState = await ethernet.proxySetActive(id);
    if (newState) {
      setProxyState({
        enabled: Boolean(newState.enabled),
        activeProxyId: newState.activeProxyId || null,
        proxies: Array.isArray(newState.proxies) ? newState.proxies : [],
      });
      window.dispatchEvent(new CustomEvent('ethernet-network-changed'));
    }
  };

  const handleDeleteProxy = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!ethernet?.proxyDelete) return;
    const newState = await ethernet.proxyDelete(id);
    if (newState) {
      setProxyState({
        enabled: Boolean(newState.enabled),
        activeProxyId: newState.activeProxyId || null,
        proxies: Array.isArray(newState.proxies) ? newState.proxies : [],
      });
      window.dispatchEvent(new CustomEvent('ethernet-network-changed'));
    }
  };

  const handleTestProxyPing = async (e: React.MouseEvent, proxy: ProxyConfig) => {
    e.stopPropagation();
    if (!ethernet?.proxyTestPing) return;
    setTestingPingId(proxy.id);
    try {
      const ms = await ethernet.proxyTestPing(proxy);
      setPings((prev) => ({ ...prev, [proxy.id]: ms }));
    } catch {
      setPings((prev) => ({ ...prev, [proxy.id]: -1 }));
    } finally {
      setTestingPingId(null);
    }
  };

  const handleOpenAddModal = () => {
    setEditingProxyId(null);
    setModalTab('link');
    setLinkInput('');
    setFormName('');
    setFormProtocol('socks5');
    setFormServer('');
    setFormPort(1080);
    setFormUsername('');
    setFormPassword('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (e: React.MouseEvent, proxy: ProxyConfig) => {
    e.stopPropagation();
    setEditingProxyId(proxy.id);
    setModalTab('manual');
    setLinkInput(proxy.rawLink || '');
    setFormName(proxy.name || '');
    setFormProtocol(proxy.protocol === 'http' ? 'http' : 'socks5');
    setFormServer(proxy.server || '');
    setFormPort(proxy.port || (proxy.protocol === 'http' ? 8080 : 1080));
    setFormUsername(proxy.auth?.username || '');
    setFormPassword(proxy.auth?.password || '');
    setIsModalOpen(true);
  };

  const handleProtocolChange = (protocol: 'socks5' | 'http') => {
    setFormProtocol(protocol);
    if (protocol === 'http' && formPort === 1080) {
      setFormPort(8080);
    } else if (protocol === 'socks5' && formPort === 8080) {
      setFormPort(1080);
    }
  };

  const handleSaveModal = async () => {
    if (!ethernet?.proxySave) return;

    let configToSave: ProxyConfig | null = null;

    if (modalTab === 'link') {
      if (!linkInput.trim()) return;
      if (ethernet.proxyParseLink) {
        const parsed = await ethernet.proxyParseLink(linkInput.trim());
        if (parsed) {
          configToSave = {
            ...parsed,
            id: editingProxyId || parsed.id || Date.now().toString(36),
          };
        } else {
          alert('Неверный формат ссылки прокси. Поддерживаются ссылки socks5://, http://, tg://socks?...');
          return;
        }
      }
    } else {
      if (!formServer.trim()) return;
      configToSave = {
        id: editingProxyId || Date.now().toString(36),
        name: formName.trim() || `${formProtocol.toUpperCase()} ${formServer.trim()}:${formPort}`,
        protocol: formProtocol,
        server: formServer.trim(),
        port: Number(formPort) || (formProtocol === 'http' ? 8080 : 1080),
        auth: (formUsername.trim() || formPassword.trim()) ? {
          username: formUsername.trim() || undefined,
          password: formPassword.trim() || undefined,
        } : undefined,
      };
    }

    if (configToSave) {
      const newState = await ethernet.proxySave(configToSave);
      if (newState) {
        setProxyState({
          enabled: Boolean(newState.enabled),
          activeProxyId: newState.activeProxyId || null,
          proxies: Array.isArray(newState.proxies) ? newState.proxies : [],
        });
        window.dispatchEvent(new CustomEvent('ethernet-network-changed'));
      }
      setIsModalOpen(false);
    }
  };

  const activeProxy = useMemo(() => {
    return proxyState.proxies.find((p) => p.id === proxyState.activeProxyId) || null;
  }, [proxyState.proxies, proxyState.activeProxyId]);

  return (
    <div className="settings-content custom-scroll">
      {/* 1. РАЗДЕЛ «ПОЛЬЗОВАТЕЛЬСКИЙ ПРОКСИ» */}
      <Island className={styles.sectionIsland}>
        <div className={styles.row} onClick={() => handleToggleProxyMaster(!proxyState.enabled)}>
          <div className={styles.titleGroup}>
            <span className={styles.titleText}>{getEthernetString(lang, 'ProxyUseInApp')}</span>
            <span className={styles.descText}>{getEthernetString(lang, 'ProxyUseInAppDesc')}</span>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <Switcher
              id="proxy-master-switch"
              label={getEthernetString(lang, 'ProxyUseInApp')}
              checked={proxyState.enabled}
              onCheck={(val) => handleToggleProxyMaster(val)}
            />
          </div>
        </div>
      </Island>

      {/* STATUS & PROXIES LIST */}
      <Island className={styles.sectionIsland}>
        <div className={buildClassName(styles.row, styles.rowDisabled)}>
          <div className={styles.titleGroup}>
            <span className={styles.titleText}>{getEthernetString(lang, 'ProxySettings')}</span>
            <span className={styles.descText}>
              {proxyState.enabled && activeProxy
                ? `${activeProxy.name} (${activeProxy.server}:${activeProxy.port})`
                : getEthernetString(lang, 'ProxyDirect')}
            </span>
          </div>
        </div>

        {proxyState.proxies.length === 0 ? (
          <div className={styles.emptyHint}>
            {getEthernetString(lang, 'ProxyListEmpty')}
          </div>
        ) : (
          <div className={styles.proxyList}>
            {proxyState.proxies.map((p) => {
              const isActiveItem = p.id === proxyState.activeProxyId;
              const ping = pings[p.id] !== undefined ? pings[p.id] : p.ping;
              const isTesting = testingPingId === p.id;

              return (
                <div
                  key={p.id}
                  className={buildClassName(styles.proxyItem, isActiveItem && styles.active)}
                  onClick={() => handleSetActiveProxy(p.id)}
                >
                  <div className={styles.proxyInfo}>
                    <span className={styles.proxyProtocolBadge}>{p.protocol.toUpperCase()}</span>
                    <div className={styles.proxyDetails}>
                      <span className={styles.proxyName}>{p.name}</span>
                      <span className={styles.proxyServer}>{p.server}:{p.port}</span>
                    </div>
                  </div>

                  <div className={styles.proxyActions}>
                    {ping !== undefined && (
                      <span
                        className={buildClassName(
                          styles.pingBadge,
                          ping > 0 && ping < 150 && styles.fast,
                          ping >= 150 && ping < 350 && styles.medium,
                          (ping >= 350 || ping === -1) && styles.slow,
                        )}
                      >
                        {ping === -1 ? 'Timeout' : `${ping}ms`}
                      </span>
                    )}

                    <button
                      type="button"
                      className={styles.iconBtn}
                      title={getEthernetString(lang, 'ProxyTestPing')}
                      onClick={(e) => handleTestProxyPing(e, p)}
                    >
                      <Icon name={isTesting ? 'stop' : 'play'} />
                    </button>

                    <button
                      type="button"
                      className={styles.iconBtn}
                      title={getEthernetString(lang, 'ProxyEdit')}
                      onClick={(e) => handleOpenEditModal(e, p)}
                    >
                      <Icon name="edit" />
                    </button>

                    <button
                      type="button"
                      className={buildClassName(styles.iconBtn, styles.deleteBtn)}
                      title={getEthernetString(lang, 'ProxyDelete')}
                      onClick={(e) => handleDeleteProxy(e, p.id)}
                    >
                      <Icon name="delete" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className={styles.addProxyBtn}
          onClick={handleOpenAddModal}
        >
          <Icon name="add" />
          <span>{getEthernetString(lang, 'ProxyAdd')}</span>
        </button>
      </Island>

      {/* ADD / EDIT PROXY MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProxyId ? getEthernetString(lang, 'ProxyEdit') : getEthernetString(lang, 'ProxyAdd')}
      >
        <div className={styles.modalTabs}>
          <button
            type="button"
            className={buildClassName(styles.modalTab, modalTab === 'link' && styles.active)}
            onClick={() => setModalTab('link')}
          >
            {getEthernetString(lang, 'ProxyImportLink')}
          </button>
          <button
            type="button"
            className={buildClassName(styles.modalTab, modalTab === 'manual' && styles.active)}
            onClick={() => setModalTab('manual')}
          >
            {getEthernetString(lang, 'ProxyManual')}
          </button>
        </div>

        {modalTab === 'link' && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{getEthernetString(lang, 'ProxyImportLink')}</label>
            <textarea
              className={styles.formTextarea}
              placeholder={getEthernetString(lang, 'ProxyLinkPlaceholder')}
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
            />
          </div>
        )}

        {modalTab === 'manual' && (
          <div className={styles.formGroup}>
            <div className={styles.formRow}>
              <div>
                <label className={styles.formLabel}>{getEthernetString(lang, 'ProxyProtocol')}</label>
                <select
                  className={styles.formSelect}
                  value={formProtocol}
                  onChange={(e) => handleProtocolChange(e.target.value as 'socks5' | 'http')}
                >
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP</option>
                </select>
              </div>

              <div>
                <label className={styles.formLabel}>{getEthernetString(lang, 'ProxyName')}</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder={getEthernetString(lang, 'ProxyOptional')}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div>
                <label className={styles.formLabel}>{getEthernetString(lang, 'ProxyServer')}</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="1.2.3.4 or example.com"
                  value={formServer}
                  onChange={(e) => setFormServer(e.target.value)}
                />
              </div>

              <div>
                <label className={styles.formLabel}>{getEthernetString(lang, 'ProxyPort')}</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={formPort}
                  onChange={(e) => setFormPort(Number(e.target.value))}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div>
                <label className={styles.formLabel}>{getEthernetString(lang, 'ProxyUsername')}</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder={getEthernetString(lang, 'ProxyOptional')}
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                />
              </div>

              <div>
                <label className={styles.formLabel}>{getEthernetString(lang, 'ProxyPassword')}</label>
                <input
                  type="password"
                  className={styles.formInput}
                  placeholder={getEthernetString(lang, 'ProxyOptional')}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className={styles.modalActions}>
          <Button onClick={() => setIsModalOpen(false)} color="translucent">
            {lang('Cancel')}
          </Button>
          <Button onClick={handleSaveModal}>
            {getEthernetString(lang, 'EthernetActionSave')}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default memo(SettingsEthernetNetwork);
