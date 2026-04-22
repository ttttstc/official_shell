import { which } from '@actions/io';

export async function resolveDefaultShell(): Promise<string> {
  if (process.platform === 'win32') {
    return 'pwsh';
  }

  try {
    await which('bash', true);
    return 'bash';
  } catch {
    return 'sh';
  }
}
