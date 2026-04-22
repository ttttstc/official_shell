import { BUILTIN_SHELLS, isBuiltinShell, resolveShellConfig } from '../src/shell-config';

describe('shell-config', () => {
  describe('BUILTIN_SHELLS', () => {
    it('包含 6 种内置 shell', () => {
      expect(Object.keys(BUILTIN_SHELLS).sort()).toEqual(
        ['bash', 'cmd', 'powershell', 'pwsh', 'python', 'sh'].sort()
      );
    });

    it('bash 配置符合 ADR 0277', () => {
      const c = BUILTIN_SHELLS.bash;
      expect(c.command).toBe('bash');
      expect(c.args).toEqual(['--noprofile', '--norc', '-eo', 'pipefail', '{0}']);
      expect(c.extension).toBe('.sh');
    });

    it('sh 配置符合 ADR 0277', () => {
      const c = BUILTIN_SHELLS.sh;
      expect(c.command).toBe('sh');
      expect(c.args).toEqual(['-e', '{0}']);
      expect(c.extension).toBe('.sh');
    });

    it('pwsh 注入 ErrorActionPreference 和 LASTEXITCODE', () => {
      const c = BUILTIN_SHELLS.pwsh;
      expect(c.extension).toBe('.ps1');
      expect(c.prepend).toContain(`$ErrorActionPreference = 'stop'`);
      expect(c.append).toContain('LASTEXITCODE');
    });

    it('powershell 与 pwsh 同逻辑但不同 command', () => {
      expect(BUILTIN_SHELLS.powershell.command).toBe('powershell');
      expect(BUILTIN_SHELLS.powershell.prepend).toBe(BUILTIN_SHELLS.pwsh.prepend);
      expect(BUILTIN_SHELLS.powershell.append).toBe(BUILTIN_SHELLS.pwsh.append);
    });

    it('cmd 使用 .cmd 扩展名且无 fail-fast', () => {
      const c = BUILTIN_SHELLS.cmd;
      expect(c.extension).toBe('.cmd');
      expect(c.prepend).toBe('');
      expect(c.append).toBe('');
    });

    it('python 使用 .py 扩展名', () => {
      expect(BUILTIN_SHELLS.python.extension).toBe('.py');
      expect(BUILTIN_SHELLS.python.args).toEqual(['{0}']);
    });
  });

  describe('isBuiltinShell', () => {
    it('识别内置 shell（大小写不敏感）', () => {
      expect(isBuiltinShell('bash')).toBe(true);
      expect(isBuiltinShell('BASH')).toBe(true);
      expect(isBuiltinShell('Pwsh')).toBe(true);
    });

    it('识别自定义模板为非内置', () => {
      expect(isBuiltinShell('bash {0}')).toBe(false);
      expect(isBuiltinShell('perl {0}')).toBe(false);
    });
  });

  describe('resolveShellConfig', () => {
    it('内置 shell 返回完整配置', () => {
      const c = resolveShellConfig('bash');
      expect(c).toBe(BUILTIN_SHELLS.bash);
    });

    it('大小写不敏感', () => {
      expect(resolveShellConfig('BASH')).toBe(BUILTIN_SHELLS.bash);
      expect(resolveShellConfig('Python')).toBe(BUILTIN_SHELLS.python);
    });

    it('自定义模板含 {0} 取首词为 command', () => {
      const c = resolveShellConfig('perl {0}');
      expect(c.command).toBe('perl');
      expect(c.args).toEqual([]);
      expect(c.extension).toBe('');
      expect(c.prepend).toBe('');
      expect(c.append).toBe('');
    });

    it('自定义模板不含 {0} 依然取首词', () => {
      const c = resolveShellConfig('ruby');
      expect(c.command).toBe('ruby');
    });

    it('bash {0} 走自定义分支（opt-out fail-fast）', () => {
      const c = resolveShellConfig('bash {0}');
      expect(c.command).toBe('bash');
      expect(c.args).toEqual([]);
      expect(c.prepend).toBe('');
    });
  });
});
