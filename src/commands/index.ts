import { Telegraf, Context, session } from 'telegraf';
import { config } from '../config';
import { askGemini } from '../services/ai';

// Импорт обработчиков команд
import { startCommand } from './start';
import { weatherCommand } from './weather';
import { setCityCommand } from './setcity';
import { calendarCommand } from './calendar';
import { statsCommand, registerStatsActions } from './stats';
import { digestCommand } from './digest';

/**
 * Регистрирует все команды, клавиатуры, миддлвары и ИИ-перехватчики в боте.
 */
export function registerBotCommands(bot: Telegraf<Context>): void {
  // 1. Проверка безопасности (Личный доступ только для владельца OWNER_CHAT_ID)
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id.toString();
    const fromId = ctx.from?.id.toString();
    const userId = chatId ?? fromId;

    if (userId !== config.OWNER_CHAT_ID) {
      console.warn(`Blocked unauthorized access from user: ${userId}`);
      if (ctx.message) {
        await ctx.reply('⛔ Этот бот личный. Доступ запрещён.');
      }
      return;
    }
    return next();
  });

  // 2. Активация встроенного сессионного хранилища Telegraf (для предотвращения конфликтов ИИ)
  bot.use(session());

  // 3. Регистрация команд
  bot.start(startCommand);
  bot.command('weather', weatherCommand);
  bot.command('setcity', setCityCommand);
  bot.command('calendar', calendarCommand);
  bot.command('stats', statsCommand);
  
  // Регистрация inline callback обработчиков для дашборда stats
  registerStatsActions(bot);
  
  bot.command('digest', digestCommand);

  // 4. Умный глобальный ИИ-собеседник для свободного ввода
  bot.on('text', async (ctx, next) => {
    // Игнорируем команды
    if (ctx.message.text.startsWith('/')) {
      return next();
    }

    // Защита: Если в сессии выставлен кастомный стейт (ожидание ввода формы), пропускаем к обработчику формы
    const sessionState = (ctx as any).session?.state;
    if (sessionState && sessionState !== 'idle') {
      return next();
    }

    // Иначе — свободное общение с ИИ
    try {
      await ctx.sendChatAction('typing');
    } catch (e) {
      // Игнорируем возможные лимиты Telegram API на ChatActions
    }

    try {
      const reply = await askGemini(ctx.message.text);
      await ctx.reply(reply, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('AI text companion error:', err);
      await ctx.reply('⚠️ Извините, не удалось связаться с модулем искусственного интеллекта.');
    }
  });

  // Глобальный перехватчик ошибок в Telegraf
  bot.catch((err, ctx) => {
    console.error(`Telegraf runtime error during ${ctx.updateType}:`, err);
  });
}
