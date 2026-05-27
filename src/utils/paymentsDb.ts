import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PAYMENTS_PATH = path.join(DATA_DIR, 'payments.json');

export interface PaymentTransaction {
  date: string;
  project: string;
  amount: number;
  currency: string;
  email?: string;
  plan?: string;
  provider?: string;
}

/**
 * Читает лог оплат из отдельного JSON-файла
 */
export function getPayments(): PaymentTransaction[] {
  if (!fs.existsSync(PAYMENTS_PATH)) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return [];
  }
  try {
    const raw = fs.readFileSync(PAYMENTS_PATH, 'utf-8');
    return JSON.parse(raw) as PaymentTransaction[];
  } catch {
    return [];
  }
}

/**
 * Записывает лог оплат в отдельный JSON-файл
 */
function writePayments(payments: PaymentTransaction[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PAYMENTS_PATH, JSON.stringify(payments, null, 2));
}

/**
 * Добавляет новую оплату в изолированную локальную базу
 */
export const paymentsDb = {
  getPayments,
  
  addPayment(transaction: Omit<PaymentTransaction, 'date'>): void {
    const payments = getPayments();
    const newTx: PaymentTransaction = {
      ...transaction,
      date: new Date().toISOString(),
    };
    payments.push(newTx);
    
    // Ограничиваем список последними 100 транзакциями
    let updatedPayments = payments;
    if (payments.length > 100) {
      updatedPayments = payments.slice(-100);
    }
    
    writePayments(updatedPayments);
  }
};
