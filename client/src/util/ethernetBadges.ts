export type EthernetBadgeType = 'development' | 'support';

// URL вашего Cloudflare Worker
export const CLOUDFLARE_WORKER_URL = 'https://eth.ethernet-0e3.workers.dev';

const REMOTE_SHA_URL = 'https://raw.githubusercontent.com/imsosha/ethernet-assets/refs/heads/main/SHA';
const PEER_CACHE_STORAGE_KEY = 'ethernet_peer_badges_v2';
const SHA_CACHE_STORAGE_KEY = 'ethernet_badges_cache_pbkdf2_v1';
const DEFAULT_SALT = 'ethernet_salt_v1';
const PBKDF2_ITERATIONS = 50000;

interface BadgeData {
  salt: string;
  development: Set<string>;
  support: Set<string>;
}

// Встроенные хэши PBKDF2-50000 по умолчанию (для канала -1002172900204 и разработчиков)
const BUILTIN_DEV_HASHES = [
  'e7f972e813a12a0c532a0c5f3ea9730936edca326c20a51e0d571588dfc882f0', // -1002172900204
  '848846fb8d15b3e558cd1b5bf39d8ee1a04cbc046fcbba4f73770afb4290fe2f', // 2172900204
  'c99a3053fe007e1e89457e2dc98103c4ab5a1ab305679d0deffe4ddbe72169d7', // 1002172900204
];

const badgeData: BadgeData = {
  salt: DEFAULT_SALT,
  development: new Set(BUILTIN_DEV_HASHES),
  support: new Set(),
};

// Быстрый синхронный кэш вычисленных статусов для пиров
const resolvedBadgesCache = new Map<string, EthernetBadgeType | null>();
const pendingCalculations = new Map<string, Promise<EthernetBadgeType | undefined>>();
const listeners = new Set<() => void>();

// Загрузка долгосрочного кэша пиров из LocalStorage
function loadPeerCache() {
  try {
    const raw = localStorage.getItem(PEER_CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([id, type]) => {
          resolvedBadgesCache.set(id, (type as EthernetBadgeType) || null);
        });
      }
    }
  } catch {}
}

function savePeerCache() {
  try {
    const obj: Record<string, string | null> = {};
    resolvedBadgesCache.forEach((val, id) => {
      obj[id] = val;
    });
    localStorage.setItem(PEER_CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

function notifyListeners() {
  listeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

export function addBadgesChangeListener(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

async function pbkdf2Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(text),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(DEFAULT_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getPeerIdVariations(peerId: string | number): string[] {
  const raw = String(peerId).trim();
  const variations = new Set<string>();

  variations.add(raw);

  if (raw.startsWith('-100')) {
    const bare = raw.slice(4);
    if (bare) {
      variations.add(bare);
      variations.add(`100${bare}`);
    }
  } else if (raw.startsWith('-')) {
    const bare = raw.slice(1);
    if (bare) {
      variations.add(bare);
    }
  } else {
    variations.add(`-100${raw}`);
    variations.add(`-${raw}`);
  }

  return Array.from(variations);
}

// Запрос бейджа из Cloudflare Worker API
async function fetchBadgeFromWorker(peerId: string): Promise<EthernetBadgeType | undefined | null> {
  if (!CLOUDFLARE_WORKER_URL) return undefined;
  try {
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/badge?id=${encodeURIComponent(peerId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && 'badge' in data) {
        return (data.badge as EthernetBadgeType) || null;
      }
    }
  } catch {}
  return undefined;
}

// Вычисление и проверка статуса пира по его ID
export async function calculatePeerBadge(peerId?: string | number): Promise<EthernetBadgeType | undefined> {
  if (!peerId) return undefined;
  const key = String(peerId);

  if (resolvedBadgesCache.has(key)) {
    const cached = resolvedBadgesCache.get(key);
    return cached || undefined;
  }

  if (pendingCalculations.has(key)) {
    return pendingCalculations.get(key);
  }

  const promise = (async () => {
    try {
      // 1. Попытка получить через защищенный Cloudflare Worker
      const workerResult = await fetchBadgeFromWorker(key);
      if (workerResult !== undefined) {
        resolvedBadgesCache.set(key, workerResult);
        savePeerCache();
        return workerResult || undefined;
      }

      // 2. Резервный расчет по локальным/GitHub хэшам (если воркер недоступен)
      const variations = getPeerIdVariations(peerId);
      for (const variant of variations) {
        const hash = await pbkdf2Hex(variant);

        if (badgeData.development.has(hash)) {
          resolvedBadgesCache.set(key, 'development');
          savePeerCache();
          return 'development';
        }
        if (badgeData.support.has(hash)) {
          resolvedBadgesCache.set(key, 'support');
          savePeerCache();
          return 'support';
        }
      }

      resolvedBadgesCache.set(key, null);
      savePeerCache();
      return undefined;
    } finally {
      pendingCalculations.delete(key);
    }
  })();

  pendingCalculations.set(key, promise);
  return promise;
}

// Синхронное получение из кэша (для мгновенного рендера)
export function getEthernetBadgeType(peerId?: string | number): EthernetBadgeType | undefined {
  if (!peerId) return undefined;
  const key = String(peerId);

  if (resolvedBadgesCache.has(key)) {
    const val = resolvedBadgesCache.get(key);
    return val || undefined;
  }

  // Запускаем расчет в фоне
  void calculatePeerBadge(peerId);
  return undefined;
}

function parseRemoteShaContent(text: string) {
  if (!text || !text.trim()) return;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.development)) {
        parsed.development.forEach((h: string) => {
          if (typeof h === 'string' && h.trim()) badgeData.development.add(h.trim().toLowerCase());
        });
      }
      if (Array.isArray(parsed.support)) {
        parsed.support.forEach((h: string) => {
          if (typeof h === 'string' && h.trim()) badgeData.support.add(h.trim().toLowerCase());
        });
      }
      return;
    }
  } catch {}

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue;

    if (line.startsWith('dev:') || line.startsWith('development:')) {
      const h = line.split(':')[1]?.trim().toLowerCase();
      if (h) badgeData.development.add(h);
    } else if (line.startsWith('sup:') || line.startsWith('support:')) {
      const h = line.split(':')[1]?.trim().toLowerCase();
      if (h) badgeData.support.add(h);
    } else if (/^[0-9a-f]{64}$/i.test(line)) {
      badgeData.support.add(line.toLowerCase());
    }
  }
}

function loadShaCache() {
  try {
    const raw = localStorage.getItem(SHA_CACHE_STORAGE_KEY);
    if (raw) {
      parseRemoteShaContent(raw);
    }
  } catch {}
}

function saveShaCache(text: string) {
  try {
    localStorage.setItem(SHA_CACHE_STORAGE_KEY, text);
  } catch {}
}

export async function fetchRemoteBadges() {
  try {
    const res = await fetch(`${REMOTE_SHA_URL}?_t=${Date.now()}`);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim()) {
        parseRemoteShaContent(text);
        saveShaCache(text);
        notifyListeners();
      }
    }
  } catch {}
}

export async function initEthernetBadges() {
  loadPeerCache();
  loadShaCache();
  await fetchRemoteBadges();
}
