# Деплой Афины на VPS с OpenClaw (один Telegram-бот)

## Архитектура

- **OpenClaw Gateway** — единственный процесс, который получает сообщения из Telegram (polling/webhook). Он же отвечает на вопросы как AI-ассистент.
- **Athena (backend mode)** — фоновый сервис: cron-дайджесты + HTTP API. Она отправляет сообщения через Telegram Bot API, но **не слушает** updates (не делает polling).

Это позволяет использовать **один BOT_TOKEN** для обоих сервисов без конфликтов.

---

## 1. Подготовка VPS

Убедитесь, что установлены Docker и Docker Compose:

```bash
docker --version
docker compose version
```

---

## 2. Копирование проекта на VPS

```bash
# На локальной машине:
scp -r . user@your-vps-ip:/opt/athena-bot

# На VPS:
ssh user@your-vps-ip
cd /opt/athena-bot
```

---

## 3. Настройка .env

```bash
cp .env.example .env
nano .env
```

Обязательно заполните **все** переменные. Ключевые для интеграции:

```env
# Тот же токен, который использует OpenClaw
BOT_TOKEN=your_bot_token_here
OWNER_CHAT_ID=1440329158

# Режим backend — Афина не будет делать polling
MODE=backend
PORT=3000

# Остальные API-ключи...
OPENWEATHER_API_KEY=...
GOOGLE_CLIENT_ID=...
VERCEL_TOKEN=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

**Важно:** `MODE=backend` — обязательно для совместной работы с OpenClaw.

---

## 4. Запуск Афины

```bash
cd /opt/athena-bot
docker compose up -d --build
```

Проверьте, что API работает:

```bash
curl http://localhost:3001/health
```

Должен вернуть:
```json
{"status":"ok","mode":"backend","timestamp":"..."}
```

Логи:
```bash
docker compose logs -f athena-bot
```

---

## 5. Настройка OpenClaw Gateway

OpenClaw Gateway управляет Telegram-ботом. Нужно настроить его так, чтобы он вызывал API Афины по нужным командам.

### Вариант A: OpenClaw на хосте (не в Docker)

OpenClaw сможет обращаться к Афине по `http://localhost:3001`.

### Вариант B: OpenClaw в Docker

Если OpenClaw тоже в Docker, подключите оба сервиса к одной сети.

В `docker-compose.yml` Афины раскомментируйте:

```yaml
networks:
  openclaw-network:
    external: true
```

Создайте сеть (один раз):

```bash
docker network create openclaw-network
```

И перезапустите:

```bash
docker compose up -d
```

В настройках OpenClaw (где он вызывает API Афины) используйте:
- `http://athena-bot:3000/api/...` (если в одной Docker-сети)
- `http://host.docker.internal:3001/api/...` (Docker Desktop)
- `http://<vps-ip>:3001/api/...` (если порт открыт)

---

## 6. Интеграция команд через OpenClaw Skills / Bash

OpenClaw умеет вызывать bash-команды (tool `bash`). Настройте его так, чтобы при командах `/weather`, `/calendar`, `/stats`, `/digest` он делал `curl` к API Афины и отправлял результат в Telegram.

### Примеры вызовов API Афины

```bash
# Погода
curl -s "http://localhost:3001/api/weather?city=Москва&days=0"
# => { "success": true, "text": "☀️ Погода в Moscow..." }

# Прогноз
curl -s "http://localhost:3001/api/weather?city=Москва&days=3"

# Календарь
curl -s "http://localhost:3001/api/calendar"
curl -s "http://localhost:3001/api/calendar?date=tomorrow"

# Статистика
curl -s "http://localhost:3001/api/stats"

# Запустить дайджест сейчас
curl -s -X POST "http://localhost:3001/api/digest"

# Отправить произвольное сообщение
curl -s -X POST "http://localhost:3001/api/notify" \
  -H "Content-Type: application/json" \
  -d '{"message":"Привет от OpenClaw!"}'

# Установить город по умолчанию
curl -s -X POST "http://localhost:3001/api/setcity" \
  -H "Content-Type: application/json" \
  -d '{"city":"Санкт-Петербург"}'
```

### Skill для OpenClaw (рекомендуется)

Создайте файл на VPS в workspace OpenClaw:

```bash
mkdir -p ~/.openclaw/workspace/skills/athena
cat > ~/.openclaw/workspace/skills/athena/SKILL.md << 'EOF'
# Athena Integration Skill

Whenever the user asks for weather, calendar, stats, or digest, use the Athena backend API running at http://localhost:3001.

## Tools
- bash: use `curl -s http://localhost:3001/api/...` to fetch data
- Always format the JSON `text` field nicely for the user

## Commands mapping
- /weather [city] [days] → GET /api/weather?city=...&days=...
- /calendar [date] → GET /api/calendar?date=...
- /stats → GET /api/stats
- /digest → POST /api/digest (then confirm to user)
- /setcity <city> → POST /api/setcity
EOF
```

Перезапустите OpenClaw Gateway или подождите, пока он подхватит skill.

---

## 7. Cron-дайджесты

В режиме `backend` Афина продолжает автоматически отправлять утренний дайджест по расписанию (`DIGEST_HOUR`:`DIGEST_MINUTE` в `.env`). OpenClaw не участвует в этом — дайджест приходит напрямую от Афины в ваш `OWNER_CHAT_ID`.

Если дайджест был пропущен (VPS был выключен), Афина отправит его сразу после старта с пометкой "⏰ Дайджест за сегодня был пропущен".

---

## 8. Безопасность

1. **Порт API** (`3001`) должен быть доступен только локально (`127.0.0.1:3001`). Не открывайте его наружу без reverse proxy и авторизации.
2. **`.env`**: установите права:
   ```bash
   chmod 600 /opt/athena-bot/.env
   ```
3. **Firewall**: убедитесь, что порт 3001 закрыт извне:
   ```bash
   sudo ufw deny 3001
   ```

---

## 9. Обновление

```bash
cd /opt/athena-bot
git pull  # или scp новые файлы заново
docker compose up -d --build
```

---

## 10. Типовые проблемы

### Афина пишет "Режим: backend" но команды не работают
В режиме backend Афина **не обрабатывает** команды из Telegram напрямую. Убедитесь, что OpenClaw Gateway настроен на вызов API.

### Конфликт polling: `Conflict: terminated by other getUpdates request`
Значит, Афина запущена в режиме `standalone` (polling), а OpenClaw тоже делает polling. Проверьте `MODE=backend` в `.env` и перезапустите:
```bash
docker compose down
docker compose up -d
```

### OpenClaw не видит API Афины
Проверьте доступность из контейнера OpenClaw:
```bash
docker exec -it <openclaw-container> curl http://athena-bot:3000/health
```

---

## Команды управления

```bash
# Статус
docker compose ps

# Логи
docker compose logs -f athena-bot

# Перезапуск
docker compose restart athena-bot

# Остановка
docker compose down

# Проверка API
curl http://localhost:3001/health
curl http://localhost:3001/api/stats
```
