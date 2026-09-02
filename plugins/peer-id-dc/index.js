/**
 * Plugin: Peer ID & DC Viewer
 * Отображает Telegram ID и Data Center (DC) в профиле пользователя, бота или канала.
 */

(function () {
  const PLUGIN_ID = 'peer-id-dc';
  const DC_LOCATIONS = {
    1: 'Miami (US)',
    2: 'Amsterdam (NL)',
    3: 'Miami (US)',
    4: 'Amsterdam (NL)',
    5: 'Singapore (SG)',
  };

  const STYLE_ID = 'ethernet-peer-id-dc-styles';
  const CSS = `
    .ethernet-peer-id-dc-container {
      display: contents;
    }
    .ethernet-peer-id-dc-item {
      cursor: pointer !important;
      user-select: none;
    }
  `;

  function ensureStyles() {
    if (!document.getElementById(STYLE_ID)) {
      if (window.ethernet?.addStyle) {
        window.ethernet.addStyle(CSS, STYLE_ID);
      } else {
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        document.head.appendChild(s);
      }
    }
  }

  function isPluginActive() {
    if (window.__ethernetSafeMode || window.__hermesSafeMode) {
      return false;
    }
    const disabled = window.__ethernetDisabledPlugins || window.__hermesDisabledPlugins;
    if (disabled && (disabled.has ? disabled.has(PLUGIN_ID) : disabled.includes(PLUGIN_ID))) {
      return false;
    }
    return true;
  }

  function getGlobalState() {
    return (window.ethernet && window.ethernet.store)
      ? window.ethernet.store.getGlobal()
      : (window.hermes && window.hermes.store)
        ? window.hermes.store.getGlobal()
        : undefined;
  }

  function getPeerId(chatExtraEl) {
    // 1. Прямой ID из data-peer-id атрибута компонента ChatExtra
    if (chatExtraEl?.dataset?.peerId) {
      return chatExtraEl.dataset.peerId;
    }

    const global = getGlobalState();
    if (!global) return undefined;

    // 2. Если элемент находится внутри Настроек (#Settings / .SettingsMain) -> строго ID текущего пользователя
    if (chatExtraEl.closest('#Settings, [class*="Settings"], .is-own-profile') && global.currentUserId) {
      return global.currentUserId;
    }

    // 3. Поиск по открытому профилю в RightColumn или вкладке
    if (global.byTabId) {
      for (const tabState of Object.values(global.byTabId)) {
        if (tabState?.chatInfo?.isOpen) {
          if (tabState.chatInfo.isOwnProfile) return global.currentUserId;
          if (tabState.chatInfo.chatId) return tabState.chatInfo.chatId;
        }
        if (tabState?.profile?.chatId) {
          return tabState.profile.chatId;
        }
        if (tabState?.management?.chatId) {
          return tabState.management.chatId;
        }
      }
    }

    // 4. Поиск по ссылке канала/группы (icon-link: https://t.me/...)
    const linkEl = chatExtraEl.querySelector('.icon-link')?.closest('.ListItem')?.querySelector('.title');
    if (linkEl) {
      const raw = (linkEl.textContent || '').trim();
      const username = raw.replace(/^https?:\/\/t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '').split('/')[0].toLowerCase();
      if (username) {
        const chat = Object.values(global.chats?.byId || {}).find((c) => (
          c.username?.toLowerCase() === username || c.usernames?.some((un) => un.username?.toLowerCase() === username)
        ));
        if (chat?.id) return chat.id;

        const user = Object.values(global.users?.byId || {}).find((u) => (
          u.username?.toLowerCase() === username || u.usernames?.some((un) => un.username?.toLowerCase() === username)
        ));
        if (user?.id) return user.id;
      }
    }

    // 5. Поиск по username (@mention)
    const mentionEl = chatExtraEl.querySelector('.icon-mention')?.closest('.ListItem')?.querySelector('.title');
    if (mentionEl) {
      const username = (mentionEl.textContent || '').trim().replace(/^@/, '').toLowerCase();
      if (username) {
        const user = Object.values(global.users?.byId || {}).find((u) => (
          u.username?.toLowerCase() === username || u.usernames?.some((un) => un.username?.toLowerCase() === username)
        ));
        if (user?.id) return user.id;

        const chat = Object.values(global.chats?.byId || {}).find((c) => (
          c.username?.toLowerCase() === username || c.usernames?.some((un) => un.username?.toLowerCase() === username)
        ));
        if (chat?.id) return chat.id;
      }
    }

    // 6. Поиск по номеру телефона (icon-phone)
    const phoneEl = chatExtraEl.querySelector('.icon-phone')?.closest('.ListItem')?.querySelector('.title');
    if (phoneEl) {
      const phone = (phoneEl.textContent || '').replace(/[^\d+]/g, '');
      if (phone) {
        const user = Object.values(global.users?.byId || {}).find((u) => (
          u.phoneNumber && (u.phoneNumber === phone || `+${u.phoneNumber}` === phone)
        ));
        if (user?.id) return user.id;
      }
    }

    // 7. По активному чату вкладки (только если не в настройках)
    if (!chatExtraEl.closest('#Settings, [class*="Settings"]')) {
      if (global.byTabId) {
        for (const tabState of Object.values(global.byTabId)) {
          if (tabState?.currentMessageList?.chatId) {
            return tabState.currentMessageList.chatId;
          }
        }
      }
    }

    return undefined;
  }

  function getPeerDcId(peerId) {
    try {
      const global = getGlobalState();
      if (!global || !peerId) return undefined;

      const user = global.users?.byId?.[peerId];
      if (user?.dcId) return user.dcId;

      const chat = global.chats?.byId?.[peerId];
      if (chat?.dcId) return chat.dcId;

      const userFull = global.users?.fullInfoById?.[peerId];
      if (userFull?.profilePhoto?.dcId) return userFull.profilePhoto.dcId;

      const chatFull = global.chats?.fullInfoById?.[peerId];
      if (chatFull?.chatPhoto?.dcId) return chatFull.chatPhoto.dcId;

      return undefined;
    } catch {
      return undefined;
    }
  }

  function copyText(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(String(text)).then(() => {
        const actions = window.ethernet?.store?.getActions?.() || window.hermes?.store?.getActions?.();
        if (actions?.showNotification) {
          actions.showNotification({ message: `${label || 'Значение'} скопировано: ${text}` });
        }
      });
    }
  }

  function updateUi() {
    if (!isPluginActive()) {
      document.querySelectorAll('.ethernet-peer-id-dc-container').forEach((el) => el.remove());
      const styleEl = document.getElementById(STYLE_ID);
      if (styleEl) styleEl.remove();
      return;
    }

    ensureStyles();

    const chatExtraList = document.querySelectorAll('.ChatExtra');
    if (!chatExtraList.length) return;

    chatExtraList.forEach((chatExtraEl) => {
      const islandEl = chatExtraEl.firstElementChild;
      if (!islandEl) return;

      const peerId = getPeerId(chatExtraEl);
      if (!peerId) return;

      const dcId = getPeerDcId(peerId);
      const dcText = dcId ? `DC ${dcId}${DC_LOCATIONS[dcId] ? ` (${DC_LOCATIONS[dcId]})` : ''}` : undefined;

      let existingWrapper = islandEl.querySelector('.ethernet-peer-id-dc-container');
      if (existingWrapper) {
        if (existingWrapper.dataset.renderedPeerId === String(peerId)) {
          return;
        }
        existingWrapper.remove();
      }

      const container = document.createElement('div');
      container.className = 'ethernet-peer-id-dc-container';
      container.dataset.renderedPeerId = String(peerId);

      // 1. Строка ID
      const idItem = document.createElement('div');
      idItem.className = 'ListItem has-ripple narrow multiline ethernet-peer-id-dc-item';
      idItem.setAttribute('tabindex', '0');
      idItem.setAttribute('role', 'button');
      idItem.innerHTML = `
        <div class="ListItem-button" role="button" tabindex="0">
          <div class="ripple-container"></div>
          <i class="icon icon-info ListItem-main-icon" aria-hidden="true"></i>
          <div class="multiline-item">
            <span class="title" dir="auto">${peerId}</span>
            <span class="subtitle">ID</span>
          </div>
        </div>
      `;
      idItem.addEventListener('click', (e) => {
        e.stopPropagation();
        copyText(peerId, 'Telegram ID');
      });
      container.appendChild(idItem);

      // 2. Строка DC
      if (dcText) {
        const dcItem = document.createElement('div');
        dcItem.className = 'ListItem has-ripple narrow multiline ethernet-peer-id-dc-item';
        dcItem.setAttribute('tabindex', '0');
        dcItem.setAttribute('role', 'button');
        dcItem.innerHTML = `
          <div class="ListItem-button" role="button" tabindex="0">
            <div class="ripple-container"></div>
            <i class="icon icon-cloud-download ListItem-main-icon" aria-hidden="true"></i>
            <div class="multiline-item">
              <span class="title" dir="auto">${dcText}</span>
              <span class="subtitle">Data Center</span>
            </div>
          </div>
        `;
        dcItem.addEventListener('click', (e) => {
          e.stopPropagation();
          copyText(`DC ${dcId}`, 'Data Center');
        });
        container.appendChild(dcItem);
      }

      // Вставляем перед блоком Уведомлений или в конец первого Island
      const notificationsItem = islandEl.querySelector('#group-notifications')?.closest('.ListItem')
        || islandEl.querySelector('[style*="vtn-notifications"]')?.closest('.ListItem')
        || islandEl.querySelector('.icon-unmute, .icon-mute')?.closest('.ListItem');

      if (notificationsItem) {
        islandEl.insertBefore(container, notificationsItem);
      } else {
        islandEl.appendChild(container);
      }
    });
  }

  // Наблюдатель за DOM
  const observer = new MutationObserver(() => {
    updateUi();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('ethernet:ready', () => {
    if (window.ethernet?.store?.subscribe) {
      window.ethernet.store.subscribe(updateUi);
    }
    updateUi();
  });

  window.addEventListener('hermes:ready', () => {
    if (window.hermes?.store?.subscribe) {
      window.hermes.store.subscribe(updateUi);
    }
    updateUi();
  });

  if (window.ethernet?.store?.subscribe) {
    window.ethernet.store.subscribe(updateUi);
  } else if (window.hermes?.store?.subscribe) {
    window.hermes.store.subscribe(updateUi);
  }

  setInterval(updateUi, 400);
  updateUi();
})();
