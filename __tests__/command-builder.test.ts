import { buildCommand } from '../src/command-builder';
import { resolveShellConfig, BUILTIN_SHELLS } from '../src/shell-config';

describe('command-builder', () => {
  const scriptPath = '/tmp/abc.sh';

  it('bash 替换 {0} 为脚本路径', () => {
    const r = buildCommand('bash', scriptPath, BUILTIN_SHELLS.bash);
    expect(r.command).toBe('bash');
    expect(r.args).toEqual(['--noprofile', '--norc', '-eo', 'pipefail', scriptPath]);
  });

  it('sh 替换 {0}', () => {
    const r = buildCommand('sh', scriptPath, BUILTIN_SHELLS.sh);
    expect(r.command).toBe('sh');
    expect(r.args).toEqual(['-e', scriptPath]);
  });

  it('python 替换 {0}', () => {
    const r = buildCommand('python', '/tmp/x.py', BUILTIN_SHELLS.python);
    expect(r.command).toBe('python');
    expect(r.args).toEqual(['/tmp/x.py']);
  });

  it('pwsh 将 {0} 嵌入 -command 参数', () => {
    const r = buildCommand('pwsh', '/tmp/x.ps1', BUILTIN_SHELLS.pwsh);
    expect(r.command).toBe('pwsh');
    expect(r.args[0]).toBe('-command');
    expect(r.args[1]).toContain('/tmp/x.ps1');
  });

  it('cmd 将 {0} 嵌入 CALL 参数', () => {
    const r = buildCommand('cmd', 'C:\\tmp\\x.cmd', BUILTIN_SHELLS.cmd);
    expect(r.args).toContain('CALL "C:\\tmp\\x.cmd"');
  });

  it('大小写不敏感匹配内置', () => {
    const r = buildCommand('BASH', scriptPath, BUILTIN_SHELLS.bash);
    expect(r.command).toBe('bash');
    expect(r.args[r.args.length - 1]).toBe(scriptPath);
  });

  it('自定义模板含 {0} 按空白切分', () => {
    const config = resolveShellConfig('perl {0}');
    const r = buildCommand('perl {0}', scriptPath, config);
    expect(r.command).toBe('perl');
    expect(r.args).toEqual([scriptPath]);
  });

  it('自定义模板不含 {0} 自动追加', () => {
    const config = resolveShellConfig('ruby');
    const r = buildCommand('ruby', scriptPath, config);
    expect(r.command).toBe('ruby');
    expect(r.args).toEqual([scriptPath]);
  });

  it('bash {0} 走自定义分支（opt-out fail-fast）', () => {
    const config = resolveShellConfig('bash {0}');
    const r = buildCommand('bash {0}', scriptPath, config);
    expect(r.command).toBe('bash');
    expect(r.args).toEqual([scriptPath]);
  });

  it('自定义多参数模板保留额外参数', () => {
    const config = resolveShellConfig('node --experimental-vm-modules {0}');
    const r = buildCommand('node --experimental-vm-modules {0}', scriptPath, config);
    expect(r.command).toBe('node');
    expect(r.args).toEqual(['--experimental-vm-modules', scriptPath]);
  });

  it('default-bash 走内置分支，输出 bash -e {scriptPath}', () => {
    const r = buildCommand('default-bash', scriptPath, BUILTIN_SHELLS['default-bash']);
    expect(r.command).toBe('bash');
    expect(r.args).toEqual(['-e', scriptPath]);
  });
});
