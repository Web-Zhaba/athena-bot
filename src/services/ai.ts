import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * Отправляет запрос в выбранный ИИ-сервис на основе доступных API ключей в .env.
 * В случае сбоя или геоблокировки (например, HTTP 403 в РФ для Groq) автоматически
 * переключается на резервных провайдеров в порядке: Groq -> OpenRouter -> Gemini (proxy).
 */
export async function askGemini(prompt: string): Promise<string> {
  let systemInstruction = 
    'Ты — Афина (Athena), умный, лаконичный и опытный личный ассистент разработчика Даниила. ' +
    'Твоя цель — помогать с программированием, системным администрированием и повседневными задачами. ' +
    'Отвечай коротко, профессионально, по делу, с легким дружелюбием и технической точностью. ' +
    'Для оформления кода обязательно используй Markdown.';

  // Динамически загружаем контекст из AGENT.md, если файл существует.
  try {
    const agentPath = path.join(process.cwd(), 'AGENT.md');
    if (fs.existsSync(agentPath)) {
      const customContext = fs.readFileSync(agentPath, 'utf-8');
      systemInstruction += '\n\n[ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ И ПРАВИЛА РАБОТЫ]:\n' + customContext;
    }
  } catch (err) {
    console.error('Failed to load AGENT.md:', err);
  }

  // --- ПОПЫТКА 1: GROQ ---
  if (config.GROQ_API_KEY) {
    try {
      const baseUrl = config.GROQ_API_BASE_URL || 'https://api.groq.com';
      const url = `${baseUrl.replace(/\/$/, '')}/openai/v1/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
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
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        console.log('[AI Engine] Successfully generated response via Groq.');
        return content;
      }
    } catch (err: any) {
      console.warn(`[AI Engine] Groq failed, attempting fallback. Error: ${err.message || err}`);
    }
  }

  // --- ПОПЫТКА 2: OPENROUTER ---
  if (config.OPENROUTER_API_KEY) {
    try {
      console.log('[AI Engine] Attempting generation via OpenRouter...');
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://github.com/athena-bot',
          'X-Title': 'Athena Bot'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3-8b-instruct:free',
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
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        console.log('[AI Engine] Successfully generated response via OpenRouter.');
        return content;
      }
    } catch (err: any) {
      console.warn(`[AI Engine] OpenRouter failed, attempting fallback. Error: ${err.message || err}`);
    }
  }

  // --- ПОПЫТКА 3: GOOGLE GEMINI (Через твой Cloudflare прокси) ---
  if (config.GEMINI_API_KEY) {
    try {
      console.log('[AI Engine] Attempting generation via Gemini (Proxy)...');
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
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        console.log('[AI Engine] Successfully generated response via Gemini.');
        return content;
      }
    } catch (err: any) {
      console.error(`[AI Engine] Gemini proxy failed as well. Error: ${err.message || err}`);
    }
  }

  return '❌ Все ИИ-провайдеры (Groq, OpenRouter, Gemini) завершились с ошибкой или не были настроены. Пожалуйста, проверьте логи сервера и ключи в .env.';
}
