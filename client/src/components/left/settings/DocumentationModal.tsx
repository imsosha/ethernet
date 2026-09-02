import type { FC } from '../../../lib/teact/teact';
import { memo, useState, useCallback, useEffect } from '../../../lib/teact/teact';

import buildClassName from '../../../util/buildClassName';
import { getEthernetString } from '../../../util/ethernetLang';
import useLang from '../../../hooks/useLang';

import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Icon from '../../common/icons/Icon';

import styles from './DocumentationModal.module.scss';

type OwnProps = {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'themes' | 'plugins' | 'ai' | 'examples';
};

const DocumentationModal: FC<OwnProps> = ({
  isOpen,
  onClose,
  initialTab = 'themes',
}) => {
  const lang = useLang();
  const [activeTab, setActiveTab] = useState<'themes' | 'plugins' | 'ai' | 'examples'>(initialTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  }, []);

  const handleCopyFullMarkdown = useCallback(() => {
    copyToClipboard(FULL_MARKDOWN_DOCS, 'full-md');
  }, [copyToClipboard]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getEthernetString(lang, 'EthernetDocsTitle')}
      hasCloseButton
      className={styles.modalRoot}
    >
      <div className={styles.root}>
        {/* TAB BAR */}
        <div className={styles.tabBar}>
          <button
            type="button"
            className={buildClassName(styles.tabBtn, activeTab === 'themes' && styles.active)}
            onClick={() => setActiveTab('themes')}
          >
            <Icon name="brush" className={styles.tabIcon} />
            <span>{getEthernetString(lang, 'EthernetTabThemes')}</span>
          </button>
          <button
            type="button"
            className={buildClassName(styles.tabBtn, activeTab === 'plugins' && styles.active)}
            onClick={() => setActiveTab('plugins')}
          >
            <Icon name="code" className={styles.tabIcon} />
            <span>{getEthernetString(lang, 'EthernetTabPlugins')}</span>
          </button>
          <button
            type="button"
            className={buildClassName(styles.tabBtn, activeTab === 'ai' && styles.active)}
            onClick={() => setActiveTab('ai')}
          >
            <Icon name="ai" className={styles.tabIcon} />
            <span>{getEthernetString(lang, 'EthernetTabAi')}</span>
          </button>
          <button
            type="button"
            className={buildClassName(styles.tabBtn, activeTab === 'examples' && styles.active)}
            onClick={() => setActiveTab('examples')}
          >
            <Icon name="article" className={styles.tabIcon} />
            <span>{getEthernetString(lang, 'EthernetTabExamples')}</span>
          </button>
        </div>

        {/* CONTENT BODY */}
        <div className={buildClassName(styles.contentBody, 'custom-scroll')}>
          {/* 1. ТЕМЫ (CSS) */}
          {activeTab === 'themes' && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Icon name="brush" />
                  <span>Архитектура и Формат Тем</span>
                </div>
                <p className={styles.text}>
                  Темы в Ethernet — это стандартные <code>.css</code> файлы с объявлением переменных в блоке <code>:root</code>. 
                  Все переменные автоматически применяются с наивысшим приоритетом, переопределяя встроенные палитры Telegram Web.
                </p>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Основные CSS-переменные</div>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Переменная</th>
                        <th>Описание</th>
                        <th>Пример</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>--color-background</td>
                        <td>Основной фон панелей и окон</td>
                        <td>#1d1d1d</td>
                      </tr>
                      <tr>
                        <td>--color-background-secondary</td>
                        <td>Вторичный фон, цвет входящих пузырей</td>
                        <td>#181818</td>
                      </tr>
                      <tr>
                        <td>--color-background-own</td>
                        <td>Фон исходящих (своих) сообщений</td>
                        <td>#2d2d2d</td>
                      </tr>
                      <tr>
                        <td>--color-background-sidebar</td>
                        <td>Фон левой панели чатов</td>
                        <td>#0a0a0a</td>
                      </tr>
                      <tr>
                        <td>--color-primary</td>
                        <td>Акцентный цвет (кнопки, тогглы)</td>
                        <td>#788c91</td>
                      </tr>
                      <tr>
                        <td>--color-text</td>
                        <td>Основной цвет текста</td>
                        <td>#ebebeb</td>
                      </tr>
                      <tr>
                        <td>--color-text-secondary</td>
                        <td>Вторичный текст (время, статус)</td>
                        <td>#d2d2d2</td>
                      </tr>
                      <tr>
                        <td>--color-links</td>
                        <td>Цвет ссылок и имен пользователей</td>
                        <td>#d4d4d4</td>
                      </tr>
                      <tr>
                        <td>--color-text-meta-colored</td>
                        <td>Цвет галочек прочтения сообщений</td>
                        <td>#d4d4d4</td>
                      </tr>
                      <tr>
                        <td>--color-borders</td>
                        <td>Границы и контуры элементов</td>
                        <td>#1f1f1f</td>
                      </tr>
                      <tr>
                        <td>--border-radius-default</td>
                        <td>Скругление интерфейса (карточки, модалки)</td>
                        <td>14px</td>
                      </tr>
                      <tr>
                        <td>--border-radius-messages</td>
                        <td>Радиус скругления сообщений</td>
                        <td>15px</td>
                      </tr>
                      <tr>
                        <td>--border-radius-buttons</td>
                        <td>Радиус кнопок и полей ввода</td>
                        <td>11px</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Шаблон чистой CSS темы</div>
                <div className={styles.codeBlockWrapper}>
                  <div className={styles.codeHeader}>
                    <span>theme-template.css</span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(THEME_TEMPLATE_CODE, 'theme-tpl')}
                    >
                      <Icon name="copy" />
                      <span>{copiedKey === 'theme-tpl' ? getEthernetString(lang, 'EthernetCopied') : 'Копировать'}</span>
                    </button>
                  </div>
                  <pre className={styles.codeBlock}>{THEME_TEMPLATE_CODE}</pre>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Живые анимированные видео-обои</div>
                <p className={styles.text}>
                  Клиент поддерживает привязку персональных обоев к каждой теме:
                </p>
                <ul className={styles.list}>
                  <li><strong>Форматы видео:</strong> MP4, WebM (воспроизведение зацикленно без звука с аппаратным ускорением).</li>
                  <li><strong>Форматы графики:</strong> PNG, JPG, WebP, GIF.</li>
                  <li>Файлы сохраняются в каталоге <code>wallpapers/</code> и автоматически переключаются при активации соответствующей темы.</li>
                </ul>
              </div>
            </>
          )}

          {/* 2. ПЛАГИНЫ (JS) */}
          {activeTab === 'plugins' && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Icon name="code" />
                  <span>Структура и Рантайм Плагинов</span>
                </div>
                <p className={styles.text}>
                  Плагины — это JavaScript-модули, работающие в контексте страницы. Каждый плагин помещается в <code>plugins/&lt;id&gt;/</code> и состоит из <code>manifest.json</code> и <code>index.js</code>.
                </p>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>API Объект window.ethernet</div>
                <div className={styles.codeBlockWrapper}>
                  <div className={styles.codeHeader}>
                    <span>Доступные методы рантайма</span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(RUNTIME_API_CODE, 'api-spec')}
                    >
                      <Icon name="copy" />
                      <span>{copiedKey === 'api-spec' ? getEthernetString(lang, 'EthernetCopied') : 'Копировать'}</span>
                    </button>
                  </div>
                  <pre className={styles.codeBlock}>{RUNTIME_API_CODE}</pre>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Сетевые перехватчики MTProto (api.beforeRequest)</div>
                <p className={styles.text}>
                  Позволяет перехватывать, изменять аргументы или <strong>отменять</strong> отправку любых запросов к серверам Telegram:
                </p>
                <ul className={styles.list}>
                  <li><code>markMessagesRead</code> / <code>markMessageListRead</code> — чтение входящих сообщений.</li>
                  <li><code>readStories</code> — подтверждение просмотра историй.</li>
                  <li><code>sendMessageAction</code> — индикация набора текста и записи голосовых.</li>
                  <li><code>account.updateStatus</code> — сетевой статус "В сети".</li>
                  <li><code>sendMessage</code> — отправка сообщений.</li>
                </ul>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Перехват входящих событий (api.onUpdate)</div>
                <p className={styles.text}>
                  Хук <code>api.onUpdate(cb)</code> срабатывает на входящие события от серверов Telegram:
                </p>
                <ul className={styles.list}>
                  <li><code>updateDeleteMessages</code> — удаление сообщений собеседником (Anti-Recall).</li>
                  <li><code>updateEditMessage</code> — редактирование сообщений.</li>
                  <li><code>updateUserStatus</code> — онлайн/офлайн статусы контактов.</li>
                </ul>
              </div>
            </>
          )}

          {/* 3. API ДЛЯ ИИ / LLM */}
          {activeTab === 'ai' && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Icon name="ai" />
                  <span>Правила для Нейросетей и LLM</span>
                </div>
                <p className={styles.text}>
                  При генерации кода плагинов и тем для Ethernet Client следуйте строгим спецификациям:
                </p>
                <ul className={styles.list}>
                  <li><strong>Темы:</strong> Генерируйте чистый CSS с блоком <code>:root</code>, определяя все обязательные переменные <code>--color-*</code> и <code>--border-radius-*</code>. Контрастность текста к фону должна быть не ниже 4.5:1.</li>
                  <li><strong>Плагины:</strong> Код плагина ВСЕГДА оборачивается в самовызывающуюся функцию <code>(function() &#123; ... &#125;)();</code>.</li>
                  <li>Используйте только документированные свойства <code>window.ethernet</code> (<code>api.beforeRequest</code>, <code>api.onUpdate</code>, <code>store</code>, <code>addStyle</code>, <code>on</code>, <code>log</code>).</li>
                  <li>Для блокировки запроса в <code>beforeRequest</code> возвращайте строго <code>false</code>.</li>
                  <li>Не используйте синхронные блокирующие вызовы (<code>alert</code>, бесконечные циклы).</li>
                </ul>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Системный промпт для генерации темы</div>
                <div className={styles.codeBlockWrapper}>
                  <div className={styles.codeHeader}>
                    <span>Промпт для ChatGPT / Claude / Gemini</span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(PROMPT_THEME, 'prompt-theme')}
                    >
                      <Icon name="copy" />
                      <span>{copiedKey === 'prompt-theme' ? getEthernetString(lang, 'EthernetCopied') : 'Копировать'}</span>
                    </button>
                  </div>
                  <pre className={styles.codeBlock}>{PROMPT_THEME}</pre>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Системный промпт для генерации плагина</div>
                <div className={styles.codeBlockWrapper}>
                  <div className={styles.codeHeader}>
                    <span>Промпт для написания плагина</span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(PROMPT_PLUGIN, 'prompt-plugin')}
                    >
                      <Icon name="copy" />
                      <span>{copiedKey === 'prompt-plugin' ? getEthernetString(lang, 'EthernetCopied') : 'Копировать'}</span>
                    </button>
                  </div>
                  <pre className={styles.codeBlock}>{PROMPT_PLUGIN}</pre>
                </div>
              </div>
            </>
          )}

          {/* 4. ГОТОВЫЕ ПРИМЕРЫ */}
          {activeTab === 'examples' && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Icon name="code" />
                  <span>Пример 1: Плагин «Ghost Mode Ultimate» (Невидимка)</span>
                </div>
                <div className={styles.codeBlockWrapper}>
                  <div className={styles.codeHeader}>
                    <span>ghost-mode.js</span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(EXAMPLE_GHOST_CODE, 'ex-ghost')}
                    >
                      <Icon name="copy" />
                      <span>{copiedKey === 'ex-ghost' ? getEthernetString(lang, 'EthernetCopied') : 'Копировать'}</span>
                    </button>
                  </div>
                  <pre className={styles.codeBlock}>{EXAMPLE_GHOST_CODE}</pre>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Icon name="code" />
                  <span>Пример 2: Плагин «Anti-Recall» (Защита от удаления)</span>
                </div>
                <div className={styles.codeBlockWrapper}>
                  <div className={styles.codeHeader}>
                    <span>anti-recall.js</span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(EXAMPLE_ANTIRECALL_CODE, 'ex-antirecall')}
                    >
                      <Icon name="copy" />
                      <span>{copiedKey === 'ex-antirecall' ? getEthernetString(lang, 'EthernetCopied') : 'Копировать'}</span>
                    </button>
                  </div>
                  <pre className={styles.codeBlock}>{EXAMPLE_ANTIRECALL_CODE}</pre>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Icon name="brush" />
                  <span>Пример 3: Тема «Emerald OLED»</span>
                </div>
                <div className={styles.codeBlockWrapper}>
                  <div className={styles.codeHeader}>
                    <span>emerald-oled.css</span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(EXAMPLE_THEME_CODE, 'ex-theme')}
                    >
                      <Icon name="copy" />
                      <span>{copiedKey === 'ex-theme' ? getEthernetString(lang, 'EthernetCopied') : 'Копировать'}</span>
                    </button>
                  </div>
                  <pre className={styles.codeBlock}>{EXAMPLE_THEME_CODE}</pre>
                </div>
              </div>
            </>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className={styles.modalFooter}>
          <Button onClick={handleCopyFullMarkdown} color="translucent" className={styles.copyAllBtn}>
            <Icon name="copy" />
            <span>{copiedKey === 'full-md' ? getEthernetString(lang, 'EthernetCopied') : getEthernetString(lang, 'EthernetCopyMd')}</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// --- CODE CONSTANTS ---

