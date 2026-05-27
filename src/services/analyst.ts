import { getGa4YesterdayDetails } from './ga4';
import { getPayments, PaymentTransaction } from '../utils/paymentsDb';
import { askGemini } from './ai';

/**
 * Собирает показатели GA4 и данные по вчерашним оплатам, анонимизирует конфиденциальные поля
 * и генерирует краткий интеллектуальный бизнес-отчет с помощью ИИ.
 */
export async function getDailyBusinessDigest(): Promise<string> {
  try {
    // 1. Получаем вчерашнюю дату в формате YYYY-MM-DD
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // 2. Получаем данные Google Analytics 4 за вчера
    const ga4Data = await getGa4YesterdayDetails();

    // 3. Вытаскиваем вчерашние оплаты из изолированной базы оплат
    const allPayments = getPayments() || [];
    const yesterdayPayments = allPayments.filter((p: PaymentTransaction) => 
      p.date && p.date.startsWith(yesterdayStr)
    );

    // Если нет ключа GA4 и нет продаж, пропускаем ИИ-анализ
    if (!ga4Data && yesterdayPayments.length === 0) {
      return '';
    }

    // 4. Считаем статистику по продажам
    const totalAmount = yesterdayPayments.reduce((sum, p) => sum + p.amount, 0);
    const salesCount = yesterdayPayments.length;
    
    // Группируем по тарифам
    const plansSummary = yesterdayPayments.reduce((acc, p) => {
      const plan = p.plan || 'Базовый';
      acc[plan] = (acc[plan] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 5. Формируем анонимизированный JSON-пакет для искусственного интеллекта
    const analyticsPayload = {
      date: yesterdayStr,
      googleAnalytics: ga4Data ? {
        activeUsers24h: ga4Data.activeUsers,
        pageViews24h: ga4Data.pageViews,
        sessions24h: ga4Data.sessions,
        topVisitedPages: ga4Data.topPages,
        topUserCountries: ga4Data.topCountries,
      } : 'Нет данных GA4',
      sales: {
        totalRevenueYesterday: totalAmount,
        transactionsCount: salesCount,
        currency: yesterdayPayments[0]?.currency || 'RUB',
        salesDetails: yesterdayPayments.map(p => ({
          project: p.project,
          amount: p.amount,
          plan: p.plan,
          email: p.email ? p.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'anonymous', // скрываем email
        })),
        plansBreakdown: plansSummary,
      }
    };

    // 6. Промпт для ИИ-аналитика
    const prompt = 
      `Проанализируй вчерашнюю активность и продажи SaaS-сервиса "Nodes" и напиши краткий, емкий технико-коммерческий отчет для разработчика Даниила.\n\n` +
      `Данные за вчерашний день (${yesterdayStr}):\n` +
      `\`\`\`json\n${JSON.stringify(analyticsPayload, null, 2)}\n\`\`\`\n\n` +
      `Требования к отчету:\n` +
      `- Пиши строго на русском языке, профессионально, кратко, без приветствий («Конечно!», «Рада помочь»).\n` +
      `- Сделай выводы о посещаемости (активные юзеры, вовлеченность, популярные страницы).\n` +
      `- Проанализируй продажи в связке с трафиком (конверсия, выручка, популярные тарифы). Подчеркни аномалии, если есть.\n` +
      `- Дай 1-2 практические микро-рекомендации по продукту Nodes или воронке.\n` +
      `- Ограничься объемом в 2-3 коротких абзаца. Используй аккуратное Markdown форматирование.`;

    const aiReport = await askGemini(prompt);
    
    return aiReport || '❌ Не удалось сгенерировать ИИ-отчет.';
  } catch (err) {
    console.error('Failed to generate daily business digest:', err);
    return '❌ Ошибка при составлении ИИ-анализа бизнеса.';
  }
}
