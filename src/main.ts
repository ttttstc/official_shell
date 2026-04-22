import * as core from '@actions/core';
import { resolveDefaultShell, resolvePythonCommand } from './platform';
import { resolveShellConfig } from './shell-config';
import { createScriptFile, cleanupScriptFile } from './script-file';
import { buildCommand } from './command-builder';
import { execute } from './executor';

export async function run(): Promise<void> {
  let scriptPath = '';

  try {
    const script = core.getInput('script', { required: true });
    let shell = core.getInput('shell');
    const workingDir = core.getInput('working-directory');

    if (!shell) {
      shell = await resolveDefaultShell();
      core.info(`No shell specified, using platform default: ${shell}`);
    }

    const config = resolveShellConfig(shell);

    scriptPath = createScriptFile(script, config);
    core.debug(`Script file created: ${scriptPath}`);

    const resolved = buildCommand(shell, scriptPath, config);

    // 部分 runner 镜像（如 Ubuntu 24.04）只有 python3 没有 python，
    // 在 spawn 前做一次解释器解析，优先 python、降级 python3。
    if (resolved.command === 'python') {
      resolved.command = await resolvePythonCommand();
    }

    core.debug(`Executing: ${resolved.command} ${resolved.args.join(' ')}`);

    const cwd = workingDir || undefined;
    const result = await execute(resolved.command, resolved.args, cwd);

    if (result.exitCode !== 0) {
      core.setFailed(`Process exited with code ${result.exitCode}`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    if (scriptPath) {
      cleanupScriptFile(scriptPath);
    }
  }
}

run();
