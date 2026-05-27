import express, { Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import { config } from './config';
import { store } from './utils/store';
import {
  getWeather,
  formatWeather,
  getForecast,
  formatForecast,
} from './services/weather';
import {
  getTodayEvents,
  getTomorrowEvents,
  getEventsForDate,
  formatEvents,
} from './services/calendar';
import { getProfilesCount } from './services/supabase';
import { getGa4Stats } from './services/ga4';
import { getCloudflareStats } from './services/cloudflare';
import { morningDigest } from './jobs/morningDigest';

export function createApi(bot: Telegraf) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      mode: config.MODE,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/weather?city=&days=
  app.get('/api/weather', async (req: Request, res: Response) => {
    try {
      const city =
        (req.query.city as string) ||
        (store.get('defaultCity') ?? config.OPENWEATHER_CITY);
      const days = parseInt(req.query.days as string, 10) || 0;

      if (days > 0) {
        const forecast = await getForecast(days, city);
        res.json({ success: true, text: formatForecast(forecast), days, city });
      } else {
        const data = await getWeather(city);
        res.json({ success: true, text: formatWeather(data), city: data.city });
      }
    } catch (err: any) {
      console.error('API weather error:', err);
      const msg = err.response?.data?.message ?? err.message ?? '';
      if (msg.includes('city not found') || err.response?.status === 404) {
        res.status(404).json({ success: false, error: 'Город не найден' });
      } else {
        res.status(500).json({ success: false, error: 'Ошибка получения погоды' });
      }
    }
  });

  // GET /api/calendar?date=today|tomorrow|dd.mm.yyyy
  app.get('/api/calendar', async (req: Request, res: Response) => {
    try {
      const dateArg = req.query.date as string | undefined;
      let text = '';

      if (dateArg) {
        const lower = dateArg.toLowerCase().trim();
        let date: Date | null = null;
        const now = new Date();

        if (lower === 'today' || lower === 'сегодня') date = now;
        else if (lower === 'tomorrow' || lower === 'завтра') {
          date = new Date(now);
          date.setDate(date.getDate() + 1);
        } else if (lower === 'yesterday' || lower === 'вчера') {
          date = new Date(now);
          date.setDate(date.getDate() - 1);
        } else {
          const ddmmyyyy = dateArg.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
          if (ddmmyyyy) {
            const [, day, month, year] = ddmmyyyy;
            date = new Date(`${year}-${month}-${day}T00:00:00`);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
            date = new Date(dateArg + 'T00:00:00');
          }
        }

        if (date && !isNaN(date.getTime())) {
          const events = await getEventsForDate(date);
          const dateStr = date.toLocaleDateString('ru-RU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: config.TZ,
          });
          text = `📆 ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}:\n${formatEvents(events)}`;
        } else {
          res.status(400).json({ success: false, error: 'Неверный формат даты' });
          return;
        }
      } else {
        const [today, tomorrow] = await Promise.all([
          getTodayEvents(),
          getTomorrowEvents(),
        ]);
        text =
          '📆 Сегодня:\n' +
          formatEvents(today) +
          '\n\n📆 Завтра:\n' +
          formatEvents(tomorrow);
      }

      res.json({ success: true, text });
    } catch (err: any) {
      console.error('API calendar error:', err);
      if (err.message === 'GOOGLE_INVALID_GRANT') {
        res.status(401).json({ success: false, error: 'Google Calendar: доступ истёк' });
      } else {
        res.status(500).json({ success: false, error: 'Ошибка календаря' });
      }
    }
  });

  // GET /api/stats
  app.get('/api/stats', async (_req: Request, res: Response) => {
    try {
      const results = await Promise.allSettled([
        getProfilesCount(),
        getGa4Stats(),
        getCloudflareStats(),
      ]);

      const [supabaseResult, ga4Result, cfResult] = results;
      const data: any = {};

      if (supabaseResult.status === 'fulfilled') {
        data.supabase = {
          count: supabaseResult.value.count,
          delta: supabaseResult.value.delta,
        };
      } else {
        data.supabase = { error: 'Не удалось получить данные Supabase' };
      }

      if (ga4Result.status === 'fulfilled' && ga4Result.value) {
        data.ga4 = ga4Result.value;
      }
      if (cfResult.status === 'fulfilled' && cfResult.value) {
        data.cloudflare = cfResult.value;
      }

      res.json({ success: true, data });
    } catch (err) {
      console.error('API stats error:', err);
      res.status(500).json({ success: false, error: 'Ошибка статистики' });
    }
  });

  // POST /api/digest — запустить дайджест сейчас
  app.post('/api/digest', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, message: 'Дайджест запущен' });
      // Отправляем асинхронно, чтобы не блокировать ответ
      morningDigest(bot.telegram).catch((err) => {
        console.error('API digest async error:', err);
        bot.telegram
          .sendMessage(config.OWNER_CHAT_ID, '⚠️ Ошибка при формировании дайджеста')
          .catch(() => {});
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Ошибка запуска дайджеста' });
    }
  });

  // POST /api/notify { message }
  app.post('/api/notify', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ success: false, error: 'message required' });
        return;
      }
      await bot.telegram.sendMessage(config.OWNER_CHAT_ID, message);
      res.json({ success: true });
    } catch (err) {
      console.error('API notify error:', err);
      res.status(500).json({ success: false, error: 'Ошибка отправки сообщения' });
    }
  });

  // POST /api/setcity { city }
  app.post('/api/setcity', async (req: Request, res: Response) => {
    try {
      const { city } = req.body;
      if (!city || typeof city !== 'string') {
        res.status(400).json({ success: false, error: 'city required' });
        return;
      }
      store.set('defaultCity', city);
      res.json({ success: true, city });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Ошибка установки города' });
    }
  });

  return app;
}
