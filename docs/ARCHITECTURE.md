# Ethernet Telegram Client — архитектура

Дата: 2026-08-25. Статус: **MVP работает** (окно + вход + темы + плагины).

## Что уже работает (проверено реальными запусками)

1. **Electron-обёртка** (`client/electron/main.cjs`): окно 1280×832, локальный
   HTTP-сервер на `127.0.0.1:8080` раздаёт `client/dist/`, инжектит лоадер в HTML.
   `contextIsolation: on, nodeIntegration: off` — Node недоступен из страницы.
2. **Клиент telegram-tt** (форк Web A, GPL-3): собран vite, подключается к серверам
   Telegram по MTProto с api-ключами из `client/.env`. QR-логин живой.
3. **Система тем**: `E:/Telegram/themes/*.css` → склеиваются сервером в
   `/ethernet/themes.css`. Активная тема задаётся в `E:/Telegram/ethernet-settings.json`
   (`"activeTheme": "amoled.css"`) → лоадер вешает класс `theme-ethernet-<имя>` на
   `<html>`. Тема перекрывает 245 CSS-переменных клиента. Проверено: AMOLED даёт
   фон rgb(0,0,0).
4. **Система плагинов** (BetterDiscord-style): `E:/Telegram/plugins/<id>/` с
   `manifest.json` + `index.js`. Включённые плагины грузятся лоадером как
   `<script src="/ethernet/plugins/<id>/index.js">`. API: `window.ethernet`
   (`on/off/emit`, события `keydown`, `addStyle`, `log`). Демо-плагин `hello`
   подтверждён в консоли клиента.
5. **Настройки**: `E:/Telegram/ethernet-settings.json` — `enabledPlugins`,
   `activeTheme`. Публичное подмножество отдаётся лоадеру через
   `/ethernet/settings.json`.

## Запуск

```
cd E:/Telegram/client
npm run app:build   # сборка веб-клиента в dist/
npm run app         # запуск Electron (main → electron/main.cjs)
```

Отладка: запуск с `--remote-debugging-port=9222` → CDP на ws://127.0.0.1:9222.

## Ключевые решения и подводные камни

- **Файлы обёртки — `.cjs`**: package.json апстрима содержит `"type": "module"`,
  CommonJS-файлы с расширением `.js` падают (`require is not defined`).
- **`"main"` в package.json = `electron/main.cjs`** — не потерять при merge с апстримом.
- **Лоадер инжектится сервером при отдаче index.html** (не правкой dist) —
  переживает любые пересборки и апдейты апстрима.
- **Service worker клиента сносится лоадером** при загрузке — иначе закеширует
  HTML без лоадера.
- **CSP**: `style-src 'unsafe-inline'` (стили ок), `script-src 'self'` — поэтому
  плагины грузятся только как внешние скрипты с нашего же сервера, никаких inline.
- **Тема активируется классом на `<html>`**, а не подменой переменных в :root
  напрямую — чтобы можно было переключать темы без перезагрузки.

## Структура

```
E:/Telegram/
├── client/               # проект (git, upstream=Ajaxy/telegram-tt)
│   ├── electron/         # main.cjs, preload.cjs, loader.js — наш слой
│   ├── src/              # код клиента (форк telegram-tt)
│   └── dist/             # сборка
├── themes/amoled.css     # темы (CSS-переменные)
├── plugins/hello/        # плагины (manifest.json + index.js)
├── ethernet-settings.json  # enabledPlugins, activeTheme
├── reference/            # эталоны: tdesktop, tweb, telegram-tt, ayugram-check
└── docs/ARCHITECTURE.md
```

## Обновление апстрима

```
cd E:/Telegram/client
git fetch upstream && git merge upstream/master   # наши правки — отдельными коммитами
```
Наши изменения в src/ минимальны и изолированы; слой моддинга целиком в electron/.

## Дорожная карта

1. **UI настроек Ethernet** внутри клиента (список тем/плагинов с переключателями,
   кнопка перезагрузки) — через IPC `themes:list`, `themes:activate`,
   `plugins:list`, `plugins:toggle` (уже есть в preload).
2. **Событийная шина плагинов**: перехват новых сообщений/открытия чата
   (хуки в src/api или MutationObserver-слой).
3. **Каркас под оригинал**: сверка layout с reference/tdesktop (список чатов
   слева, диалог справа, ~80% схожести — требование заказчика).
4. **Скоуп v1**: чаты, сообщения, каналы/группы, профиль, минимал настроек.
5. Позже: упаковка (electron-builder → установщик), автообновления.

## Безопасность

- Плагины исполняются в контексте страницы (как BetterDiscord) — изоляция
  ревью кода; прямого доступа к Node нет (contextIsolation).
- Ключи api — в `client/.env`, в git не попадают (проверять при merge).
- Чужие плагины читать перед установкой.

---

## Статус реализации (обновлено 2026-08-25)

Сделано и проверено живым запуском:
- [x] База: форк telegram-tt в client/ (git, upstream настроен)
- [x] Сборка: `npm run app:build` (vite, ~30 сек)
- [x] Electron-обёртка: electron/main.cjs (+preload.cjs, loader.js)
- [x] Локальный сервер 127.0.0.1:8080 раздаёт dist/ + служебные маршруты /ethernet/*
- [x] Вход: QR-логин работает (MTProto-хендшейк с api_id пользователя прошёл)
- [x] Темы: themes/*.css склеиваются в /ethernet/themes.css; активная — из ethernet-settings.json (theme: "amoled" → класс html.theme-amoled). В клиенте 245 CSS-переменных для темизации
- [x] Плагины: plugins/<id>/ (manifest.json + index.js), включение — ethernet-settings.json:enabledPlugins. API плагина: window.ethernet { on, off, emit, addStyle, log }. События: keydown (расширять)
- [x] Демо: тема amoled.css + плагин hello (проверено, бейдж на экране)

Запуск: cd client && npm run app:build && npm run app
Настройки: E:/Telegram/ethernet-settings.json

Дальше (бэклог):
- [ ] UI переключения тем/плагинов в настройках клиента
- [ ] Событийная шина плагинов: хуки на новые сообщения, открытие чата
- [ ] Русская локализация по умолчанию
- [ ] Каркас-правки под оригинальный tdesktop (расположение кнопок/меню)
- [ ] Иконка/имя приложения, установщик (electron-builder)
