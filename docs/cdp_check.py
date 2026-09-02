"""Проверка страницы Telegram через CDP: загружен ли лоадер hermes."""
import json
import urllib.request

def cdp_list():
    with urllib.request.urlopen('http://127.0.0.1:9222/json') as r:
        return json.load(r)

def cdp_eval(ws_url, expr):
    # простой ws-клиент на голых сокетах не нужен — используем websocket через http upgrade
    # проще: используем requests? нет. Возьмём стандартный подход через websocket-client если есть,
    # иначе — через raw socket. Проверим наличие библиотеки.
    try:
        import websocket  # websocket-client
    except ImportError:
        raise SystemExit('NEED_WS_LIB')
    ws = websocket.create_connection(ws_url, timeout=10)
    ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('id') == 1:
            return msg['result']

targets = cdp_list()
page = next(t for t in targets if t['type'] == 'page' and 'Telegram' in t['title'] and 'Service' not in t['title'])
try:
    res = cdp_eval(page['webSocketDebuggerUrl'], """JSON.stringify({
      loader: !!window.__hermesLoader,
      api: typeof window.hermes,
      themeLink: !!document.querySelector('link[href="/hermes/themes.css"]'),
      pluginScripts: [...document.querySelectorAll('script[data-hermes-plugin]')].map(s => s.src),
      swCount: navigator.serviceWorker.controller ? 1 : 0
    })""")
    print(res.get('result', {}).get('value', res))
except SystemExit as e:
    print(e)
