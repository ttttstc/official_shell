import { resolveDefaultShell } from '../src/platform';

jest.mock('@actions/io', () => ({
  which: jest.fn(),
}));

import { which } from '@actions/io';

describe('platform.resolveDefaultShell', () => {
  const originalPlatform = process.platform;

  function setPlatform(p: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: p });
  }

  afterEach(() => {
    setPlatform(originalPlatform);
    jest.clearAllMocks();
  });

  it('Windows 返回 pwsh', async () => {
    setPlatform('win32');
    await expect(resolveDefaultShell()).resolves.toBe('pwsh');
  });

  it('非 Windows 且 bash 存在返回 bash', async () => {
    setPlatform('linux');
    (which as jest.Mock).mockResolvedValue('/usr/bin/bash');
    await expect(resolveDefaultShell()).resolves.toBe('bash');
  });

  it('非 Windows 且 bash 不存在降级 sh', async () => {
    setPlatform('linux');
    (which as jest.Mock).mockRejectedValue(new Error('not found'));
    await expect(resolveDefaultShell()).resolves.toBe('sh');
  });

  it('darwin bash 存在返回 bash', async () => {
    setPlatform('darwin');
    (which as jest.Mock).mockResolvedValue('/bin/bash');
    await expect(resolveDefaultShell()).resolves.toBe('bash');
  });
});
