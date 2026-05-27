import { store } from '../utils/store';

export interface UptimeCheckResult {
  url: string;
  isUp: boolean;
  statusCode: number;
  latencyMs: number;
  error?: string;
  statusChanged: boolean;
  offlineDurationMin?: number;
}

/**
 * Пингует одиночный URL и определяет, изменился ли его статус.
 * Результат сохраняется в локальный store.json для сохранения состояния и подсчета времени простоя.
 */
export async function checkUrl(url: string): Promise<UptimeCheckResult> {
  const start = Date.now();
  const currentStates = store.get('uptimeStates') || {};
  const prevState = currentStates[url] || { isUp: true };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 секунд тайм-аут

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Athena-Bot-Uptime-Monitor/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - start;
    const isUp = response.status >= 200 && response.status < 400;

    const statusChanged = prevState.isUp !== isUp;
    let offlineDurationMin: number | undefined;

    if (statusChanged) {
      if (!isUp) {
        currentStates[url] = { isUp, offlineSince: new Date().toISOString() };
      } else {
        if (prevState.offlineSince) {
          const diffMs = Date.now() - new Date(prevState.offlineSince).getTime();
          offlineDurationMin = Math.round(diffMs / 1000 / 60);
        }
        currentStates[url] = { isUp };
      }
      store.set('uptimeStates', currentStates);
    }

    return {
      url,
      isUp,
      statusCode: response.status,
      latencyMs,
      statusChanged,
      offlineDurationMin,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isUp = false;
    const statusChanged = prevState.isUp !== isUp;
    let offlineDurationMin: number | undefined;

    if (statusChanged) {
      currentStates[url] = { isUp, offlineSince: new Date().toISOString() };
      store.set('uptimeStates', currentStates);
    } else if (prevState.offlineSince) {
      const diffMs = Date.now() - new Date(prevState.offlineSince).getTime();
      offlineDurationMin = Math.round(diffMs / 1000 / 60);
    }

    return {
      url,
      isUp,
      statusCode: 0,
      latencyMs,
      error: err.name === 'AbortError' ? 'Timeout (8s)' : err.message || 'Network error',
      statusChanged,
      offlineDurationMin,
    };
  }
}

/**
 * Генерирует текстовый отчет по всем отслеживаемым сайтам для дайджеста.
 */
export async function getUptimeReport(urls: string[]): Promise<string> {
  if (urls.length === 0) {
    return 'ℹ️ Нет отслеживаемых сайтов. Добавьте MONITORED_URLS в .env.';
  }

  const currentStates = store.get('uptimeStates') || {};
  const lines: string[] = [];

  for (const url of urls) {
    // Убираем протокол для компактности отображения
    const cleanUrl = url.replace(/^https?:\/\//, '');
    const state = currentStates[url];
    
    if (!state) {
      lines.push(`• \`${cleanUrl}\`: 🔄 Ожидает проверки`);
      continue;
    }

    if (state.isUp) {
      lines.push(`• \`${cleanUrl}\`: ✅ OK`);
    } else {
      let durationStr = '';
      if (state.offlineSince) {
        const diffMs = Date.now() - new Date(state.offlineSince).getTime();
        const diffMin = Math.round(diffMs / 1000 / 60);
        durationStr = ` (офлайн ${diffMin} мин.)`;
      }
      lines.push(`• \`${cleanUrl}\`: 🔴 DOWN${durationStr}`);
    }
  }

  return lines.join('\n');
}
