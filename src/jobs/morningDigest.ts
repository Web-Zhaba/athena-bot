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
import { getProfilesCount } from '../services/supabase';
import { getGa4Stats } from '../services/ga4';
import { getSystemMetrics } from '../services/system';
import { getUptimeReport } from '../services/uptime';
import { getDailyBusinessDigest } from '../services/analyst';

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
    getProfilesCount(),
    getGa4Stats(),
    getSystemMetrics(),
    getDailyBusinessDigest(),
  ]);

  const [
    weatherResult,
    todayResult,
    tomorrowResult,
    supabaseResult,
    ga4Result,
    vpsResult,
    businessResult,
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

  // 4.5. VPS Status
  if (vpsResult.status === 'fulfilled') {
    const v = vpsResult.value;
    message += `─── VPS Сервер ───\n` +
               `🧠 RAM: ${v.ramUsedGb} / ${v.ramTotalGb} ГБ (${v.ramPercentage}%)\n` +
               `💾 SSD: ${v.diskFreeGb} ГБ своб. (${v.diskUsedPercentage}% занято)\n` +
               `⚡ Load: ${v.cpuLoad.join(', ')}\n\n`;
  } else {
    console.error('Digest VPS metrics error:', vpsResult.reason);
    message += `─── VPS Сервер ───\n❌ Не удалось получить метрики сервера\n\n`;
  }

  // 4.7. Uptime Monitoring
  const monitoredUrls = (config.MONITORED_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  if (monitoredUrls.length > 0) {
    try {
      const uptimeReport = await getUptimeReport(monitoredUrls);
      message += `─── Мониторинг сайтов ───\n${uptimeReport}\n\n`;
    } catch (e) {
      console.error('Digest uptime report error:', e);
      message += `─── Мониторинг сайтов ───\n❌ Не удалось получить статус сайтов\n\n`;
    }
  }

  // 5. Analytics
  const analyticsParts: string[] = [];
  if (ga4Result.status === 'fulfilled' && ga4Result.value) {
    const s = ga4Result.value;
    analyticsParts.push(`📊 GA4: 👤${s.activeUsers} посетителей, 📄${s.pageViews} просмотров, 🚀${s.sessions} сессий`);
  } else if (ga4Result.status === 'rejected') {
    console.error('Digest GA4 error:', ga4Result.reason);
  }

  if (analyticsParts.length > 0) {
    message += `─── Аналитика сайта ───\n` + analyticsParts.join('\n');
  } else {
    message += `─── Аналитика сайта ───\nℹ️ Данные недоступны. Настройте GA4.`;
  }

  // 5.1. Business AI Analyst Report
  if (businessResult.status === 'fulfilled' && businessResult.value) {
    message += `\n\n─── ИИ Бизнес-Анализ ───\n${businessResult.value}`;
  } else if (businessResult.status === 'rejected') {
    console.error('Digest business analysis error:', businessResult.reason);
  }

  const parts = splitMessage(message);
  for (const part of parts) {
    await telegram.sendMessage(config.OWNER_CHAT_ID, part);
  }

  store.set('lastDigestTimestamp', new Date().toISOString());
}
