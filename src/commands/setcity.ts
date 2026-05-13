import { Context } from 'telegraf';
import { store } from '../utils/store';

export async function setCityCommand(ctx: Context) {
  const args = ctx.message && 'text' in ctx.message
    ? ctx.message.text.split(' ').slice(1)
    : [];

  const city = args.join(' ');
  if (!city) {
    const current = store.get('defaultCity');
    if (current) {
      await ctx.reply(`Текущий город по умолчанию: ${current}\n\nЧтобы изменить: /setcity Москва`);
    } else {
      await ctx.reply('Укажите город: /setcity Москва');
    }
    return;
  }

  store.set('defaultCity', city);
  await ctx.reply(`✅ Город по умолчанию установлен: ${city}\n\nТеперь /weather будет показывать погоду для этого города.`);
}
