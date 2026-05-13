import { Context } from 'telegraf';
import { morningDigest } from '../jobs/morningDigest';

export async function digestCommand(ctx: Context) {
  await ctx.reply('⏳ Формирую утренний дайджест...');
  try {
    await morningDigest(ctx.telegram);
  } catch (err) {
    console.error('Manual digest error:', err);
    await ctx.reply('❌ Не удалось сформировать дайджест.');
  }
}
