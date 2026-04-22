import * as cp from 'child_process';
import * as path from 'path';

export interface ExecResult {
  exitCode: number;
}

export function execute(
  command: string,
  args: string[],
  cwd?: string
): Promise<ExecResult> {
  return new Promise((resolve) => {
    // Windows 上调用 cmd.exe 时必须用 verbatim 参数，否则 node 会把 args 中已有的
    // 双引号转义为 \"，cmd 收到 `CALL \"path\"` 后会把整个 \"path\" 当成命令名查找，
    // 报 'is not recognized as an internal or external command'。
    const isCmd =
      process.platform === 'win32' &&
      path.basename(command).toLowerCase() === 'cmd.exe';

    const child = cp.spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: process.env,
      stdio: ['inherit', 'inherit', 'inherit'],
      shell: false,
      windowsVerbatimArguments: isCmd,
    });

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      console.error(`Failed to start process "${command}": ${err.message}`);
      resolve({ exitCode: 1 });
    });
  });
}
