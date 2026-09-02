import type { FC } from '../../../lib/teact/teact';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from '../../../lib/teact/teact';
import { getGlobal, setGlobal } from '../../../global';

import buildClassName from '../../../util/buildClassName';
import { getEthernetString } from '../../../util/ethernetLang';
import {
  type GhostSettings,
  type GhostStorage,
  type SendWithoutSoundOption,
  getGhostStorage,
  saveGhostStorage,
  subscribeGhostStorage,
} from '../../../util/ghostMode';
import { getAccountsInfo } from '../../../util/multiaccount';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';

import sparksWithoutBackdrop from '../../../assets/sparks-without-backdrop.svg';
import Island, { IslandTitle } from '../../gili/layout/Island';
import Icon from '../../common/icons/Icon';
import Checkbox from '../../ui/Checkbox';
import Switcher from '../../ui/Switcher';

import styles from './SettingsEthernetFunctions.module.scss';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type AccountItemData = {
  id: string;
  name: string;
  avatarUri?: string;
  isGlobal?: boolean;
};

const SOUND_OPTIONS: { value: SendWithoutSoundOption; langKey: string }[] = [
  { value: 'never', langKey: 'SoundNever' },
  { value: 'always', langKey: 'SoundAlways' },
  { value: 'groups_only', langKey: 'SoundGroupsOnly' },
];