const THEME_TEMPLATE_CODE = `:root {
  --color-background: #1d1d1d;
  --color-background-secondary: #181818;
  --color-background-sidebar: #0a0a0a;
  --color-background-own: #2d2d2d;
  --color-chat-active: #2f2f2f;
  --color-primary: #788c91;
  --color-text: #ebebeb;
  --color-text-secondary: #d2d2d2;
  --color-links: #d4d4d4;
  --color-text-meta-colored: #d4d4d4;
  --color-borders: #1f1f1f;
  --color-dividers: #1a1a1a;

  --border-radius-default: 14px;
  --border-radius-messages: 15px;
  --border-radius-buttons: 11px;
  --blur-strength: 8px;
}`;

const RUNTIME_API_CODE = `// window.ethernet API Reference
const {
  version,    // Версия клиента (string)
  api,        // Сетевые перехватчики MTProto
  store,      // Доступ к Redux/Teact хранилищу
  on,         // Подписка на системные события ('keydown')
  off,        // Отписка от событий
  emit,       // Генерация событий
  addStyle,   // Внедрение CSS (cssText, id) -> HTMLStyleElement
  log,        // Логирование в консоль с цветным бейджем
  applyTheme, // Применить тему по имени (string)
  clearTheme, // Сбросить тему
  applyMod    // Применить параметры скруглений и блюра
} = window.ethernet;

// 1. Блокировка/модификация запросов:
api.beforeRequest((method, args) => {
  // return false; // отменить запрос
});

// 2. Перехват входящих обновлений:
api.onUpdate((update) => {
  // return false; // отменить обработку клиентом
});

// 3. Доступ к стейту Telegram:
const state = store.getGlobal();
const actions = store.getActions();`;

