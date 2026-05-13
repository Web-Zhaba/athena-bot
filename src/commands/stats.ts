import { Context } from 'telegraf';
import { getVercelStats, formatVercelStats } from '../services/vercel';
import { getProfilesCount } from '../services/supabase';
import { getGa4Stats } from '../services/ga4';
import { getCloudflareStats } from '../services/cloudflare';

export async function statsCommand(ctx: Context) {
  try {
    const results = await Promise.allSettled([
      getVercelStats(),
      getProfilesCount(),
      getGa4Stats(),
      getCloudflareStats(),
    ]);

    const [vercelResult, supabaseResult, ga4Result, cfResult] = results;

    let message = '';

    if (vercelResult.status === 'fulfilled') {
      message += formatVercelStats(vercelResult.value);
    } else {
      console.error('Vercel stats error:', vercelResult.reason);
      message += '⚠️ Не удалось получить статус Vercel';
    }

    message += '\n\n';

    if (supabaseResult.status === 'fulfilled') {
      const { count, delta } = supabaseResult.value;
      let text = `👥 Пользователей в Supabase: ${count}`;
      if (delta !== null) {
        const sign = delta > 0 ? '+' : '';
        text += ` (${sign}${delta} за сутки)`;
      }
      message += text;
    } else {
      console.error('Supabase count error:', supabaseResult.reason);
      message += '⚠️ Не удалось получить данные из Supabase';
    }

    // Analytics section
    const analyticsParts: string[] = [];

    if (ga4Result.status === 'fulfilled' && ga4Result.value) {
      const s = ga4Result.value;
      analyticsParts.push(`📊 GA4 сегодня: 👤${s.activeUsers} посетителей, 📄${s.pageViews} просмотров, 🚀${s.sessions} сессий`);
    } else if (ga4Result.status === 'rejected') {
      console.error('GA4 stats error:', ga4Result.reason);
    }

    if (cfResult.status === 'fulfilled' && cfResult.value) {
      const s = cfResult.value;
      analyticsParts.push(`☁️ Cloudflare сегодня: 👤${s.uniques} уникальных, 📄${s.pageViews} просмотров, 🔁${s.requests} запросов`);
    } else if (cfResult.status === 'rejected') {
      console.error('Cloudflare stats error:', cfResult.reason);
    }

    if (analyticsParts.length > 0) {
      message += '\n\n─── Аналитика ───\n' + analyticsParts.join('\n');
    } else {
      message += '\n\nℹ️ Детальная аналитика недоступна. Настройте GA4 или Cloudflare (см. .env.example).';
    }

    await ctx.reply(message);
  } catch (err) {
    console.error('Stats command error:', err);
    await ctx.reply('❌ Ошибка при получении статистики.');
  }
}
