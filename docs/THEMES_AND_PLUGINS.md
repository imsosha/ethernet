# Руководство по Темам и Плагинам Ethernet Client
> **Полная спецификация архитектуры, CSS-переменных, хуков Runtime API и инструкции для нейросетей (LLM).**

---

## 📑 Оглавление
1. [Введение](#1-введение)
2. [Система Тем (Theme Engine)](#2-система-тем-theme-engine)
   - [2.1. Архитектура и формат тем](#21-архитектура-и-формат-тем)
   - [2.2. Полная таблица CSS-переменных](#22-полная-таблица-css-переменных)
   - [2.3. Метаданные темы и настройки мода](#23-метаданные-темы-и-настройки-мода)
   - [2.4. Система анимированных обоев (MP4/WebM/Images)](#24-система-анимированных-обоев)
   - [2.5. Примеры готовых тем](#25-примеры-готовых-тем)
3. [Система Плагинов (Plugin Runtime API)](#3-система-плагинов-plugin-runtime-api)
   - [3.1. Структура и жизненный цикл плагина](#31-структура-и-жизненный-цикл-плагина)
   - [3.2. Глобальный объект `window.ethernet`](#32-глобальный-объект-windowethernet)
   - [3.3. Перехват сетевых запросов MTProto (`api.beforeRequest`, `api.onRequest`)](#33-перехват-сетевых-запросов-mtproto)
   - [3.4. Перехват входящих обновлений (`api.onUpdate`, `api.afterUpdate`)](#34-перехват-входящих-обновлений)
   - [3.5. Доступ к состоянию приложения (`store`)](#35-доступ-к-состоянию-приложения-store)
   - [3.6. Управление стилями и горячими клавишами (`addStyle`, `on`)](#36-управление-стилями-и-горячими-клавишами)
   - [3.7. Полноценные рабочие примеры плагинов](#37-полноценные-рабочие-примеры-плагинов)
4. [Инструкции и системные промпты для Нейросетей (LLM Guide)](#4-инструкции-для-нейросетей-llm-guide)
   - [4.1. Правила генерации тем для ИИ](#41-правила-генерации-тем-для-ии)
   - [4.2. Правила генерации плагинов для ИИ](#42-правила-генерации-плагинов-для-ии)
   - [4.3. Готовые системные промпты](#43-готовые-системные-промпты)

---

## 1. Введение

Клиент **Ethernet** предоставляет модульную платформу для кастомизации Telegram Web.
- **Темы** управляют визуальным оформлением (цветовая палитра, прозрачности, акриловый блюр, скругления, геометрия сообщений и живые видео-обои).
- **Плагины** исполняются на стороне JavaScript-рантайма и позволяют модифицировать логику клиента (перехват и отмена сетевых запросов Telegram MTProto, защита от удаления сообщений, автоматизация, кастомные UI-элементы и хоткеи).

---

## 2. Система Тем (Theme Engine)

### 2.1. Архитектура и формат тем
Тема представляет собой валидный **CSS-файл** с объявлением переменных в блоке `:root` и дополнительными кастомными CSS-правилами. 
Файлы тем хранятся в каталоге `themes/<theme-name>.css`.

При активации темы клиент:
1. Инжектирует CSS с высоким приоритетом (`!important`).
2. Парсит значения переменных и обновляет параметры мода (блюр, скругления, анимации).
3. Автоматически загружает и включает привязанные к теме видео- или фото-обои.

### 2.2. Полная таблица CSS-переменных

#### Цветовая палитра
| Переменная | Описание | Пример значения |
| :--- | :--- | :--- |
| `--color-background` | Основной фон окон, карточек и панелей | `#1d1d1d` |
| `--color-background-secondary` | Вторичный фон, цвет пузырей **входящих** сообщений | `#181818` |
| `--color-background-secondary-accent`| Акцентный вторичный фон (поля ввода, подложки) | `#141414` |
| `--color-background-sidebar` | Фон левого сайдбара и списка чатов | `#0a0a0a` |
| `--color-background-selected` | Фон выбранного элемента списка или меню | `#161616` |
| `--color-background-own` | Фон пузырей **исходящих (своих)** сообщений | `#2d2d2d` |
| `--color-chat-active` | Фон активного чата в левом списке | `#2f2f2f` |
| `--color-primary` | Главный акцентный цвет (кнопки, активные тогглы, фокус) | `#788c91` |
| `--color-text` | Основной цвет текста | `#ebebeb` |
| `--color-text-secondary` | Вторичный цвет текста (время, статус, подсказки) | `#d2d2d2` |
| `--color-links` | Цвет гиперссылок и цветных имен | `#d4d4d4` |
| `--color-text-meta-colored` | Цвет галочек прочтения сообщений (`✔✔`) | `#d4d4d4` |
| `--color-borders` | Цвет контурных границ элементов | `#1f1f1f` |
| `--color-dividers` | Цвет тонких линий-разделителей | `#1a1a1a` |

#### Скругления (Radii)
| Переменная | Описание | Диапазон / Пример |
| :--- | :--- | :--- |
| `--border-radius-default` | Базовое скругление панелей, модальных окон и карточек | `14px` (0–24px) |
| `--border-radius-messages` | Радиус скругления пузырей сообщений | `15px` (0–24px) |
| `--border-radius-buttons` | Радиус скругления кнопок и полей ввода | `11px` (0–20px) |
| `--border-radius-avatars` | Радиус скругления аватарок пользователей и чатов | `50%` (круглые) или `20%` (squircle) |

#### Эффекты стекла и Блюр (Glassmorphism)
| Переменная / Свойство | Описание | Значения |
| :--- | :--- | :--- |
| `--blur-strength` | Сила размытия фона | `8px` (0–30px) |
| `--blur-sidebar` | Включение блюра для сайдбара | `1` (true) или `0` (false) |
| `--blur-header` | Включение блюра для шапки чата | `1` (true) или `0` (false) |
| `--blur-bubbles` | Включение блюра для пузырей сообщений | `1` (true) или `0` (false) |
| `--blur-menus` | Включение блюра для выпадающих меню | `1` (true) или `0` (false) |

#### Анимации и Геометрия чата
| Переменная / Свойство | Описание | Значения |
| :--- | :--- | :--- |
| `--animation-duration` | Длительность переходов интерфейса | `350ms` (0–600ms) |
| `--animation-curve` | Функция плавности (easing) | `cubic-bezier(0.25, 0.1, 0.25, 1)` |
| `--chat-width` | Максимальная ширина колонки чата | `wide` (80rem), `full` (100%), `default` (45rem) |
| `--message-align-own` | Сторона выравнивания своих сообщений | `left`, `right`, `center` |
| `--message-align-other` | Сторона выравнивания сообщений собеседника | `left`, `right`, `center` |

---

### 2.3. Метаданные темы и настройки мода
В начале CSS-файла темы можно указать метаданные в комментариях или блоке `:root`:

```css
/*
  Theme: Cyberpunk Neon
  Author: Ethernet Community
  Version: 1.0.0
*/

:root {
  --color-background: #0f0c1b;
  --color-background-secondary: #18142a;
  --color-background-sidebar: #0a0813;
  --color-background-own: #2c1a4d;
  --color-primary: #ff007f;
  --color-text: #f0f0ff;
  --color-text-secondary: #9c8eb9;
  --color-links: #00f0ff;
  --color-text-meta-colored: #00f0ff;
  --color-borders: #261f43;
  --color-dividers: #1a1530;

  --border-radius-default: 12px;
  --border-radius-messages: 16px;
  --border-radius-buttons: 10px;
  --blur-strength: 12px;
}
```

---

### 2.4. Система анимированных обоев
К любой теме можно прикрепить медиафайл обоев:
- Поддерживаемые форматы: **MP4**, **WebM** (видео), **PNG**, **JPG**, **WebP**, **GIF**.
- Видео воспроизводится аппаратно ускоренно в бесконечном цикле без звука (`autoplay loop muted playsinline`).
- Обои масштабируются с сохранением пропорций (`object-fit: cover`) и поддерживают фильтры затемнения и размытия.

---

### 2.5. Примеры готовых тем

#### Тема 1: Dark Obsidian (Минималистичный глубокий темный)
```css
:root {
  --color-background: #121212;
  --color-background-secondary: #1a1a1a;
  --color-background-sidebar: #0d0d0d;
  --color-background-own: #262626;
  --color-primary: #8ab4f8;
  --color-text: #ffffff;
  --color-text-secondary: #9aa0a6;
  --color-links: #8ab4f8;
  --color-text-meta-colored: #8ab4f8;
  --color-borders: #292929;
  --color-dividers: #1f1f1f;
  --border-radius-default: 14px;
  --border-radius-messages: 16px;
  --border-radius-buttons: 10px;
}
```

#### Тема 2: Emerald OLED (Изумрудный акцент на чистом черном)
```css
:root {
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
}
```

---

## 3. Система Плагинов (Plugin Runtime API)

### 3.1. Структура и жизненный цикл плагина
Каждый плагин представляет собой директорию в каталоге `plugins/<plugin_id>/`:
1. `manifest.json` — описание плагина:
   ```json
   {
     "name": "Ghost Mode Pro",
     "description": "Скрывает статус 'В сети', набор текста и чтение сообщений",
     "version": "1.0.0",
     "author": "User"
   }
   ```
2. `index.js` — исполняемый JavaScript-код плагина в самовызывающейся функции (IIFE).

Плагины автоматически подключаются при загрузке клиента (`<script src="/ethernet/plugins/<id>/index.js">`) и имеют полный доступ к DOM страницы и API Ethernet.

---

### 3.2. Глобальный объект `window.ethernet`

В рантайме доступен глобальный интерфейс:
```javascript
const {
  version,    // Версия API (напр. "0.2.0")
  api,        // Сетевые перехватчики MTProto (beforeRequest, onRequest, onUpdate, afterUpdate)
  store,      // Доступ к Redux/Teact хранилищу Telegram (getGlobal, getActions, subscribe)
  on,         // Подписка на системные события ('keydown', и др.)
  off,        // Отписка от событий
  emit,       // Генерация кастомных событий
  addStyle,   // Внедрение CSS-стилей в DOM
  log,        // Стилизованный вывод в DevTools Console
  applyTheme, // Программное применение темы
  clearTheme, // Сброс темы на дефолтную
  applyMod    // Применение параметров скруглений, блюра и т.д.
} = window.ethernet;
```

---

### 3.3. Перехват сетевых запросов MTProto

Хук `api.beforeRequest(callback)` вызывается **до** отправки любого запроса на сервер Telegram MTProto.

#### Сигнатура:
```typescript
api.beforeRequest((method: string, args: any) => {
  // return false;                // Полностью блокирует отправку запроса
  // return { cancel: true };     // Альтернативная блокировка
  // return { args: modified };   // Отправка модифицированных аргументов
  // return;                      // Пропустить запрос без изменений
});
```

#### Популярные MTProto методы для перехвата:
- `markMessagesRead` / `markMessageListRead` — подтверждение прочтения входящих сообщений.
- `readStories` — подтверждение просмотра историй.
- `sendMessageAction` — индикатор "Печатает...", "Записывает голосовое...", "Отправляет фото...".
- `account.updateStatus` — отправка сетевого статуса "В сети".
- `sendMessage` — отправка текстового сообщения.
- `messages.editMessage` — редактирование сообщения.

---

### 3.4. Перехват входящих обновлений (`api.onUpdate`)

Хук `api.onUpdate(callback)` вызывается при получении любого входящего пакета (Update) от Telegram серверов.

#### Сигнатура:
```typescript
api.onUpdate((update: any) => {
  // return false;                // Блокирует обработку обновления клиентом
  // return { update: modified }; // Подменяет данные обновления
  // return;                      // Пропускает обновление
});
```

#### Популярные типы входящих обновлений:
- `updateDeleteMessages` / `updateDeleteChannelMessages` — удаление сообщений собеседником или каналом (используется для **Anti-Recall**).
- `updateEditMessage` / `updateEditChannelMessage` — изменение текста или медиа сообщения.
- `updateUserStatus` — изменение статуса контакта (онлайн/офлайн).
- `updateUserTyping` — индикация набора текста контактом.

---

### 3.5. Доступ к состоянию приложения (`store`)

Позволяет напрямую читать и изменять состояние Telegram Web:
```javascript
// 1. Получение текущего глобального состояния
const global = window.ethernet.store.getGlobal();
console.log('Текущий ID пользователя:', global.currentUserId);
console.log('Список чатов:', global.chats.byId);

// 2. Получение экшенов приложения
const actions = window.ethernet.store.getActions();
// actions.openChat({ id: '1234567' });
// actions.showNotification({ message: 'Привет от плагина!' });

// 3. Подписка на изменение состояния
const unsubscribe = window.ethernet.store.subscribe(() => {
  const state = window.ethernet.store.getGlobal();
  // Реакция на изменение стейта
});
```

---

### 3.6. Управление стилями и горячими клавишами

#### Внедрение стилей:
```javascript
const styleEl = window.ethernet.addStyle(`
  .Message.own .message-content {
    border: 1px solid var(--color-primary) !important;
  }
  .ghost-badge {
    color: #10b981;
    font-size: 0.75rem;
  }
`, 'my-plugin-styles');
```

#### Горячие клавиши:
```javascript
const unsubscribeKey = window.ethernet.on('keydown', ({ key, ctrl, shift, alt }) => {
  if (ctrl && shift && key.toLowerCase() === 'k') {
    window.ethernet.log('Нажата комбинация Ctrl+Shift+K');
    // Выполнить действие
  }
});
```

---

### 3.7. Полноценные рабочие примеры плагинов

#### Пример 1: Плагин "Ghost Mode Ultimate" (Невидимка)
```javascript
(function () {
  const { log, api, addStyle } = window.ethernet;
  log('Ghost Mode Ultimate активирован!');

  // Блокируем отправку прочтения, набора текста и сетевого статуса
  api.beforeRequest((method, args) => {
    if (
      method === 'markMessagesRead' ||
      method === 'markMessageListRead' ||
      method === 'readStories'
    ) {
      log('[Ghost] Заблокирован отчет о прочтении:', method);
      return false;
    }

    if (method === 'sendMessageAction') {
      log('[Ghost] Заблокирован статус набора текста');
      return false;
    }

    if (method === 'account.updateStatus' && args?.offline === false) {
      log('[Ghost] Заблокирован статус "В сети"');
      return false;
    }
  });

  // Визуальный бейдж в интерфейсе
  addStyle(`
    #LeftMainHeader::after {
      content: "👻 GHOST ACTIVE";
      font-size: 0.625rem;
      font-weight: bold;
      color: #10b981;
      margin-left: 0.5rem;
      align-self: center;
    }
  `, 'ghost-mode-indicator');
})();
```

#### Пример 2: Плагин "Anti-Recall" (Анти-удаление сообщений)
```javascript
(function () {
  const { log, api, addStyle, store } = window.ethernet;
  log('Anti-Recall плагин запущен');

  addStyle(`
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
  `, 'anti-recall-styles');

  api.onUpdate((update) => {
    if (
      update?.['@type'] === 'updateDeleteMessages' ||
      update?.['@type'] === 'updateDeleteChannelMessages'
    ) {
      const ids = update.messageIds || update.messages || [];
      log('[Anti-Recall] Собеседник попытался удалить сообщения:', ids);

      // Помечаем удаленные сообщения визуально в DOM
      ids.forEach((id) => {
        const el = document.querySelector(`[data-message-id="${id}"]`);
        if (el) el.classList.add('message-deleted-intercepted');
      });

      // Отменяем удаление из локального хранилища
      return false;
    }
  });
})();
```

#### Пример 3: Плагин "Quick Emoji Reactions" (Горячие клавиши)
```javascript
(function () {
  const { log, on, store } = window.ethernet;

  on('keydown', ({ key, alt }) => {
    // Alt + 1..5: Быстрая отправка реакции на последнее выбранное сообщение
    if (alt && ['1', '2', '3', '4', '5'].includes(key)) {
      const emojis = { '1': '👍', '2': '❤️', '3': '🔥', '4': '🎉', '5': '🤔' };
      const emoji = emojis[key];
      log('Быстрая реакция:', emoji);
      
      const actions = store.getActions();
      const global = store.getGlobal();
      const currentChatId = global.currentChatId;
      // actions.sendReaction({ chatId: currentChatId, emoji });
    }
  });
})();
```

---

## 4. Инструкции для Нейросетей (LLM Guide)

### 4.1. Правила генерации тем для ИИ
При запросе пользователя создать тему:
1. **Всегда генерируйте чистый CSS** с валидным блоком `:root`.
2. **Обязательно определяйте ключевые цвета**: `--color-background`, `--color-background-secondary`, `--color-background-own`, `--color-primary`, `--color-text`, `--color-borders`.
3. Убедитесь, что контрастность текста (`--color-text`) и фона (`--color-background`) соответствует стандартам WCAG (не менее 4.5:1).
4. Задавайте радиусы: `--border-radius-default` (12–16px), `--border-radius-messages` (14–18px), `--border-radius-buttons` (8–12px).
5. Не используйте селекторы с жестко привязанными цветами текста без `var()`.

### 4.2. Правила генерации плагинов для ИИ
При запросе пользователя создать плагин:
1. **Всегда оборачивайте код в IIFE**: `(function() { ... })();`.
2. **Используйте только документированные методы `window.ethernet`**: `api.beforeRequest`, `api.onRequest`, `api.onUpdate`, `api.afterUpdate`, `addStyle`, `log`, `on`, `store`.
3. В хуках `beforeRequest` и `onUpdate` для отмены действия возвращайте строго `false`.
4. Для внедрения CSS используйте `window.ethernet.addStyle(css, id)` с уникальным идентификатором.
5. Не используйте `alert()` или блокирующие синхронные циклы.
6. Обрабатывайте возможные ошибки в блоках `try / catch`.

---

### 4.3. Готовые системные промпты

#### Системный промпт для генерации Темы:
```markdown
Ты — эксперт по дизайну интерфейсов Telegram Ethernet Client.
Создай тему в формате CSS.
Используй переменные:
:root {
  --color-background: #HEX;
  --color-background-secondary: #HEX;
  --color-background-sidebar: #HEX;
  --color-background-own: #HEX;
  --color-primary: #HEX;
  --color-text: #HEX;
  --color-text-secondary: #HEX;
  --color-links: #HEX;
  --color-borders: #HEX;
  --border-radius-default: 14px;
  --border-radius-messages: 16px;
  --border-radius-buttons: 10px;
}
Тема должна быть визуально гармоничной, премиальной и современной.
```

#### Системный промпт для генерации Плагина:
```markdown
Ты — разработчик расширений для Ethernet Telegram Client.
Напиши JavaScript-плагин, используя API window.ethernet:
(function() {
  const { api, store, addStyle, log, on } = window.ethernet;
  // Логика плагина
})();
Доступные хуки:
- api.beforeRequest(method, args) -> return false для отмены запроса к серверу.
- api.onUpdate(update) -> return false для отмены обработки входящего события.
- addStyle(css, id) -> внедрение стилей.
- on('keydown', ({ key, ctrl, shift, alt })) -> хоткеи.
```
