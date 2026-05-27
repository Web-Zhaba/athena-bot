import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import { config } from './config';
import { store } from './utils/store';
import { createApi } from './api';

import { startCommand } from './commands/start';
import { weatherCommand } from './commands/weather';
import { setCityCommand } from './commands/setcity';
import { calendarCommand } from './commands/calendar';
import { statsCommand } from './commands/stats';
import { digestCommand } from './commands/digest';

import { morningDigest } from './jobs/morningDigest';

const IS_STANDALONE = config.MODE === 'standalone';
const bot = new Telegraf(config.BOT_TOKEN, config.TELEGRAM_API_ROOT ? {
  telegram: {
    apiRoot: config.TELEGRAM_API_ROOT,
  },
} : undefined);

// --- Telegram command handlers (только в standalone режиме) ---
if (IS_STANDALONE) {
  // Security: only allow owner
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id.toString();
    const fromId = ctx.from?.id.toString();
    const userId = chatId ?? fromId;

    if (userId !== config.OWNER_CHAT_ID) {
      console.warn(`Blocked access from user: ${userId}`);
      if (ctx.message) {
        await ctx.reply('⛔ Этот бот личный. Доступ запрещён.');
      }
      return;
    }
    return next();
  });

  bot.start(startCommand);
  bot.command('weather', weatherCommand);
  bot.command('setcity', setCityCommand);
  bot.command('calendar', calendarCommand);
  bot.command('stats', statsCommand);
  bot.command('digest', digestCommand);
}

// --- HTTP API (всегда) ---
const api = createApi(bot);
const server = api.listen(config.PORT, () => {
  console.log(`Athena API listening on port ${config.PORT} (mode=${config.MODE})`);
});

// --- Startup notification ---
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
            '/stats — Vercel + Supabase + аналитика\n' +
            '/digest — запустить утренний дайджест'
          : 'Интеграция с OpenClaw активна. Дайджесты по cron, API доступен.')
    );
  } catch (err) {
    console.error('Failed to send startup message:', err);
  }
}

// --- Cron jobs ---
const cronExpression = `${config.DIGEST_MINUTE} ${config.DIGEST_HOUR} * * *`;
console.log(`Scheduling morning digest at: ${config.DIGEST_HOUR}:${config.DIGEST_MINUTE} (${config.TZ})`);

const digestJob = cron.schedule(
  cronExpression,
  async () => {
    console.log(`[${new Date().toISOString()}] Running morning digest...`);
    try {
      await morningDigest(bot.telegram);
    } catch (err) {
      console.error('Morning digest error:', err);
      try {
        await bot.telegram.sendMessage(
          config.OWNER_CHAT_ID,
          '⚠️ Утренний дайджест завершился с ошибкой. Проверьте логи.'
        );
      } catch (notifyErr) {
        console.error('Failed to notify about digest error:', notifyErr);
      }
    }
  },
  {
    scheduled: true,
    timezone: config.TZ,
  }
);

const heartbeatJob = cron.schedule(
  '0 */6 * * *',
  async () => {
    console.log(`[${new Date().toISOString()}] Heartbeat check...`);
    store.set('lastHeartbeatTimestamp', new Date().toISOString());
  },
  {
    scheduled: true,
    timezone: config.TZ,
  }
);

// --- Error handling ---
bot.catch((err, ctx) => {
  console.error(`Telegraf error for ${ctx.updateType}:`, err);
});

// --- Graceful shutdown ---
async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  digestJob.stop();
  heartbeatJob.stop();

  server.close(() => {
    console.log('HTTP server closed');
  });

  if (IS_STANDALONE) {
    await bot.stop(signal);
  }

  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// --- Start ---
(async () => {
  // Check for missed digest
  try {
    const lastDigestStr = store.get('lastDigestTimestamp');
    if (lastDigestStr) {
      const lastDigest = new Date(lastDigestStr);
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastDay = new Date(lastDigest);
      lastDay.setHours(0, 0, 0, 0);

      const digestTimeToday = new Date();
      digestTimeToday.setHours(parseInt(config.DIGEST_HOUR, 10), parseInt(config.DIGEST_MINUTE, 10), 0, 0);

      if (
        today.getTime() !== lastDay.getTime() &&
        now.getTime() > digestTimeToday.getTime()
      ) {
        console.log('Missed digest detected, running now...');
        try {
          await morningDigest(bot.telegram);
          await bot.telegram.sendMessage(
            config.OWNER_CHAT_ID,
            '⏰ Дайджест за сегодня был пропущен (бот был офлайн). Вот сводка 👆'
          );
        } catch (e) {
          console.error('Missed digest run failed:', e);
        }
      }
    }
  } catch (e) {
    console.error('Missed digest check error:', e);
  }

  await notifyStartup();

  if (IS_STANDALONE) {
    try {
      await bot.telegram.setMyCommands([
        { command: 'weather', description: 'Погода (можно добавить дни и город)' },
        { command: 'setcity', description: 'Установить город по умолчанию' },
        { command: 'calendar', description: 'События сегодня/завтра или на дату' },
        { command: 'stats', description: 'Vercel + Supabase + аналитика' },
        { command: 'digest', description: 'Запустить утренний дайджест' },
      ]);
      console.log('Bot commands menu updated');
    } catch (err) {
      console.error('Failed to set bot commands:', err);
    }

    await bot.launch();
    console.log('Bot is running in standalone mode (polling)...');
  } else {
    console.log('Bot is running in backend mode (API + cron only, no polling)...');
  }
})();
