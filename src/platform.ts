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

/**
 * 解析实际可用的 python 解释器命令。
 *
 * 部分 runner 镜像（如 Ubuntu 24.04）默认不再提供 `python` 命令，
 * 只有 `python3`。优先 `python`（兼容已有脚本），降级 `python3`。
 * 都不存在时返回 `python`，让后续 spawn 抛出清晰的 ENOENT。
 */
export async function resolvePythonCommand(): Promise<string> {
  try {
    await which('python', true);
    return 'python';
  } catch {
    try {
      await which('python3', true);
      return 'python3';
    } catch {
      return 'python';
    }
  }
}
