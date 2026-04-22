import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { ShellConfig } from './shell-config';

export function createScriptFile(script: string, config: ShellConfig): string {
  const tempDir = process.env.RUNNER_TEMP || os.tmpdir();
  const fileName = `${crypto.randomUUID()}${config.extension}`;
  const filePath = path.join(tempDir, fileName);

  const content = [config.prepend, script, config.append]
    .filter((part) => part && part.length > 0)
    .join('\n');

  fs.writeFileSync(filePath, content, { encoding: 'utf-8' });

  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }

  return filePath;
}

export function cleanupScriptFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // 清理失败不阻塞流程
  }
}
