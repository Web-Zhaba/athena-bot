import { Context } from 'telegraf';

export async function startCommand(ctx: Context) {
  const text =
    '👋 Доброе утро! Я Афина — ваш личный помощник.\n\n' +
    'Команды:\n' +
    '/weather — погода (по умолчанию)\n' +
    '/weather 3 — прогноз на 3 дня (1–5)\n' +
    '/weather Москва — погода в городе\n' +
    '/weather 3 Москва — прогноз на 3 дня в городе\n' +
    '/setcity Москва — установить город по умолчанию\n' +
    '/calendar — события сегодня и завтра\n' +
    '/calendar 20.05.2026 — события на дату (dd.mm.yyyy)\n' +
    '/stats — статус Vercel + Supabase + аналитика\n' +
    '/digest — запустить утренний дайджест вручную\n\n' +
    'Каждый день в 8:00 МСК я пришлю сводку автоматически. 🌅';

  await ctx.reply(text);
}
