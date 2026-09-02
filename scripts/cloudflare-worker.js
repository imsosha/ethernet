/**
 * Cloudflare Worker: Защищенный приватный API бейджиков Ethernet.
 *
 * Инструкция по установке:
 * 1. Зайдите на https://dash.cloudflare.com
 * 2. Перейдите в раздел "Workers & Pages" -> "Create application" -> "Create Worker".
 * 3. Нажмите "Deploy".
 * 4. Нажмите "Edit code", вставьте этот скрипт и нажмите "Deploy".
 * 5. Скопируйте полученный URL (например: https://ethernet-badges.ваш-аккаунт.workers.dev).
 */

// Приватные списки ID (видны ТОЛЬКО вам в Cloudflare, никто извне не может их скачать или прочитать)
const DEVELOPERS = new Set([
  '-1002172900204',
  '2172900204',
  '1002172900204',
]);

const SUPPORTERS = new Set([
  '6602621362',
  // Сюда добавляйте ID новых саппортеров:
  // '1234567890',
]);

// Нормализация ID Telegram (учитывает разные форматы: -100, -, обычный ID)
function getVariations(rawId) {
  const raw = String(rawId || '').trim();
  if (!raw) return [];
  const list = [raw];

  if (raw.startsWith('-100')) {
    const bare = raw.slice(4);
    if (bare) {
      list.push(bare);
      list.push(`100${bare}`);
    }
  } else if (raw.startsWith('-')) {
    const bare = raw.slice(1);
    if (bare) list.push(bare);
  } else {
    list.push(`-100${raw}`);
    list.push(`-${raw}`);
  }

  return list;
}

export default {
  async fetch(request, env, ctx) {
    // Обработка CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    const peerId = url.searchParams.get('id');

    if (!peerId) {
      return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const variations = getVariations(peerId);
    let badgeType = null;

    for (const variant of variations) {
      if (DEVELOPERS.has(variant)) {
        badgeType = 'development';
        break;
      }
      if (SUPPORTERS.has(variant)) {
        badgeType = 'support';
        break;
      }
    }

    return new Response(JSON.stringify({ id: peerId, badge: badgeType }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Кэширование на стороне Cloudflare Edge на 1 час для максимальной скорости
        'Cache-Control': 'public, max-age=3600',
      },
    });
  },
};
