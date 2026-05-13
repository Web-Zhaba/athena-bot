import axios from 'axios';
import { config } from '../config';

const vercelApi = axios.create({
  baseURL: 'https://api.vercel.com',
  headers: {
    Authorization: `Bearer ${config.VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: string;
  createdAt: number;
  readyState?: string;
  creator?: { username?: string };
}

interface VercelAnalytics {
  visitors?: number;
  online?: number;
  available: boolean;
}

interface VercelStats {
  projectName: string;
  latestDeployment: {
    url: string;
    state: string;
    createdAt: string;
    creator: string;
  } | null;
  projectUrl: string;
  analytics: VercelAnalytics;
}

export async function getVercelStats(): Promise<VercelStats> {
  const projectPath = config.VERCEL_TEAM_ID
    ? `/v9/projects/${config.VERCEL_PROJECT_ID}?teamId=${config.VERCEL_TEAM_ID}`
    : `/v9/projects/${config.VERCEL_PROJECT_ID}`;

  const { data: project } = await vercelApi.get(projectPath);

  const deploymentsPath = config.VERCEL_TEAM_ID
    ? `/v6/deployments?projectId=${config.VERCEL_PROJECT_ID}&limit=1&teamId=${config.VERCEL_TEAM_ID}`
    : `/v6/deployments?projectId=${config.VERCEL_PROJECT_ID}&limit=1`;

  const { data: deploymentsData } = await vercelApi.get(deploymentsPath);
  const deployments: VercelDeployment[] = deploymentsData.deployments ?? [];

  const latest = deployments[0] ?? null;

  const stateMap: Record<string, string> = {
    READY: '✅ Успешен',
    ERROR: '❌ Ошибка',
    CANCELED: '🚫 Отменён',
    BUILDING: '🔨 Собирается',
    QUEUED: '⏳ В очереди',
  };

  // Analytics
  let analytics: VercelAnalytics = { available: false };
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();

    const analyticsPath = config.VERCEL_TEAM_ID
      ? `/v9/projects/${config.VERCEL_PROJECT_ID}/analytics?from=${from}&to=${to}&teamId=${config.VERCEL_TEAM_ID}`
      : `/v9/projects/${config.VERCEL_PROJECT_ID}/analytics?from=${from}&to=${to}`;

    const { data: analyticsData } = await vercelApi.get(analyticsPath);
    analytics.visitors = analyticsData?.data?.[0]?.visitors ?? analyticsData?.visitors ?? analyticsData?.total;
    analytics.available = true;
  } catch (err: any) {
    if (err.response?.status === 403 || err.response?.status === 404) {
      analytics.available = false;
    } else {
      console.error('Vercel analytics fetch error:', err.message);
    }
  }

  // Current online (best-effort)
  try {
    const currentPath = config.VERCEL_TEAM_ID
      ? `/v9/projects/${config.VERCEL_PROJECT_ID}/analytics/current?teamId=${config.VERCEL_TEAM_ID}`
      : `/v9/projects/${config.VERCEL_PROJECT_ID}/analytics/current`;
    const { data: currentData } = await vercelApi.get(currentPath);
    analytics.online = currentData?.current ?? currentData?.visitors?.current;
  } catch {
    // silently ignore
  }

  return {
    projectName: project.name ?? config.VERCEL_PROJECT_ID,
    latestDeployment: latest
      ? {
          url: latest.url,
          state: stateMap[latest.state] ?? latest.state,
          createdAt: new Date(latest.createdAt).toLocaleString('ru-RU', {
            timeZone: config.TZ,
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
          creator: latest.creator?.username ?? 'unknown',
        }
      : null,
    projectUrl: project.latestDeployment?.url
      ? `https://${project.latestDeployment.url}`
      : `https://${project.name}.vercel.app`,
    analytics,
  };
}

export function formatVercelStats(stats: VercelStats): string {
  let msg = `🚀 Проект: ${stats.projectName}\n`;
  msg += `🔗 URL: ${stats.projectUrl}\n`;

  if (stats.latestDeployment) {
    msg += `\n📦 Последний деплой:\n`;
    msg += `${stats.latestDeployment.state}\n`;
    msg += `Время: ${stats.latestDeployment.createdAt}\n`;
    msg += `Deployer: ${stats.latestDeployment.creator}`;
  } else {
    msg += '\n⚠️ Деплоев не найдено';
  }

  if (stats.analytics.available) {
    if (stats.analytics.visitors !== undefined) {
      msg += `\n\n📊 Посетителей за 24ч: ${stats.analytics.visitors}`;
    }
    if (stats.analytics.online !== undefined && stats.analytics.online !== null) {
      msg += `\n👀 Онлайн сейчас: ${stats.analytics.online}`;
    }
  } else {
    msg += '\n\nℹ️ Детальная аналитика Vercel недоступна на текущем тарифе через API';
  }

  return msg;
}
