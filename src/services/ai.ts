import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * Отправляет запрос в выбранный ИИ-сервис на основе доступных API ключей в .env.
 * Использует нативный fetch, благодаря чему весит 0 байт и поддерживает проксирование.
 */
export async function askGemini(prompt: string): Promise<string> {
  let systemInstruction = 
    'Ты — Афина (Athena), умный, лаконичный и опытный личный ассистент разработчика Даниила. ' +
    'Твоя цель — помогать с программированием, системным администрированием и повседневными задачами. ' +
    'Отвечай коротко, профессионально, по делу, с легким дружелюбием и технической точностью. ' +
    'Для оформления кода обязательно используй Markdown.';

  // Динамически загружаем контекст из AGENT.md, если файл существует.
  // Чтение на каждом запросе позволяет редактировать контекст "на лету" без перезапуска бота!
  try {
    const agentPath = path.join(process.cwd(), 'AGENT.md');
    if (fs.existsSync(agentPath)) {
      const customContext = fs.readFileSync(agentPath, 'utf-8');
      systemInstruction += '\n\n[ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ И ПРАВИЛА РАБОТЫ]:\n' + customContext;
    }
  } catch (err) {
    console.error('Failed to load AGENT.md:', err);
  }

  // 1. РЕЖИМ GROQ (Ультрабыстрый, работает из РФ напрямую без прокси)
  if (config.GROQ_API_KEY) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192', // Бесплатная, умная и молниеносная модель
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${await response.text()}`);
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || '❌ Пустой ответ от Groq.';
    } catch (err: any) {
      console.error('Groq API Error:', err);
      return `❌ Ошибка Groq API: ${err.message || 'Неизвестная ошибка'}`;
    }
  }

  // 2. РЕЖИМ OPENROUTER (Бесплатные модели Llama/Gemma, работает из РФ напрямую без прокси)
  if (config.OPENROUTER_API_KEY) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://github.com/athena-bot', // Обязательные заголовки для OpenRouter
          'X-Title': 'Athena Bot'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3-8b-instruct:free', // 100% бесплатная умная модель
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${await response.text()}`);
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || '❌ Пустой ответ от OpenRouter.';
    } catch (err: any) {
      console.error('OpenRouter API Error:', err);
      return `❌ Ошибка OpenRouter API: ${err.message || 'Неизвестная ошибка'}`;
    }
  }

  // 3. РЕЖИМ GOOGLE GEMINI (Через Cloudflare-прокси или напрямую)
  if (config.GEMINI_API_KEY) {
    try {
      // Если бот на сервере в РФ, используем Cloudflare Worker Proxy URL, заданный в .env
      const baseUrl = config.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';
      const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/gemini-1.5-flash:generateContent?key=${config.GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${await response.text()}`);
      }

      const data = await response.json() as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '❌ Пустой ответ от Gemini.';
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      return `❌ Ошибка Gemini API: ${err.message || 'Неизвестная ошибка API'}`;
    }
  }

  return '⚠️ Функция ИИ отключена. Пожалуйста, укажите GROQ_API_KEY, OPENROUTER_API_KEY или GEMINI_API_KEY в файле .env.';
}
