import { Context } from 'telegraf';
import { store } from '../utils/store';
import { config } from '../config';
import { getWeather, formatWeather, getForecast, formatForecast } from '../services/weather';

export async function weatherCommand(ctx: Context) {
  const args = ctx.message && 'text' in ctx.message
    ? ctx.message.text.split(' ').slice(1)
    : [];

  let days: number | null = null;
  let city: string | null = null;

  for (const arg of args) {
    if (/^\d+$/.test(arg)) {
      days = Math.min(Math.max(parseInt(arg, 10), 1), 5);
    } else {
      city = city ? city + ' ' + arg : arg;
    }
  }

  const defaultCity = store.get('defaultCity') ?? config.OPENWEATHER_CITY;
  const targetCity = city ?? defaultCity;

  if (days) {
    try {
      const forecast = await getForecast(days, targetCity);
      await ctx.reply(`📅 Прогноз погоды (${days} дн.):\n\n${formatForecast(forecast)}`);
    } catch (err: any) {
      console.error('Forecast command error:', err);
      const msg = err.response?.data?.message ?? err.message ?? '';
      if (msg.includes('city not found') || err.response?.status === 404) {
        await ctx.reply(`❌ Город "${targetCity}" не найден. Проверьте название.`);
      } else {
        await ctx.reply('❌ Не удалось получить прогноз погоды. Проверьте API-ключ OpenWeatherMap.');
      }
    }
    return;
  }

  try {
    const data = await getWeather(targetCity);
    await ctx.reply(formatWeather(data));
  } catch (err: any) {
    console.error('Weather command error:', err);
    const msg = err.response?.data?.message ?? err.message ?? '';
    if (msg.includes('city not found') || err.response?.status === 404) {
      await ctx.reply(`❌ Город "${targetCity}" не найден. Проверьте название.`);
    } else {
      await ctx.reply('❌ Не удалось получить погоду. Проверьте API-ключ OpenWeatherMap.');
    }
  }
}
