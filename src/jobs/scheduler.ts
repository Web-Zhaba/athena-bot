import cron from 'node-cron';
import { Telegram } from 'telegraf';
import { config } from '../config';
import { store } from '../utils/store';
import { morningDigest } from './morningDigest';
import { checkUrl } from '../services/uptime';

let digestJob: cron.ScheduledTask | null = null;
let heartbeatJob: cron.ScheduledTask | null = null;
let uptimeJob: cron.ScheduledTask | null = null;
let backupCheckJob: cron.ScheduledTask | null = null;

const monitoredUrls = (config.MONITORED_URLS || '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

/**
 * Инициализирует и запускает все периодические задачи (Cron Jobs)
 */
export function initScheduler(telegram: Telegram): void {
  // 1. Утренний дайджест
  const cronExpression = `${config.DIGEST_MINUTE} ${config.DIGEST_HOUR} * * *`;
  console.log(`Scheduling morning digest at: ${config.DIGEST_HOUR}:${config.DIGEST_MINUTE} (${config.TZ})`);

  digestJob = cron.schedule(
    cronExpression,
    async () => {
      console.log(`[${new Date().toISOString()}] Running morning digest...`);
      try {
        await morningDigest(telegram);
      } catch (err) {
        console.error('Morning digest error:', err);
        try {
          await telegram.sendMessage(
            config.OWNER_CHAT_ID,
            '⚠️ Утренний дайджест завершился с ошибкой. Проверьте логи.'
          );
        } catch (notifyErr) {
          console.error('Failed to notify about digest error:', notifyErr);
        }
      }
    },
    {
      scheduled: true,
      timezone: config.TZ,
    }
  );

  // 2. Heartbeat логирование раз в 6 часов
  heartbeatJob = cron.schedule(
    '0 */6 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] Heartbeat check...`);
      store.set('lastHeartbeatTimestamp', new Date().toISOString());
    },
    {
      scheduled: true,
      timezone: config.TZ,
    }
  );

  // 3. Мониторинг аптайма сайтов каждые 5 минут
  uptimeJob = cron.schedule(
    '*/5 * * * *',
    async () => {
      if (monitoredUrls.length === 0) return;
      console.log(`[${new Date().toISOString()}] Running uptime monitoring check...`);
      
      for (const url of monitoredUrls) {
        try {
          const res = await checkUrl(url);
          if (res.statusChanged) {
            const cleanUrl = url.replace(/^https?:\/\//, '');
            if (!res.isUp) {
              await telegram.sendMessage(
                config.OWNER_CHAT_ID,
                `🔴 *[Внимание] Сайт упал!*\n\n` +
                  `🔗 *URL:* \`${cleanUrl}\`\n` +
                  `⚠️ *Ошибка:* ${res.error || `HTTP ${res.statusCode}`}\n` +
                  `⏱️ *Время:* ${new Date().toLocaleTimeString('ru-RU', { timeZone: config.TZ })}`,
                { parse_mode: 'Markdown' }
              );
            } else {
              const durationText = res.offlineDurationMin !== undefined 
                ? `\n⏱️ *Был недоступен:* ${res.offlineDurationMin} мин.` 
                : '';
              await telegram.sendMessage(
                config.OWNER_CHAT_ID,
                `🟢 *[Восстановлено] Сайт ожил!*\n\n` +
                  `🔗 *URL:* \`${cleanUrl}\`\n` +
                  `⚡ *Отклик:* ${res.latencyMs} мс.${durationText}`,
                { parse_mode: 'Markdown' }
              );
            }
          }
        } catch (err) {
          console.error(`Uptime check error for ${url}:`, err);
        }
      }
    },
    {
      scheduled: true,
      timezone: config.TZ,
    }
  );

  // 4. Проверка пропущенных бэкапов каждый час
  backupCheckJob = cron.schedule(
    '0 * * * *',
    async () => {
      const lastBackupStr = store.get('lastBackupTimestamp');
      if (!lastBackupStr) return;

      const lastBackup = new Date(lastBackupStr);
      const diffHours = (Date.now() - lastBackup.getTime()) / 1000 / 60 / 60;

      if (diffHours > 26) {
        const alreadySent = store.get('backupMissedAlertSent') || false;
        if (!alreadySent) {
          await telegram.sendMessage(
            config.OWNER_CHAT_ID,
            `⚠️ *[Резервное копирование] Пропущен бэкап!* 🚨\n\n` +
              `Последний успешный бэкап был получен более 26 часов назад:\n` +
              `⏱️ *${lastBackup.toLocaleString('ru-RU', { timeZone: config.TZ })}*\n\n` +
              `Пожалуйста, проверьте статус бэкап-планировщика на серверах.`,
            { parse_mode: 'Markdown' }
          );
          store.set('backupMissedAlertSent', true);
        }
      }
    },
    {
      scheduled: true,
      timezone: config.TZ,
    }
  );
}

/**
 * Останавливает все периодические задачи (для Graceful Shutdown)
 */
export function stopScheduler(): void {
  if (digestJob) digestJob.stop();
  if (heartbeatJob) heartbeatJob.stop();
  if (uptimeJob) uptimeJob.stop();
  if (backupCheckJob) backupCheckJob.stop();
  console.log('Scheduler cron jobs stopped successfully.');
}

/**
 * Проверяет, был ли пропущен утренний дайджест (если бот был выключен в 08:00)
 */
export async function checkMissedDigest(telegram: Telegram): Promise<void> {
  try {
    const lastDigestStr = store.get('lastDigestTimestamp');
    if (!lastDigestStr) return;

    const lastDigest = new Date(lastDigestStr);
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDay = new Date(lastDigest);
    lastDay.setHours(0, 0, 0, 0);

    const digestTimeToday = new Date();
    digestTimeToday.setHours(parseInt(config.DIGEST_HOUR, 10), parseInt(config.DIGEST_MINUTE, 10), 0, 0);

    if (
      today.getTime() !== lastDay.getTime() &&
      now.getTime() > digestTimeToday.getTime()
    ) {
      console.log('Missed digest detected, running now...');
      try {
        await morningDigest(telegram);
        await telegram.sendMessage(
          config.OWNER_CHAT_ID,
          '⏰ Дайджест за сегодня был пропущен (бот был офлайн). Вот сводка 👆'
        );
      } catch (e) {
        console.error('Missed digest run failed:', e);
      }
    }
  } catch (e) {
    console.error('Missed digest check error:', e);
  }
}
