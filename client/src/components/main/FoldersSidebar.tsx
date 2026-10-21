import type { TeactNode } from '@teact';
import {
  memo, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from '@teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChatFolder, ApiChatlistExportedInvite } from '../../api/types';
import { LeftColumnContent, SettingsScreens } from '../../types';

import { requestMeasure, requestMutation } from '../../lib/fasterdom/fasterdom';
import { selectTabState } from '../../global/selectors';
import { selectCurrentLimit } from '../../global/selectors/limits';
import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { IS_MAC_OS } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';

import useFolderTabs from '../../hooks/useFolderTabs';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useResizeObserver from '../../hooks/useResizeObserver';
import useScrolledState from '../../hooks/useScrolledState';

import MainMenuDropdown from '../common/MainMenuDropdown';
import Button from '../ui/Button';
import Folder from '../ui/Folder';
import Portal from '../ui/Portal';

import styles from './FoldersSidebar.module.scss';

type StateProps = {
  chatFoldersById: Record<number, ApiChatFolder>;
  folderInvitesById: Record<number, ApiChatlistExportedInvite[]>;
  orderedFolderIds?: number[];
  activeChatFolder: number;
  maxFolders: number;
  maxChatLists: number;
  maxFolderInvites: number;
};

type OwnProps = {
  isActive: boolean;
};

const FIRST_FOLDER_INDEX = 0;

const FoldersSidebar = ({
  chatFoldersById,
  orderedFolderIds,
  activeChatFolder,
  maxFolders,
  maxChatLists,
  folderInvitesById,
  maxFolderInvites,
  isActive,
}: OwnProps & StateProps) => {
  const {
    loadChatFolders,
    setActiveChatFolder,
    openLeftColumnContent,
    openSettingsScreen,
  } = getActions();

  const tabsRef = useRef<HTMLDivElement>();
  const pillRef = useRef<HTMLDivElement>();

  useEffect(() => {
    loadChatFolders();
  }, []);

  const scrollChatListToTop = useLastCallback(() => {
    const activeList = document.querySelector<HTMLElement>('#LeftColumn .chat-list.Transition_slide-active');
    activeList?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  });

  const { folderTabs } = useFolderTabs({
    sidebarMode: true,
    orderedFolderIds,
    chatFoldersById,
    maxFolders,
    maxChatLists,
    folderInvitesById,
    maxFolderInvites,
  });

  const {
    handleScroll,
    isAtBeginning,
    isAtEnd,
    updateScrollState,
  } = useScrolledState();

  const handleResize = useLastCallback(() => {
    updateScrollState(tabsRef.current);
  });

  useResizeObserver(tabsRef, handleResize);

  const lang = useLang();

  const [hoveredFolder, setHoveredFolder] = useState<{
    title: TeactNode;
    badgeCount?: number;
    isBadgeActive?: boolean;
    top: number;
    left: number;
  } | undefined>();

  const handleFolderMouseEnter = useLastCallback((
    title: TeactNode,
    badgeCount?: number,
    isBadgeActive?: boolean,
  ) => (element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    setHoveredFolder({
      title,
      badgeCount,
      isBadgeActive,
      top: Math.round(rect.top + rect.height / 2),
      left: Math.round(rect.right + 10),
    });
  });

  const handleFolderMouseLeave = useLastCallback(() => {
    setHoveredFolder(undefined);
  });

  useLayoutEffect(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl) return;

    requestMeasure(() => {
      const activeEl = tabsEl.children[activeChatFolder] as HTMLElement | undefined;
      if (!activeEl || activeEl === pillRef.current) return;

      const iconWrapper = (activeEl.querySelector<HTMLElement>('[class*="iconWrapper"]')
        || activeEl.firstElementChild) as HTMLElement | undefined;
      const top = iconWrapper
        ? activeEl.offsetTop + iconWrapper.offsetTop
        : activeEl.offsetTop + (activeEl.offsetHeight - (pillRef.current?.offsetHeight || 44)) / 2;

      requestMutation(() => {
        tabsEl.style.setProperty('--pill-offset', `${top}px`);
      });
    });
  }, [activeChatFolder, folderTabs]);

  const handleSwitchTab = useLastCallback((index: number) => {
    setHoveredFolder(undefined);
    openLeftColumnContent({ contentKey: LeftColumnContent.ChatList });
    openSettingsScreen({ screen: undefined });
    setActiveChatFolder({ activeChatFolder: index }, { forceOnHeavyAnimation: true });
    if (activeChatFolder === index) {
      scrollChatListToTop();
    }

    tabsRef.current?.children[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const handleTabsScroll = useLastCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (hoveredFolder) {
      setHoveredFolder(undefined);
    }
    handleScroll(e);
  });

  const handleSettingsClick = useLastCallback(() => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Settings });
    openSettingsScreen({ screen: SettingsScreens.Folders });
  });

  // Prevent `activeTab` pointing at non-existing folder after update
  useEffect(() => {
    if (!folderTabs?.length) {
      return;
    }

    if (activeChatFolder >= folderTabs.length) {
      setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX });
    }
  }, [activeChatFolder, folderTabs, setActiveChatFolder]);

  const MainButton = useMemo(() => {
    return ({ onTrigger, isOpen }: { onTrigger: () => void; isOpen?: boolean }) => (
      <Button
        color="translucent"
        className={buildClassName(isOpen ? 'active' : '', styles.menuButton)}
        onClick={onTrigger}
        ariaLabel={lang('AriaLabelOpenMenu')}
        iconName="menu"
        iconClassName={styles.icon}
      />
    );
  }, [lang]);

  if (!isActive) {
    return undefined;
  }

  return (
    <div
      className={styles.root}
      id="FoldersSidebar"
    >
      <MainMenuDropdown
        trigger={MainButton}
        className={buildClassName(IS_TAURI && IS_MAC_OS && styles.hideMenuButton)}
      />
      {!isAtBeginning && <div className={styles.divider} />}
      <div
        ref={tabsRef}
        className={buildClassName(styles.tabs, 'custom-scroll', 'no-scrollbar')}
        onScroll={handleTabsScroll}
      >
        {folderTabs?.map((tab, i) => (
          <Folder
            key={tab.id}
            title={tab.title}
            isActive={i === activeChatFolder}
            isBlocked={tab.isBlocked}
            badgeCount={tab.badgeCount}
            isBadgeActive={tab.isBadgeActive}
            onClick={handleSwitchTab}
            clickArg={i}
            onMouseEnter={handleFolderMouseEnter(tab.title, tab.badgeCount, tab.isBadgeActive)}
            onMouseLeave={handleFolderMouseLeave}
            contextActions={tab.contextActions}
            contextRootElementSelector="#FoldersSidebar"
            icon={tab.emoticon}
            className={styles.tab}
          />
        ))}
        <div ref={pillRef} className={styles.pill} />
      </div>
      {!isAtEnd && <div className={styles.divider} />}
      <Button
        color="translucent"
        className={buildClassName(styles.menuButton, styles.settingsButton)}
        onClick={handleSettingsClick}
        iconName="tools"
        iconClassName={styles.icon}
      />

      {hoveredFolder && (
        <Portal>
          <div
            className={styles.folderTooltip}
            style={`top: ${hoveredFolder.top}px; left: ${hoveredFolder.left}px;`}
          >
            <span>{hoveredFolder.title}</span>
            {Boolean(hoveredFolder.badgeCount) && (
              <span className={buildClassName(styles.tooltipBadge, hoveredFolder.isBadgeActive && styles.badgeActive)}>
                {hoveredFolder.badgeCount}
              </span>
            )}
          </div>
        </Portal>
      )}
    </div>
  );
};

export default memo(withGlobal(
  (global): StateProps => {
    const {
      chatFolders: {
        byId: chatFoldersById,
        orderedIds: orderedFolderIds,
        invites: folderInvitesById,
      },
    } = global;
    const { activeChatFolder } = selectTabState(global);

    return {
      chatFoldersById,
      folderInvitesById,
      orderedFolderIds,
      activeChatFolder,
      maxFolders: selectCurrentLimit(global, 'dialogFilters'),
      maxFolderInvites: selectCurrentLimit(global, 'chatlistInvites'),
      maxChatLists: selectCurrentLimit(global, 'chatlistJoined'),
    };
  },
)(FoldersSidebar));
