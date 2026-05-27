import { Telegraf, Context } from 'telegraf';
import { config } from './config';
import { store } from './utils/store';
import { createApi } from './api';
import { registerBotCommands } from './commands';
import { initScheduler, stopScheduler, checkMissedDigest } from './jobs/scheduler';

const IS_STANDALONE = config.MODE === 'standalone';

// 1. Инициализация инстанса Telegraf
const bot = new Telegraf<Context>(
  config.BOT_TOKEN,
  config.TELEGRAM_API_ROOT
    ? {
        telegram: {
          apiRoot: config.TELEGRAM_API_ROOT,
        },
      }
    : undefined
);

// 2. Регистрация всех команд, сессий, клавиатур и ИИ-обработчиков
if (IS_STANDALONE) {
  registerBotCommands(bot);
}

// 3. Запуск Express HTTP API Сервера (всегда)
const api = createApi(bot);
const server = api.listen(config.PORT, () => {
  console.log(`Athena API listening on port ${config.PORT} (mode=${config.MODE})`);
});

// 4. Уведомление о запуске бота
async function notifyStartup() {
  try {
    const defaultCity = store.get('defaultCity') ?? config.OPENWEATHER_CITY;
    await bot.telegram.sendMessage(
      config.OWNER_CHAT_ID,
      '🤖 Афина запущена и готова к работе.\n\n' +
        `Режим: ${config.MODE}\n` +
        `Город по умолчанию: ${defaultCity}\n\n` +
        (IS_STANDALONE
          ? 'Команды:\n' +
            '/weather — погода\n' +
            '/weather 3 — прогноз на 3 дня\n' +
            '/weather Москва — погода в другом городе\n' +
            '/setcity Москва — установить город по умолчанию\n' +
            '/calendar — события сегодня и завтра\n' +
            '/calendar 20.05.2026 — события на дату\n' +
            '/stats — интерактивная панель управления\n' +
            '/digest — запустить утренний дайджест'
          : 'Интеграция с OpenClaw активна. Дайджесты по cron, API доступен.')
    );
  } catch (err) {
    console.error('Failed to send startup message:', err);
  }
}

// 5. Обработчик корректного завершения работы приложения (Graceful Shutdown)
async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  
  // Останавливаем периодические кроны
  stopScheduler();

  // Закрываем HTTP-сервер
  server.close(() => {
    console.log('Express HTTP server closed.');
  });

  // Останавливаем поллинг бота
  if (IS_STANDALONE) {
    await bot.stop(signal);
  }

  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// 6. Инициализация и запуск приложения
(async () => {
  // Запуск планировщика периодических задач
  initScheduler(bot.telegram);

  // Проверка пропущенного дайджеста при запуске
  await checkMissedDigest(bot.telegram);

  // Отправка сообщения о старте владельцу
  await notifyStartup();

  // Запуск бота в standalone (polling) режиме
  if (IS_STANDALONE) {
    try {
      await bot.telegram.setMyCommands([
        { command: 'weather', description: 'Погода (можно добавить дни и город)' },
        { command: 'setcity', description: 'Установить город по умолчанию' },
        { command: 'calendar', description: 'События сегодня/завтра или на дату' },
        { command: 'stats', description: 'Интерактивная панель управления' },
        { command: 'digest', description: 'Запустить утренний дайджест' },
      ]);
      console.log('Bot commands menu updated successfully.');
    } catch (err) {
      console.error('Failed to set bot commands menu:', err);
    }

    await bot.launch();
    console.log('Bot is running in standalone mode (polling)...');
  } else {
    console.log('Bot is running in backend mode (API + cron only, no polling)...');
  }
})();
