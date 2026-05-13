import http from 'http';
import { URL } from 'url';
import { google } from 'googleapis';
import { config } from '../src/config';

const PORT = 3000;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n=============================================');
console.log('1. Откройте эту ссылку в браузере:');
console.log(authUrl);
console.log('\n2. Авторизуйтесь и разрешите доступ к Calendar.');
console.log(`3. Браузер перенаправит на localhost — это нормально.`);
console.log('4. Скрипт автоматически поймает код и выдаст токены.\n');
console.log('=============================================\n');

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = req.url ?? '/';
    if (!requestUrl.startsWith('/oauth2callback')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const parsedUrl = new URL(requestUrl, `http://127.0.0.1:${PORT}`);
    const code = parsedUrl.searchParams.get('code');
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Ошибка: ${error}</h1><p>Можете закрыть вкладку и проверить терминал.</p>`);
      console.error('\n❌ OAuth Error:', error);
      server.close();
      process.exit(1);
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Код не найден</h1>');
      console.error('\n❌ Authorization code not found in callback.');
      server.close();
      process.exit(1);
      return;
    }

    console.log('\n✅ Код получен. Меняю на токены...\n');

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <h1>Авторизация успешна!</h1>
      <p>Можете закрыть эту вкладку и вернуться в терминал.</p>
    `);

    server.close();

    console.log('✅ Токены получены!');
    console.log('\nAccess Token:', tokens.access_token);
    console.log('\n📝 ВАЖНО: Скопируйте этот Refresh Token в .env файл:');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);

    if (!tokens.refresh_token) {
      console.log('\n⚠️ Внимание: Refresh token не получен.');
      console.log('Это значит, что вы раньше уже авторизовывали это приложение.');
      console.log('1. Зайдите на https://myaccount.google.com/permissions');
      console.log('2. Найдите ваше приложение и удалите доступ.');
      console.log('3. Запустите скрипт снова.');
    } else {
      console.log('\n🎉 Готово! Добавьте этот токен в .env и запускайте бота.');
    }

    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    console.error('\n❌ Error exchanging code:', err);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Ошибка сервера</h1>');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Сервер слушает на http://127.0.0.1:${PORT} для перехвата OAuth callback...`);
});
