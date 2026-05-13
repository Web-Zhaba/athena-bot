import { google } from 'googleapis';
import { config } from '../config';

const oauth2Client = new google.auth.OAuth2(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

oauth2Client.setCredentials({
  refresh_token: config.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
}

function getDateRange(date: Date): { start: string; end: string } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function fetchEvents(date: Date): Promise<CalendarEvent[]> {
  const range = getDateRange(date);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: range.start,
    timeMax: range.end,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Europe/Moscow',
    maxResults: 50,
  });

  const items = response.data.items ?? [];

  return items.map((item) => {
    const isAllDay = !!item.start?.date;
    const startRaw = item.start?.dateTime ?? item.start?.date ?? '';
    const endRaw = item.end?.dateTime ?? item.end?.date ?? '';

    return {
      summary: item.summary ?? '(Без названия)',
      start: startRaw,
      end: endRaw,
      isAllDay,
    };
  });
}

function wrapGoogleError(err: any): Error {
  const msg = err?.response?.data?.error ?? err?.message ?? String(err);
  if (typeof msg === 'string' && msg.includes('invalid_grant')) {
    return new Error('GOOGLE_INVALID_GRANT');
  }
  if (err?.response?.data?.error === 'invalid_grant') {
    return new Error('GOOGLE_INVALID_GRANT');
  }
  if (err?.errors?.[0]?.reason === 'authError') {
    return new Error('GOOGLE_INVALID_GRANT');
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function getEventsForDate(date: Date): Promise<CalendarEvent[]> {
  try {
    return await fetchEvents(date);
  } catch (err) {
    throw wrapGoogleError(err);
  }
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  return getEventsForDate(new Date());
}

export async function getTomorrowEvents(): Promise<CalendarEvent[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getEventsForDate(tomorrow);
}

function formatTime(iso: string, isAllDay: boolean): string {
  if (isAllDay) return '📅 Весь день';

  const date = new Date(iso);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: config.TZ,
  });
}

export function formatEvents(events: CalendarEvent[]): string {
  if (events.length === 0) return 'Нет событий';

  return events
    .map((e) => {
      const time = formatTime(e.start, e.isAllDay);
      return `• ${time} — ${e.summary}`;
    })
    .join('\n');
}
