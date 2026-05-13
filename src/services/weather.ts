import axios from 'axios';
import { config } from '../config';
import { getWeatherEmoji } from '../utils/emoji';

interface WeatherData {
  description: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  city: string;
}

interface ForecastDay {
  date: string;
  minTemp: number;
  maxTemp: number;
  avgTemp: number;
  description: string;
  humidity: number;
  windSpeed: number;
}

function resolveCity(city?: string): string {
  return city ?? config.OPENWEATHER_CITY;
}

export async function getWeather(city?: string): Promise<WeatherData> {
  const targetCity = resolveCity(city);
  const url = 'https://api.openweathermap.org/data/2.5/weather';
  const response = await axios.get(url, {
    params: {
      q: targetCity,
      appid: config.OPENWEATHER_API_KEY,
      units: 'metric',
      lang: 'ru',
    },
  });

  const data = response.data;
  const weather = data.weather?.[0];

  if (!weather) {
    throw new Error('No weather data received');
  }

  return {
    description: weather.description,
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind.speed),
    city: data.name,
  };
}

export function formatWeather(data: WeatherData): string {
  const emoji = getWeatherEmoji(data.description, data.temp);
  return (
    `${emoji} Погода в ${data.city}\n` +
    `${data.description.charAt(0).toUpperCase() + data.description.slice(1)}\n` +
    `🌡 Температура: ${data.temp}°C (ощущается ${data.feelsLike}°C)\n` +
    `💧 Влажность: ${data.humidity}%\n` +
    `💨 Ветер: ${data.windSpeed} м/с`
  );
}

export async function getForecast(days: number, city?: string): Promise<ForecastDay[]> {
  const targetCity = resolveCity(city);
  const url = 'https://api.openweathermap.org/data/2.5/forecast';
  const response = await axios.get(url, {
    params: {
      q: targetCity,
      appid: config.OPENWEATHER_API_KEY,
      units: 'metric',
      lang: 'ru',
      cnt: Math.min(days, 5) * 8,
    },
  });

  const list: any[] = response.data.list ?? [];
  const grouped: Record<string, any[]> = {};

  for (const item of list) {
    const date = item.dt_txt?.split(' ')[0];
    if (!date) continue;
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(item);
  }

  const result: ForecastDay[] = Object.entries(grouped)
    .slice(0, Math.min(days, 5))
    .map(([date, items]) => {
      const temps = items.map((i: any) => i.main.temp);
      const minTemp = Math.round(Math.min(...temps));
      const maxTemp = Math.round(Math.max(...temps));
      const avgTemp = Math.round(temps.reduce((a: number, b: number) => a + b, 0) / temps.length);

      const descCounts: Record<string, number> = {};
      for (const item of items) {
        const desc = item.weather?.[0]?.description ?? 'unknown';
        descCounts[desc] = (descCounts[desc] || 0) + 1;
      }
      const description = Object.entries(descCounts).sort((a, b) => b[1] - a[1])[0][0];

      const avgHumidity = Math.round(
        items.reduce((sum: number, i: any) => sum + i.main.humidity, 0) / items.length
      );
      const maxWind = Math.round(Math.max(...items.map((i: any) => i.wind.speed)));

      return { date, minTemp, maxTemp, avgTemp, description, humidity: avgHumidity, windSpeed: maxWind };
    });

  return result;
}

export function formatForecast(days: ForecastDay[]): string {
  return days
    .map((d, idx) => {
      const dateObj = new Date(d.date + 'T00:00:00');
      let dateStr: string;
      if (idx === 0) {
        dateStr = 'Сегодня';
      } else if (idx === 1) {
        dateStr = 'Завтра';
      } else {
        dateStr = dateObj.toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          timeZone: config.TZ,
        });
      }
      const emoji = getWeatherEmoji(d.description, d.avgTemp);
      return (
        `${emoji} ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}: ` +
        `${d.avgTemp}°C (${d.minTemp}°C...${d.maxTemp}°C)\n` +
        `   ${d.description}, 💧${d.humidity}%, 💨${d.windSpeed} м/с`
      );
    })
    .join('\n\n');
}
