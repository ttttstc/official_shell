import { BUILTIN_SHELLS, ShellConfig } from './shell-config';

export interface ResolvedCommand {
  command: string;
  args: string[];
}

export function buildCommand(
  shell: string,
  scriptPath: string,
  config: ShellConfig
): ResolvedCommand {
  const builtin = BUILTIN_SHELLS[shell.toLowerCase()];

  if (builtin) {
    return {
      command: builtin.command,
      args: builtin.args.map((a) => a.replace('{0}', scriptPath)),
    };
  }

  const template = shell.includes('{0}') ? shell : `${shell} {0}`;
  const expanded = template.replace('{0}', scriptPath);
  const parts = expanded.trim().split(/\s+/);

  return {
    command: parts[0],
    args: parts.slice(1),
  };
}
