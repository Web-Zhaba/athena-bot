import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { store } from '../utils/store';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

interface CountResult {
  count: number;
  delta: number | null;
}

export async function getProfilesCount(): Promise<CountResult> {
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  const currentCount = count ?? 0;
  const lastCount = store.get('lastSupabaseCount');

  let delta: number | null = null;
  if (lastCount !== undefined) {
    delta = currentCount - lastCount;
  }

  store.set('lastSupabaseCount', currentCount);
  store.set('lastSupabaseTimestamp', new Date().toISOString());

  return { count: currentCount, delta };
}
