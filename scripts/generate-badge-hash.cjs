const crypto = require('crypto');

const DEFAULT_SALT = 'ethernet_salt_v1';
const PBKDF2_ITERATIONS = 50000;

function pbkdf2Hex(id, salt = DEFAULT_SALT) {
  return crypto.pbkdf2Sync(String(id).trim(), salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
}

function getVariations(rawId) {
  const raw = String(rawId).trim();
  const list = new Set();
  list.add(raw);

  if (raw.startsWith('-100')) {
    const bare = raw.slice(4);
    if (bare) {
      list.add(bare);
      list.add(`100${bare}`);
    }
  } else if (raw.startsWith('-')) {
    const bare = raw.slice(1);
    if (bare) list.add(bare);
  } else {
    list.add(`-100${raw}`);
    list.add(`-${raw}`);
  }

  return Array.from(list);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('\n=== Генератор PBKDF2-50000 хэша для Ethernet ===');
  console.log('Использование:');
  console.log('  node scripts/generate-badge-hash.cjs <Telegram_ID> [dev|sup]\n');
  console.log('Примеры:');
  console.log('  node scripts/generate-badge-hash.cjs 6602621362 sup');
  console.log('  node scripts/generate-badge-hash.cjs -1002172900204 dev\n');
  process.exit(0);
}

const inputId = args[0];
const type = (args[1] || 'sup').toLowerCase().startsWith('dev') ? 'dev' : 'sup';
const variations = getVariations(inputId);

console.log(`\n--- Результат для ID: ${inputId} (тип: ${type}) ---`);
console.log('Скопируйте эти строки в файл SHA в репозитории:\n');

for (const variant of variations) {
  const hash = pbkdf2Hex(variant);
  console.log(`${type}:${hash}`);
}
console.log('\n----------------------------------------------------\n');
