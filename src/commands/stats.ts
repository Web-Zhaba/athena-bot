import { Context, Markup, Telegraf } from 'telegraf';
import { getProfilesCount } from '../services/supabase';
import { getGa4Stats } from '../services/ga4';
import { getCloudflareStats } from '../services/cloudflare';
import { getSystemMetrics } from '../services/system';
import { getDailyBusinessDigest } from '../services/analyst';

// ============================================================================
// ⚙️ НАСТРОЙКА СТРАНИЦ СТАТИСТИКИ (EXTENSIBLE CONFIG)
// Хотите добавить новую кнопку? Просто добавьте объект в массив STATS_PAGES ниже!
// Каждая страница автоматически получит кнопку в меню, обработку клика и кнопку "Обновить".
// ============================================================================
export interface StatsPage {
  id: string;
  label: string;
  emoji: string;
  getData: () => Promise<string> | string;
}

const STATS_PAGES: StatsPage[] = [
  {
    id: 'ga4',
    label: 'Google Analytics 4',
    emoji: '📊',
    getData: async () => {
      const ga4 = await getGa4Stats();
      if (!ga4) {
        return '📊 *Google Analytics 4*\n\n❌ Данные недоступны. Проверьте настройки GA4_PROPERTY_ID в файле .env.';
      }
      return `📊 *Google Analytics 4 (Сегодня)*\n\n` +
             `👤 *Активные пользователи:* ${ga4.activeUsers}\n` +
             `📄 *Просмотры страниц:* ${ga4.pageViews}\n` +
             `🚀 *Сессии:* ${ga4.sessions}`;
    }
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Stats',
    emoji: '☁️',
    getData: async () => {
      const cf = await getCloudflareStats();
      if (!cf) {
        return '☁️ *Cloudflare Stats*\n\n❌ Данные недоступны. Проверьте CLOUDFLARE_ZONE_ID и токены в .env.';
      }
      return `☁️ *Cloudflare Stats (Сегодня)*\n\n` +
             `👤 *Уникальные посетители:* ${cf.uniques}\n` +
             `📄 *Просмотры страниц:* ${cf.pageViews}\n` +
             `🔁 *Всего запросов:* ${cf.requests}`;
    }
  },
  {
    id: 'supabase',
    label: 'Supabase Users',
    emoji: '👥',
    getData: async () => {
      const sb = await getProfilesCount();
      const sign = sb.delta! >= 0 ? '+' : '';
      return `👥 *База данных Supabase*\n\n` +
             `👥 *Всего зарегистрировано:* ${sb.count}\n` +
             `📈 *Прирост за последние 24ч:* ${sign}${sb.delta ?? 0} пользователей`;
    }
  },
  {
    id: 'vps',
    label: 'VPS Status',
    emoji: '🖥️',
    getData: async () => {
      const vps = await getSystemMetrics();
      return `🖥️ *Статус VPS Сервера*\n\n` +
             `⚡ *Загрузка CPU (LA):* ${vps.cpuLoad.join(', ')}\n` +
             `🧠 *Оперативная память:* ${vps.ramUsedGb} / ${vps.ramTotalGb} ГБ (${vps.ramPercentage}%)\n` +
             `💾 *Накопитель (SSD):* ${vps.diskFreeGb} ГБ свободно (${vps.diskUsedPercentage}% занято)`;
    }
  },
  {
    id: 'business',
    label: 'Бизнес-ИИ Анализ',
    emoji: '🧠',
    getData: async () => {
      const digest = await getDailyBusinessDigest();
      if (!digest) {
        return '🧠 *ИИ-Бизнес Анализ за вчера*\n\n⚠️ Нет вчерашней статистики трафика и продаж для составления отчета. Добавьте переходы по сайту и оплаты для анализа!';
      }
      return digest;
    }
  }
];

// ============================================================================
// 🛠️ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РЕНДЕРИНГА UX
// ============================================================================

/**
 * Генерирует текст главного меню статистики с быстрой сводкой
 */
async function getMainMenuText(): Promise<string> {
  const [sb, ga4, cf, vps] = await Promise.allSettled([
    getProfilesCount(),
    getGa4Stats(),
    getCloudflareStats(),
    getSystemMetrics()
  ]);

  let text = `📊 *Панель управления Athena*\n\n`;

  if (sb.status === 'fulfilled') {
    const { count, delta } = sb.value;
    const sign = delta! >= 0 ? '+' : '';
    text += `👥 *Пользователей:* ${count} (${sign}${delta} за сутки)\n`;
  } else {
    text += `👥 *Пользователей:* ⚠️ Ошибка загрузки\n`;
  }

  if (ga4.status === 'fulfilled' && ga4.value) {
    text += `📊 *GA4 сегодня:* 👤 ${ga4.value.activeUsers} | 📄 ${ga4.value.pageViews}\n`;
  } else {
    text += `📊 *GA4 сегодня:* ⚠️ Ошибка GA4\n`;
  }

  if (cf.status === 'fulfilled' && cf.value) {
    text += `☁️ *Cloudflare:* 👤 ${cf.value.uniques} | 📄 ${cf.value.pageViews}\n`;
  } else {
    text += `☁️ *Cloudflare:* ⚠️ Ошибка Cloudflare\n`;
  }

  if (vps.status === 'fulfilled') {
    const v = vps.value;
    text += `🖥️ *VPS Сервер:* 🧠 RAM: ${v.ramPercentage}% | 💾 SSD: ${v.diskUsedPercentage}%\n`;
  } else {
    text += `🖥️ *VPS Сервер:* ⚠️ Ошибка сбора метрик\n`;
  }

  text += `\nВыберите раздел ниже для детального просмотра:`;
  return text;
}

