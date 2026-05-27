import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SystemMetrics {
  cpuLoad: number[];
  ramTotalGb: number;
  ramUsedGb: number;
  ramPercentage: number;
  diskTotalGb: number;
  diskFreeGb: number;
  diskUsedPercentage: number;
}

/**
 * Получает метрики здоровья сервера (CPU Load, RAM, Disk Space).
 * Поддерживает как Linux (VPS), так и Windows (локальная разработка).
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  // 1. Оперативная память (RAM)
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramTotalGb = Number((totalMem / 1024 / 1024 / 1024).toFixed(1));
  const ramUsedGb = Number((usedMem / 1024 / 1024 / 1024).toFixed(1));
  const ramPercentage = Math.round((usedMem / totalMem) * 100);

  // 2. Средняя загрузка CPU (Load Average за 1, 5, 15 мин)
  const cpuLoad = os.loadavg().map(v => Number(v.toFixed(2)));

  // 3. Дисковое пространство (SSD)
  let diskTotalGb = 0;
  let diskFreeGb = 0;
  let diskUsedPercentage = 0;

  if (os.platform() === 'win32') {
    // В Windows используем wmic для диска C:
    try {
      const { stdout } = await execAsync('wmic logicaldisk where "DeviceID=\'C:\'" get size,freespace');
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const [freeStr, totalStr] = lines[1].trim().split(/\s+/);
        const freeBytes = parseInt(freeStr, 10);
        const totalBytes = parseInt(totalStr, 10);
        
        if (!isNaN(freeBytes) && !isNaN(totalBytes) && totalBytes > 0) {
          diskTotalGb = Number((totalBytes / 1024 / 1024 / 1024).toFixed(1));
          diskFreeGb = Number((freeBytes / 1024 / 1024 / 1024).toFixed(1));
          diskUsedPercentage = Math.round(((totalBytes - freeBytes) / totalBytes) * 100);
        }
      }
    } catch (e) {
      console.error('Failed to get Windows disk space:', e);
      // fallback
      diskTotalGb = 100;
      diskFreeGb = 50;
      diskUsedPercentage = 50;
    }
  } else {
    // В Linux (VPS) используем стандартную df -k /
    try {
      const { stdout } = await execAsync("df -k / | tail -1 | awk '{print $2,$4,$5}'");
      const [totalKb, freeKb, usedPercentStr] = stdout.trim().split(/\s+/);
      const totalBytes = parseInt(totalKb, 10) * 1024;
      const freeBytes = parseInt(freeKb, 10) * 1024;
      
      if (!isNaN(totalBytes) && !isNaN(freeBytes) && totalBytes > 0) {
        diskTotalGb = Number((totalBytes / 1024 / 1024 / 1024).toFixed(1));
        diskFreeGb = Number((freeBytes / 1024 / 1024 / 1024).toFixed(1));
        diskUsedPercentage = parseInt(usedPercentStr.replace('%', ''), 10);
      }
    } catch (e) {
      console.error('Failed to get Linux disk space:', e);
    }
  }

  return {
    cpuLoad,
    ramTotalGb,
    ramUsedGb,
    ramPercentage,
    diskTotalGb,
    diskFreeGb,
    diskUsedPercentage,
  };
}