const PROMPT_THEME = `Ты — дизайнер интерфейсов для Ethernet Telegram Client.
Создай тему в формате CSS.
Обязательно используй переменные в блоке :root:
- --color-background: #HEX;
- --color-background-secondary: #HEX;
- --color-background-sidebar: #HEX;
- --color-background-own: #HEX;
- --color-primary: #HEX;
- --color-text: #HEX;
- --color-text-secondary: #HEX;
- --color-links: #HEX;
- --color-borders: #HEX;
- --border-radius-default: 14px;
- --border-radius-messages: 16px;
- --border-radius-buttons: 10px;

Тема должна быть контрастной, гармоничной и современной.`;

const PROMPT_PLUGIN = `Ты — разработчик расширений для Ethernet Telegram Client.
Напиши JavaScript плагин в формате IIFE:
(function() {
  const { api, store, addStyle, log, on } = window.ethernet;
  // Логика плагина
})();
Правила:
1. Для отмены исходящих запросов используй api.beforeRequest(method, args) -> return false.
2. Для отмены входящих событий используй api.onUpdate(update) -> return false.
3. Для стилей используй addStyle(css, id).
4. Для хоткеев используй on('keydown', ({ key, ctrl, shift, alt }) => ...).`;

const EXAMPLE_GHOST_CODE = `(function () {
  const { log, api, addStyle } = window.ethernet;
  log('Ghost Mode Pro активирован!');

  // Блокируем отправку прочтения, набора текста и онлайна
  api.beforeRequest((method, args) => {
    if (method === 'markMessagesRead' || method === 'markMessageListRead' || method === 'readStories') {
      log('[Ghost] Прочтение скрыто:', method);
      return false;
    }
    if (method === 'sendMessageAction') {
      log('[Ghost] Набор текста скрыт');
      return false;
    }
    if (method === 'account.updateStatus' && args?.offline === false) {
      log('[Ghost] Сетевой статус онлайн скрыт');
      return false;
    }
  });

  addStyle(\`
    #LeftMainHeader::after {
      content: "👻 GHOST ACTIVE";
      font-size: 0.625rem;
      font-weight: bold;
      color: #10b981;
      margin-left: 0.5rem;
      align-self: center;
    }
  \`, 'ghost-mode-badge');
})();`;

