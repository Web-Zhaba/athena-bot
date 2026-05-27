import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

interface StoreData {
  lastSupabaseCount?: number;
  lastSupabaseTimestamp?: string;
  lastDigestTimestamp?: string;
  lastHeartbeatTimestamp?: string;
  defaultCity?: string;
  uptimeStates?: Record<string, { isUp: boolean; offlineSince?: string }>;
  lastBackupTimestamp?: string;
  backupMissedAlertSent?: boolean;
}

function readStore(): StoreData {
  if (!fs.existsSync(STORE_PATH)) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return {};
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw) as StoreData;
  } catch {
    return {};
  }
}

function writeStore(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export const store = {
  get<K extends keyof StoreData>(key: K): StoreData[K] {
    return readStore()[key];
  },
  set<K extends keyof StoreData>(key: K, value: StoreData[K]): void {
    const data = readStore();
    data[key] = value;
    writeStore(data);
  },
};
