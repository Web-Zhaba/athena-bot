import { Context } from 'telegraf';
import {
  getTodayEvents,
  getTomorrowEvents,
  getEventsForDate,
  formatEvents,
} from '../services/calendar';

function parseDateArg(arg?: string): Date | null {
  if (!arg) return null;
  const lower = arg.toLowerCase().trim();
  const now = new Date();

  if (lower === 'today' || lower === 'сегодня') return now;
  if (lower === 'tomorrow' || lower === 'завтра') {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return t;
  }
  if (lower === 'yesterday' || lower === 'вчера') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return y;
  }

  // dd.mm.yyyy
  const ddmmyyyy = arg.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const d = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }

  // yyyy-mm-dd (keep for compatibility)
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    const d = new Date(arg + 'T00:00:00');
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

export async function calendarCommand(ctx: Context) {
  const args = ctx.message && 'text' in ctx.message
    ? ctx.message.text.split(' ').slice(1)
    : [];
  const dateArg = args[0];
  const date = parseDateArg(dateArg);

  if (date) {
    try {
      const events = await getEventsForDate(date);
      const dateStr = date.toLocaleDateString('ru-RU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Europe/Moscow',
      });
      await ctx.reply(`📆 ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}:\n${formatEvents(events)}`);
    } catch (err: any) {
      console.error('Calendar command error:', err);
      if (err.message === 'GOOGLE_INVALID_GRANT') {
        await ctx.reply(
          '🔐 Google Calendar: доступ истёк. Перезапустите авторизацию:\n`npx ts-node scripts/get-google-token.ts`'
        );
      } else {
        await ctx.reply('❌ Не удалось получить события из Google Calendar.');
      }
    }
    return;
  }

  try {
    const [today, tomorrow] = await Promise.all([
      getTodayEvents(),
      getTomorrowEvents(),
    ]);

    const text =
      '📆 Сегодня:\n' +
      formatEvents(today) +
      '\n\n📆 Завтра:\n' +
      formatEvents(tomorrow);

    await ctx.reply(text);
  } catch (err: any) {
    console.error('Calendar command error:', err);
    if (err.message === 'GOOGLE_INVALID_GRANT') {
      await ctx.reply(
        '🔐 Google Calendar: доступ истёк. Перезапустите авторизацию:\n`npx ts-node scripts/get-google-token.ts`'
      );
    } else {
      await ctx.reply(
        '❌ Не удалось получить события из Google Calendar. Проверьте Google OAuth токены.'
      );
    }
  }
}