const EXAMPLE_ANTIRECALL_CODE = `(function () {
  const { log, api, addStyle } = window.ethernet;
  log('Anti-Recall запущен');

  addStyle(\`
    .message-deleted-intercepted {
      outline: 1px dashed #ef4444 !important;
      position: relative;
    }
    .message-deleted-intercepted::after {
      content: "🚫 УДАЛЕНО";
      position: absolute;
      top: -0.5rem;
      right: 0.5rem;
      font-size: 0.625rem;
      color: #ef4444;
      font-weight: bold;
    }
  \`, 'anti-recall-css');

  api.onUpdate((update) => {
    if (update?.['@type'] === 'updateDeleteMessages' || update?.['@type'] === 'updateDeleteChannelMessages') {
      const ids = update.messageIds || update.messages || [];
      log('[Anti-Recall] Перехвачено удаление сообщений:', ids);
      ids.forEach((id) => {
        const el = document.querySelector(\`[data-message-id="\${id}"]\`);
        if (el) el.classList.add('message-deleted-intercepted');
      });
      return false; // отменяем удаление из локального хранилища
    }
  });
})();`;

const EXAMPLE_THEME_CODE = `:root {
  --color-background: #000000;
  --color-background-secondary: #0d1410;
  --color-background-sidebar: #050806;
  --color-background-own: #13241b;
  --color-primary: #10b981;
  --color-text: #e6f4ea;
  --color-text-secondary: #85a894;
  --color-links: #34d399;
  --color-text-meta-colored: #10b981;
  --color-borders: #1a2e22;
  --color-dividers: #122018;

  --border-radius-default: 16px;
  --border-radius-messages: 18px;
  --border-radius-buttons: 12px;
  --blur-strength: 10px;
}`;

const FULL_MARKDOWN_DOCS = `# Документация Ethernet Client: Темы и Плагины

## 1. Темы (CSS)
Темы в клиенте Ethernet — это файлы .css со списком переменных :root.
Основные переменные:
- --color-background: основной фон
- --color-background-secondary: фон входящих сообщений
- --color-background-own: фон своих сообщений
- --color-background-sidebar: фон сайдбара
- --color-primary: акцентный цвет
- --color-text: цвет текста
- --color-text-secondary: цвет второстепенного текста
- --color-links: цвет ссылок
- --color-borders: цвет границ
- --border-radius-default: скругление интерфейса
- --border-radius-messages: скругление сообщений
- --border-radius-buttons: скругление кнопок

## 2. Плагины (JavaScript)
Плагины выполняются в IIFE:
\`\`\`javascript
(function() {
  const { api, store, addStyle, log, on } = window.ethernet;
  // api.beforeRequest(method, args) -> return false для отмены
  // api.onUpdate(update) -> return false для отмены входящих событий
})();
\`\`\`
`;

export default memo(DocumentationModal);
