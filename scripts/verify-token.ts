import { google } from 'googleapis';
import { config } from '../src/config';

const oauth2Client = new google.auth.OAuth2(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

oauth2Client.setCredentials({
  refresh_token: config.GOOGLE_REFRESH_TOKEN,
});

async function run() {
  try {
    console.log('Запрашиваю временный Access Token через Refresh Token...');
    const { token } = await oauth2Client.getAccessToken();
    if (!token) {
      throw new Error('Не удалось получить Access Token');
    }
    console.log('Access Token успешно получен!');
    console.log('Проверяю токен в Google...');
    const tokenInfo = await oauth2Client.getTokenInfo(token);
    
    console.log('\n=== РЕЗУЛЬТАТЫ ПРОВЕРКИ ТОКЕНА ===');
    console.log(`Email аккаунта: ${tokenInfo.email ?? 'Не указан'}`);
    console.log('Разрешенные доступы (Scopes):');
    tokenInfo.scopes.forEach(scope => console.log(` - ${scope}`));
    
    const hasAnalytics = tokenInfo.scopes.includes('https://www.googleapis.com/auth/analytics.readonly');
    if (!hasAnalytics) {
      console.log('\n⚠️ ВНИМАНИЕ: Доступ к Google Analytics НЕ разрешен в этом токене!');
      console.log('При прохождении авторизации в браузере вы, скорее всего, забыли поставить галочку напротив доступа к данным Google Analytics.');
    } else {
      console.log('\n✅ Доступ к Google Analytics присутствует в токене!');
    }
  } catch (err: any) {
    console.error('\n❌ Ошибка при проверке токена:', err.message || err);
  }
}

run();
