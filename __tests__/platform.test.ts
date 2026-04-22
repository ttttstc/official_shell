import { resolveDefaultShell, resolvePythonCommand } from '../src/platform';

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

  it('Windows 且 pwsh 存在返回 pwsh', async () => {
    setPlatform('win32');
    (which as jest.Mock).mockResolvedValue('C:/pwsh.exe');
    await expect(resolveDefaultShell()).resolves.toBe('pwsh');
  });

  it('Windows 且 pwsh 不存在降级 powershell（Desktop）', async () => {
    setPlatform('win32');
    (which as jest.Mock).mockRejectedValue(new Error('not found'));
    await expect(resolveDefaultShell()).resolves.toBe('powershell');
  });

  it('非 Windows 且 bash 存在返回 default-bash（bash -e 模板，与显式 shell: bash 不同）', async () => {
    setPlatform('linux');
    (which as jest.Mock).mockResolvedValue('/usr/bin/bash');
    await expect(resolveDefaultShell()).resolves.toBe('default-bash');
  });

  it('非 Windows 且 bash 不存在降级 sh', async () => {
    setPlatform('linux');
    (which as jest.Mock).mockRejectedValue(new Error('not found'));
    await expect(resolveDefaultShell()).resolves.toBe('sh');
  });

  it('darwin bash 存在返回 default-bash', async () => {
    setPlatform('darwin');
    (which as jest.Mock).mockResolvedValue('/bin/bash');
    await expect(resolveDefaultShell()).resolves.toBe('default-bash');
  });
});

describe('platform.resolvePythonCommand', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('python 存在时返回 python', async () => {
    (which as jest.Mock).mockResolvedValue('/usr/bin/python');
    await expect(resolvePythonCommand()).resolves.toBe('python');
  });

  it('python 不存在但 python3 存在时降级 python3', async () => {
    (which as jest.Mock)
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce('/usr/bin/python3');
    await expect(resolvePythonCommand()).resolves.toBe('python3');
  });

  it('python 与 python3 都不存在时返回 python（让 spawn 报清晰错误）', async () => {
    (which as jest.Mock).mockRejectedValue(new Error('not found'));
    await expect(resolvePythonCommand()).resolves.toBe('python');
  });
});
