import { which } from '@actions/io';

/**
 * 解析未指定 shell 时的默认 shell key。
 *
 * 对齐 GitHub Actions workflow syntax 的 "unspecified" 行为：
 *
 * - 非 Windows：使用 `bash -e {0}`（不等价于显式 `shell: bash`，
 *   后者会带 `--noprofile --norc -eo pipefail`）。
 *   因此返回内部 key `default-bash`。
 *   若 PATH 中无 `bash`，降级到 `sh`（同样是 `sh -e {0}`，
 *   此时与显式 `shell: sh` 行为等价）。
 *
 * - Windows：优先 `pwsh`（PowerShell Core），
 *   若 self-hosted runner 未安装则降级 `powershell`（PowerShell Desktop）。
 */
export async function resolveDefaultShell(): Promise<string> {
  if (process.platform === 'win32') {
    try {
      await which('pwsh', true);
      return 'pwsh';
    } catch {
      return 'powershell';
    }
  }

  try {
    await which('bash', true);
    return 'default-bash';
  } catch {
    return 'sh';
  }
}
