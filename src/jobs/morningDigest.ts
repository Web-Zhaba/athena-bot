import { Telegram } from 'telegraf';
import { config } from '../config';
import { store } from '../utils/store';
import { splitMessage } from '../utils/splitMessage';

import { getWeather, formatWeather } from '../services/weather';
import {
  getTodayEvents,
  getTomorrowEvents,
  formatEvents,
} from '../services/calendar';
import { getVercelStats, formatVercelStats } from '../services/vercel';
import { getProfilesCount } from '../services/supabase';
import { getGa4Stats } from '../services/ga4';
import { getCloudflareStats } from '../services/cloudflare';

export async function morningDigest(telegram: Telegram) {
  const now = new Date();
  const dateString = now.toLocaleDateString('ru-RU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: config.TZ,
  });

  let message = `🌅 Доброе утро!\n`;
  message += `Сегодня: ${dateString.charAt(0).toUpperCase() + dateString.slice(1)}\n\n`;

  const results = await Promise.allSettled([
    getWeather(store.get('defaultCity')),
    getTodayEvents(),
    getTomorrowEvents(),
    getVercelStats(),
    getProfilesCount(),
    getGa4Stats(),
    getCloudflareStats(),
  ]);

  const [
    weatherResult,
    todayResult,
    tomorrowResult,
    vercelResult,
    supabaseResult,
    ga4Result,
    cfResult,
  ] = results;

  // 1. Weather
  if (weatherResult.status === 'fulfilled') {
    message += `─── Погода ───\n${formatWeather(weatherResult.value)}\n\n`;
  } else {
    console.error('Digest weather error:', weatherResult.reason);
    message += `─── Погода ───\n❌ Не удалось получить погоду\n\n`;
  }

  // 2. Calendar
  if (todayResult.status === 'fulfilled' && tomorrowResult.status === 'fulfilled') {
    message += `─── Календарь ───\n`;
    message += `📆 Сегодня:\n${formatEvents(todayResult.value)}\n\n`;
    message += `📆 Завтра:\n${formatEvents(tomorrowResult.value)}\n\n`;
  } else {
    const todayReason = todayResult.status === 'rejected' ? todayResult.reason : null;
    const tomorrowReason = tomorrowResult.status === 'rejected' ? tomorrowResult.reason : null;
    console.error('Digest calendar error:', todayReason ?? tomorrowReason);
    const isInvalidGrant =
      todayReason?.message === 'GOOGLE_INVALID_GRANT' ||
      tomorrowReason?.message === 'GOOGLE_INVALID_GRANT';
    if (isInvalidGrant) {
      message += `─── Календарь ───\n🔐 Доступ к Google Calendar истёк. Перезапустите авторизацию.\n\n`;
      try {
        await telegram.sendMessage(
          config.OWNER_CHAT_ID,
          '⚠️ Google Calendar отвалился. Запустите:\nnpx ts-node scripts/get-google-token.ts'
        );
      } catch (e) {
        console.error('Failed to send Google auth warning:', e);
      }
    } else {
      message += `─── Календарь ───\n❌ Не удалось получить события\n\n`;
    }
  }

  // 3. Vercel
  if (vercelResult.status === 'fulfilled') {
    message += `─── Проект ───\n${formatVercelStats(vercelResult.value)}\n\n`;
  } else {
    console.error('Digest vercel error:', vercelResult.reason);
    message += `─── Проект ───\n❌ Не удалось получить статус Vercel\n\n`;
  }

  // 4. Supabase
  if (supabaseResult.status === 'fulfilled') {
    const { count, delta } = supabaseResult.value;
    let text = `─── База данных ───\n👥 Пользователей: ${count}`;
    if (delta !== null) {
      const sign = delta > 0 ? '+' : '';
      text += ` (${sign}${delta} за сутки)`;
    }
    message += text + '\n\n';
  } else {
    console.error('Digest supabase error:', supabaseResult.reason);
    message += `─── База данных ───\n❌ Не удалось получить данные Supabase\n\n`;
  }

  // 5. Analytics
  const analyticsParts: string[] = [];
  if (ga4Result.status === 'fulfilled' && ga4Result.value) {
    const s = ga4Result.value;
    analyticsParts.push(`📊 GA4: 👤${s.activeUsers} посетителей, 📄${s.pageViews} просмотров, 🚀${s.sessions} сессий`);
  } else if (ga4Result.status === 'rejected') {
    console.error('Digest GA4 error:', ga4Result.reason);
  }

  if (cfResult.status === 'fulfilled' && cfResult.value) {
    const s = cfResult.value;
    analyticsParts.push(`☁️ Cloudflare: 👤${s.uniques} уникальных, 📄${s.pageViews} просмотров`);
  } else if (cfResult.status === 'rejected') {
    console.error('Digest Cloudflare error:', cfResult.reason);
  }

  if (analyticsParts.length > 0) {
    message += `─── Аналитика сайта ───\n` + analyticsParts.join('\n');
  } else {
    message += `─── Аналитика сайта ───\nℹ️ Данные недоступны. Настройте GA4 или Cloudflare.`;
  }

  const parts = splitMessage(message);
  for (const part of parts) {
    await telegram.sendMessage(config.OWNER_CHAT_ID, part);
  }

  store.set('lastDigestTimestamp', new Date().toISOString());
}
