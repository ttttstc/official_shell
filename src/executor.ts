import * as cp from 'child_process';

export interface ExecResult {
  exitCode: number;
}

export function execute(
  command: string,
  args: string[],
  cwd?: string
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = cp.spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: process.env,
      stdio: ['inherit', 'inherit', 'inherit'],
      shell: false,
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