const SettingsEthernetFunctions: FC<OwnProps> = ({ isActive, onReset }) => {
  const lang = useLang();

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  const [ghostStorage, setGhostStorageState] = useState<GhostStorage>(() => getGhostStorage());
  const [selectedAccountId, setSelectedAccountId] = useState<string>('global');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isSoundDropdownOpen, setIsSoundDropdownOpen] = useState<boolean>(false);

  useEffect(() => {
    return subscribeGhostStorage((storage) => {
      setGhostStorageState({ ...storage });
    });
  }, []);

  // Accounts list
  const accountList = useMemo<AccountItemData[]>(() => {
    const list: AccountItemData[] = [
      {
        id: 'global',
        name: getEthernetString(lang, 'GhostGlobalSettings'),
        isGlobal: true,
      },
    ];

    const accountsMap = getAccountsInfo();
    const globalState = getGlobal();
    const seenIds = new Set<string>();

    Object.values(accountsMap).forEach((acc) => {
      if (acc.userId && !seenIds.has(acc.userId)) {
        seenIds.add(acc.userId);
        const name = [acc.firstName, acc.lastName].filter(Boolean).join(' ') || acc.phone || `Account ${acc.userId}`;
        list.push({
          id: acc.userId,
          name,
          avatarUri: acc.avatarUri,
        });
      }
    });

    if (globalState.currentUserId && !seenIds.has(globalState.currentUserId)) {
      const currentUser = globalState.users?.byId?.[globalState.currentUserId];
      const name = currentUser
        ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.phoneNumber || 'Current Account'
        : 'Current Account';
      list.push({
        id: globalState.currentUserId,
        name,
      });
    }

    return list;
  }, [lang]);

  const selectedAccount = useMemo(() => {
    return accountList.find((a) => a.id === selectedAccountId) || accountList[0];
  }, [accountList, selectedAccountId]);

  const activeSettings = useMemo<GhostSettings>(() => {
    if (selectedAccountId === 'global') {
      return ghostStorage.global;
    }
    return ghostStorage.accounts[selectedAccountId] || { ...ghostStorage.global };
  }, [ghostStorage, selectedAccountId]);

  const updateSetting = useCallback((key: keyof GhostSettings, value: any) => {
    const nextSettings: GhostSettings = {
      ...activeSettings,
      [key]: value,
    };

    if (selectedAccountId === 'global') {
      saveGhostStorage({
        ...ghostStorage,
        global: nextSettings,
      });
    } else {
      saveGhostStorage({
        ...ghostStorage,
        accounts: {
          ...ghostStorage.accounts,
          [selectedAccountId]: nextSettings,
        },
      });
    }

    if (key === 'disableAds') {
      const global = getGlobal();
      setGlobal({
        ...global,
        messages: {
          ...global.messages,
          sponsoredByChatId: {},
        },
      });
    }
  }, [activeSettings, ghostStorage, selectedAccountId]);

  const toggleMaster = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateSetting('enabled', !activeSettings.enabled);
  }, [activeSettings.enabled, updateSetting]);

  const activeCount = useMemo(() => {
    return [
      activeSettings.dontReadMessages,
      activeSettings.dontReadStories,
      activeSettings.dontSendOnline,
      activeSettings.dontSendTyping,
      activeSettings.autoOffline,
    ].filter(Boolean).length;
  }, [activeSettings]);

  const handleSelectAccount = (id: string) => {
    setSelectedAccountId(id);
    setIsDropdownOpen(false);
  };

  const currentSoundOptionLabel = useMemo(() => {
    const opt = SOUND_OPTIONS.find((s) => s.value === activeSettings.sendWithoutSound) || SOUND_OPTIONS[0];
    return getEthernetString(lang, opt.langKey);
  }, [activeSettings.sendWithoutSound, lang]);

  return (
    <div className="settings-content custom-scroll">
      {/* 1. DISABLE ADS & NOTIFICATIONS AT THE VERY TOP */}
      <Island className={styles.sectionIsland}>
        <div
          className={styles.row}
          onClick={() => updateSetting('disableAds', !activeSettings.disableAds)}
        >
          <span className={styles.titleText}>{getEthernetString(lang, 'EthernetDisableAds')}</span>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="disable-ads-switch"
              checked={activeSettings.disableAds}
              onChange={() => {}}
            />
          </div>
        </div>

        <div
          className={styles.row}
          onClick={() => updateSetting('disableAllNotifications', !activeSettings.disableAllNotifications)}
        >
          <span className={styles.titleText}>{getEthernetString(lang, 'EthernetDisableAllNotifications')}</span>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="disable-all-notifications-switch"
              checked={Boolean(activeSettings.disableAllNotifications)}
              onChange={() => {}}
            />
          </div>
        </div>

        <div
          className={styles.row}
          onClick={() => updateSetting('disableCloseToTray', !activeSettings.disableCloseToTray)}
        >
          <span className={styles.titleText}>{getEthernetString(lang, 'EthernetDisableCloseToTray')}</span>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="disable-close-to-tray-switch"
              checked={Boolean(activeSettings.disableCloseToTray)}
              onChange={() => {}}
            />
          </div>
        </div>
      </Island>

      {/* 2. GHOST ESSENTIALS CARD */}
      <Island className={styles.sectionIsland}>
        {/* Top Header Row: Ghost Mode Title & Accordion on Left, Global Selector & Master Switch on Right */}
        <div className={styles.row}>
          <div
            className={styles.titleGroup}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <span className={styles.titleText}>{getEthernetString(lang, 'GhostMode')}</span>
            <span className={styles.counterBadge}>{activeCount}/5</span>
            <Icon
              name="down"
              className={buildClassName(styles.chevron, isExpanded && styles.open)}
            />
          </div>

          <div className={styles.headerRight}>
            <div className={styles.dropdownWrapper}>
              <button
                type="button"
                className={styles.dropdownTriggerBtn}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <span>{selectedAccount.name}</span>
                <Icon
                  name="down"
                  className={buildClassName(styles.chevron, isDropdownOpen && styles.open)}
                />
              </button>

              {isDropdownOpen && (
                <>
                  <div
                    className={styles.dropdownBackdrop}
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className={styles.menuDropdown}>
                    {accountList.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        className={buildClassName(styles.accountItem, acc.id === selectedAccountId && styles.active)}
                        onClick={() => handleSelectAccount(acc.id)}
                      >
                        <div className={buildClassName(styles.accountIcon, acc.isGlobal && styles.globalIcon)}>
                          {acc.isGlobal ? (
                            <img src={sparksWithoutBackdrop} alt="" className={styles.sparksIcon} draggable={false} />
                          ) : acc.avatarUri ? (
                            <img src={acc.avatarUri} alt="" />
                          ) : (
                            <span>{acc.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <span className={styles.accountName}>{acc.name}</span>
                        {acc.id === selectedAccountId && <span className={styles.checkMark}>✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className={styles.switcherWrapper} onClick={toggleMaster}>
              <Switcher
                id="ghost-master-switch"
                checked={activeSettings.enabled}
                onChange={() => {}}
              />
            </div>
          </div>
        </div>

        {/* Collapsible Sub-Options */}
        {isExpanded && (
          <div className={styles.subOptionsContainer}>
            <div
              className={styles.checkboxRow}
              onClick={() => updateSetting('dontReadMessages', !activeSettings.dontReadMessages)}
            >
              <Checkbox
                checked={activeSettings.dontReadMessages}
                label={getEthernetString(lang, 'GhostDontReadMessages')}
                onChange={() => {}}
              />
            </div>

            <div
              className={styles.checkboxRow}
              onClick={() => updateSetting('dontReadStories', !activeSettings.dontReadStories)}
            >
              <Checkbox
                checked={activeSettings.dontReadStories}
                label={getEthernetString(lang, 'GhostDontReadStories')}
                onChange={() => {}}
              />
            </div>

            <div
              className={styles.checkboxRow}
              onClick={() => updateSetting('dontSendOnline', !activeSettings.dontSendOnline)}
            >
              <Checkbox
                checked={activeSettings.dontSendOnline}
                label={getEthernetString(lang, 'GhostDontSendOnline')}
                onChange={() => {}}
              />
            </div>

            <div
              className={styles.checkboxRow}
              onClick={() => updateSetting('dontSendTyping', !activeSettings.dontSendTyping)}
            >
              <Checkbox
                checked={activeSettings.dontSendTyping}
                label={getEthernetString(lang, 'GhostDontSendTyping')}
                onChange={() => {}}
              />
            </div>

            <div
              className={styles.checkboxRow}
              onClick={() => updateSetting('autoOffline', !activeSettings.autoOffline)}
            >
              <Checkbox
                checked={activeSettings.autoOffline}
                label={getEthernetString(lang, 'GhostGoOfflineAuto')}
                onChange={() => {}}
              />
            </div>
          </div>
        )}

        {/* Read on Interact */}
        <div
          className={styles.row}
          onClick={() => updateSetting('readOnInteract', !activeSettings.readOnInteract)}
        >
          <span className={styles.titleText}>{getEthernetString(lang, 'GhostReadOnInteract')}</span>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="read-on-interact-switch"
              checked={activeSettings.readOnInteract}
              onChange={() => {}}
            />
          </div>
        </div>
      </Island>

      {/* 3. SCHEDULE & SOUND CARD */}
      <Island className={styles.sectionIsland}>
        <div
          className={styles.row}
          onClick={() => updateSetting('scheduleMessages', !activeSettings.scheduleMessages)}
        >
          <span className={styles.titleText}>{getEthernetString(lang, 'GhostScheduleMessages')}</span>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="schedule-messages-switch"
              checked={activeSettings.scheduleMessages}
              onChange={() => {}}
            />
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.titleText}>{getEthernetString(lang, 'GhostSendWithoutSound')}</span>

          <div className={styles.dropdownWrapper}>
            <button
              type="button"
              className={styles.valueSelectorBtn}
              onClick={() => setIsSoundDropdownOpen(!isSoundDropdownOpen)}
            >
              <span>{currentSoundOptionLabel}</span>
              <Icon
                name="down"
                className={buildClassName(styles.chevron, isSoundDropdownOpen && styles.open)}
              />
            </button>

            {isSoundDropdownOpen && (
              <>
                <div
                  className={styles.dropdownBackdrop}
                  onClick={() => setIsSoundDropdownOpen(false)}
                />
                <div className={styles.menuDropdown}>
                  {SOUND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={buildClassName(
                        styles.accountItem,
                        activeSettings.sendWithoutSound === opt.value && styles.active,
                      )}
                      onClick={() => {
                        updateSetting('sendWithoutSound', opt.value);
                        setIsSoundDropdownOpen(false);
                      }}
                    >
                      <span className={styles.accountName}>{getEthernetString(lang, opt.langKey)}</span>
                      {activeSettings.sendWithoutSound === opt.value && <span className={styles.checkMark}>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Island>

      {/* 4. SPY ESSENTIALS CARD (including Save in Bot Dialogs) */}
      <IslandTitle className={styles.islandHeaderTitle}>
        {getEthernetString(lang, 'SpyEssentials')}
      </IslandTitle>
      <Island className={styles.sectionIsland}>
        <div
          className={styles.row}
          onClick={() => updateSetting('saveDeletedMessages', !activeSettings.saveDeletedMessages)}
        >
          <span className={styles.titleText}>{getEthernetString(lang, 'SpySaveDeletedMessages')}</span>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="save-deleted-messages-switch"
              checked={activeSettings.saveDeletedMessages}
              onChange={() => {}}
            />
          </div>
        </div>

        <div
          className={styles.row}
          onClick={() => updateSetting('saveEditsHistory', !activeSettings.saveEditsHistory)}
        >
          <span className={styles.titleText}>{getEthernetString(lang, 'SpySaveEditsHistory')}</span>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="save-edits-history-switch"
              checked={activeSettings.saveEditsHistory}
              onChange={() => {}}
            />
          </div>
        </div>

        <div
          className={styles.row}
          onClick={() => updateSetting('saveInBotDialogs', !activeSettings.saveInBotDialogs)}
        >
          <span className={styles.titleText}>{getEthernetString(lang, 'SpySaveInBotDialogs')}</span>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="save-in-bot-dialogs-switch"
              checked={activeSettings.saveInBotDialogs}
              onChange={() => {}}
            />
          </div>
        </div>
      </Island>

      {/* 5. OPTIMIZATION & PERFORMANCE CARD */}
      <IslandTitle className={styles.islandHeaderTitle}>
        {getEthernetString(lang, 'EthernetOptimization')}
      </IslandTitle>
      <Island className={styles.sectionIsland}>
        <div
          className={styles.row}
          onClick={() => updateSetting('disableNftGifts', !activeSettings.disableNftGifts)}
        >
          <div className={styles.titleWithSubtitle}>
            <span className={styles.titleText}>{getEthernetString(lang, 'EthernetDisableNftGifts')}</span>
            <span className={styles.subtitleText}>{getEthernetString(lang, 'EthernetDisableNftGiftsDesc')}</span>
          </div>
          <div className={styles.switcherWrapper}>
            <Switcher
              id="disable-nft-gifts-switch"
              checked={Boolean(activeSettings.disableNftGifts)}
              onChange={() => {}}
            />
          </div>
        </div>
      </Island>
    </div>
  );
};

export default memo(SettingsEthernetFunctions);
