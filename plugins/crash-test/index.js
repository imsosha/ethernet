/**
 * Crash Test Plugin
 * Намеренно вызывает ошибку времени выполнения для проверки Crash Guard и Safe Mode
 */

(function () {
  console.log('[crash-test] Инициализация тестового плагина...');

  // Вызываем фатальную ошибку времени выполнения
  setTimeout(() => {
    console.error('[crash-test] Вызов намеренного сбоя...');
    throw new Error('Test crash: искусственный сбой для проверки системы Safe Mode!');
  }, 1000);
})();
