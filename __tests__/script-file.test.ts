import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createScriptFile, cleanupScriptFile } from '../src/script-file';
import { BUILTIN_SHELLS, ShellConfig } from '../src/shell-config';

describe('script-file', () => {
  let tempDir: string;
  const originalRunnerTemp = process.env.RUNNER_TEMP;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-exec-test-'));
    process.env.RUNNER_TEMP = tempDir;
  });

  afterEach(() => {
    if (originalRunnerTemp === undefined) {
      delete process.env.RUNNER_TEMP;
    } else {
      process.env.RUNNER_TEMP = originalRunnerTemp;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('生成文件在 RUNNER_TEMP 目录下', () => {
    const filePath = createScriptFile('echo hi', BUILTIN_SHELLS.bash);
    expect(path.dirname(filePath)).toBe(tempDir);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('文件扩展名来自 config', () => {
    const bashFile = createScriptFile('echo hi', BUILTIN_SHELLS.bash);
    expect(bashFile.endsWith('.sh')).toBe(true);

    const pyFile = createScriptFile('print(1)', BUILTIN_SHELLS.python);
    expect(pyFile.endsWith('.py')).toBe(true);

    const pwshFile = createScriptFile('Write-Host', BUILTIN_SHELLS.pwsh);
    expect(pwshFile.endsWith('.ps1')).toBe(true);
  });

  it('bash 内容不注入前后缀', () => {
    const filePath = createScriptFile('echo hi', BUILTIN_SHELLS.bash);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toBe('echo hi');
  });

  it('pwsh 注入 prepend 和 append', () => {
    const filePath = createScriptFile('Write-Host "x"', BUILTIN_SHELLS.pwsh);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content.startsWith(`$ErrorActionPreference = 'stop'`)).toBe(true);
    expect(content).toContain('Write-Host "x"');
    expect(content).toContain('LASTEXITCODE');
  });

  it('自定义 shell config 无扩展名', () => {
    const custom: ShellConfig = {
      command: 'perl',
      args: [],
      extension: '',
      prepend: '',
      append: '',
    };
    const filePath = createScriptFile('print 1', custom);
    expect(path.extname(filePath)).toBe('');
  });

  it('cleanupScriptFile 删除文件', () => {
    const filePath = createScriptFile('echo hi', BUILTIN_SHELLS.bash);
    expect(fs.existsSync(filePath)).toBe(true);
    cleanupScriptFile(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('cleanupScriptFile 对不存在的文件不抛错', () => {
    expect(() => cleanupScriptFile(path.join(tempDir, 'nope.sh'))).not.toThrow();
  });

  it('fallback 到 os.tmpdir 当 RUNNER_TEMP 未设置', () => {
    delete process.env.RUNNER_TEMP;
    const filePath = createScriptFile('echo hi', BUILTIN_SHELLS.bash);
    expect(path.dirname(filePath)).toBe(os.tmpdir());
    cleanupScriptFile(filePath);
  });

  if (process.platform !== 'win32') {
    it('非 Windows 设置 0o755 权限', () => {
      const filePath = createScriptFile('echo hi', BUILTIN_SHELLS.bash);
      const mode = fs.statSync(filePath).mode & 0o777;
      expect(mode).toBe(0o755);
    });
  }
});
