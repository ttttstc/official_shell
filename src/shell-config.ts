export interface ShellConfig {
  command: string;
  args: string[];
  extension: string;
  prepend: string;
  append: string;
}

const PWSH_PREPEND = `$ErrorActionPreference = 'stop'`;
const PWSH_APPEND = `if ((Test-Path -LiteralPath variable:\\LASTEXITCODE)) { exit $LASTEXITCODE }`;

export const BUILTIN_SHELLS: Record<string, ShellConfig> = {
  bash: {
    command: 'bash',
    args: ['--noprofile', '--norc', '-eo', 'pipefail', '{0}'],
    extension: '.sh',
    prepend: '',
    append: '',
  },
  sh: {
    command: 'sh',
    args: ['-e', '{0}'],
    extension: '.sh',
    prepend: '',
    append: '',
  },
  pwsh: {
    command: 'pwsh',
    args: ['-command', `. '{0}'`],
    extension: '.ps1',
    prepend: PWSH_PREPEND,
    append: PWSH_APPEND,
  },
  powershell: {
    command: 'powershell',
    args: ['-command', `. '{0}'`],
    extension: '.ps1',
    prepend: PWSH_PREPEND,
    append: PWSH_APPEND,
  },
  cmd: {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/D', '/E:ON', '/V:OFF', '/S', '/C', 'CALL "{0}"'],
    extension: '.cmd',
    prepend: '',
    append: '',
  },
  python: {
    command: 'python',
    args: ['{0}'],
    extension: '.py',
    prepend: '',
    append: '',
  },
};

export function isBuiltinShell(shell: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_SHELLS, shell.toLowerCase());
}

export function resolveShellConfig(shell: string): ShellConfig {
  const builtin = BUILTIN_SHELLS[shell.toLowerCase()];
  if (builtin) return builtin;

  const template = shell.includes('{0}') ? shell : `${shell} {0}`;
  const firstWord = template.trim().split(/\s+/)[0];

  return {
    command: firstWord,
    args: [],
    extension: '',
    prepend: '',
    append: '',
  };
}
