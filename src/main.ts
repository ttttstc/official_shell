import * as core from '@actions/core';
import { resolveDefaultShell } from './platform';
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
