import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  OWNER_CHAT_ID: z.string().min(1, 'OWNER_CHAT_ID is required'),

  OPENWEATHER_API_KEY: z.string().min(1, 'OPENWEATHER_API_KEY is required'),
  OPENWEATHER_CITY: z.string().default('Cherepovets,ru'),

  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_REFRESH_TOKEN: z.string().min(1, 'GOOGLE_REFRESH_TOKEN is required'),

  VERCEL_TOKEN: z.string().min(1, 'VERCEL_TOKEN is required'),
  VERCEL_PROJECT_ID: z.string().min(1, 'VERCEL_PROJECT_ID is required'),
  VERCEL_TEAM_ID: z.string().optional(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),

  TZ: z.string().default('Europe/Moscow'),
  DIGEST_HOUR: z.string().default('08'),
  DIGEST_MINUTE: z.string().default('00'),

  GA4_PROPERTY_ID: z.string().optional(),
  GA4_SERVICE_ACCOUNT_PATH: z.string().optional(),

  CF_API_TOKEN: z.string().optional(),
  CF_ZONE_ID: z.string().optional(),

  MODE: z.enum(['standalone', 'backend']).default('standalone'),
  PORT: z.string().default('3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