/**
 * Строит клавиатуру главного меню динамически на основе STATS_PAGES
 */
function buildMenuKeyboard() {
  const buttons = STATS_PAGES.map(page => 
    Markup.button.callback(`${page.emoji} ${page.label}`, `stats_page:${page.id}`)
  );

  // Размещаем по 2 кнопки в ряд для компактности
  const rows: any[] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  // Кнопка глобального обновления в самом низу
  rows.push([Markup.button.callback('🔄 Обновить всё', 'stats_action:refresh')]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Строит клавиатуру для страниц детального просмотра
 */
function buildSubmenuKeyboard(pageId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('◀️ Назад в меню', 'stats_action:main'),
      Markup.button.callback('🔄 Обновить', `stats_refresh:${pageId}`)
    ]
  ]);
}

/**
 * Безопасно редактирует сообщение в Telegram, игнорируя ошибку,
 * если новое содержимое полностью совпадает с текущим (для избежания крашей при частом клике Refresh).
 */
async function safeEditMessage(ctx: Context, text: string, keyboard: any) {
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (err: any) {
    if (err.message?.includes('message is not modified')) {
      // Игнорируем ошибку немодифицированного сообщения
      return;
    }
    console.error('safeEditMessage error:', err);
  }
}

// ============================================================================
// 🚀 ОСНОВНЫЕ ОБРАБОТЧИКИ
// ============================================================================

/**
 * Обработчик команды /stats
 */
export async function statsCommand(ctx: Context) {
  try {
    // Если вызвано кнопкой, показываем всплывашку "Загрузка..."
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⌛ Загружаю статистику...');
    }

    const text = await getMainMenuText();
    const keyboard = buildMenuKeyboard();

    if (ctx.callbackQuery) {
      await safeEditMessage(ctx, text, keyboard);
    } else {
      await ctx.reply(text, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }
  } catch (err) {
    console.error('Stats command error:', err);
    await ctx.reply('❌ Ошибка при формировании панели управления.');
  }
}

/**
 * Регистрирует все экшены для интерактивных кнопок статистики в Telegraf
 */
export function registerStatsActions(bot: Telegraf<Context>) {
  // 1. Главная страница
  bot.action('stats_action:main', async (ctx) => {
    await statsCommand(ctx);
  });

  // 2. Обновить всё
  bot.action('stats_action:refresh', async (ctx) => {
    await ctx.answerCbQuery('🔄 Обновляю все показатели...');
    const text = await getMainMenuText();
    const keyboard = buildMenuKeyboard();
    await safeEditMessage(ctx, text, keyboard);
  });

  // 3. Динамический переход на страницу метрики
  bot.action(/^stats_page:(.+)$/, async (ctx) => {
    const pageId = ctx.match[1];
    const page = STATS_PAGES.find(p => p.id === pageId);
    
    if (!page) {
      await ctx.answerCbQuery('⚠️ Раздел не найден');
      return;
    }

    await ctx.answerCbQuery(`⌛ Загружаю ${page.label}...`);
    
    try {
      const dataText = await page.getData();
      const keyboard = buildSubmenuKeyboard(pageId);
      await safeEditMessage(ctx, dataText, keyboard);
    } catch (err) {
      console.error(`Error loading page ${pageId}:`, err);
      await ctx.answerCbQuery('❌ Ошибка загрузки данных');
    }
  });

  // 4. Динамическое обновление конкретной страницы
  bot.action(/^stats_refresh:(.+)$/, async (ctx) => {
    const pageId = ctx.match[1];
    const page = STATS_PAGES.find(p => p.id === pageId);

    if (!page) {
      await ctx.answerCbQuery('⚠️ Раздел не найден');
      return;
    }

    await ctx.answerCbQuery('🔄 Обновляю данные...');
    
    try {
      const dataText = await page.getData();
      const keyboard = buildSubmenuKeyboard(pageId);
      await safeEditMessage(ctx, dataText, keyboard);
    } catch (err) {
      console.error(`Error refreshing page ${pageId}:`, err);
      await ctx.answerCbQuery('❌ Ошибка обновления');
    }
  });
}
