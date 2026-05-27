import { google } from 'googleapis';
import fs from 'fs';
import { config } from '../config';

let auth: any = null;

function getAuth() {
  if (auth) return auth;
  
  // 1. Try Service Account if configured and file exists
  if (config.GA4_SERVICE_ACCOUNT_PATH && fs.existsSync(config.GA4_SERVICE_ACCOUNT_PATH)) {
    const keyFile = JSON.parse(fs.readFileSync(config.GA4_SERVICE_ACCOUNT_PATH, 'utf-8'));
    auth = new google.auth.GoogleAuth({
      credentials: keyFile,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    return auth;
  }

  // 2. Fallback to User OAuth2 using calendar credentials
  const oauth2Client = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({
    refresh_token: config.GOOGLE_REFRESH_TOKEN,
  });

  auth = oauth2Client;
  return auth;
}

interface Ga4Stats {
  activeUsers: number;
  pageViews: number;
  sessions: number;
}

export async function getGa4Stats(): Promise<Ga4Stats | null> {
  if (!config.GA4_PROPERTY_ID) {
    return null;
  }

  const analytics = google.analyticsdata({ version: 'v1beta', auth: getAuth() });
  const todayIso = new Date().toISOString().split('T')[0];

  const response = await analytics.properties.runReport({
    property: `properties/${config.GA4_PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: todayIso, endDate: todayIso }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'screenPageViews' },
        { name: 'sessions' },
      ],
    },
  });

  const row = response.data.rows?.[0];
  if (!row) {
    return { activeUsers: 0, pageViews: 0, sessions: 0 };
  }

  const values = row.metricValues ?? [];
  return {
    activeUsers: parseInt(values[0]?.value ?? '0', 10),
    pageViews: parseInt(values[1]?.value ?? '0', 10),
    sessions: parseInt(values[2]?.value ?? '0', 10),
  };
}
