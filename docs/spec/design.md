# Shell Executor Action — Technical Design

## 1. 总体架构

```
┌─────────────────────────────────────────────────────────┐
│                     调用方                               │
│         (GitHub Actions Runner / 流水线引擎)              │
│                                                         │
│  ┌─ workflow YAML 解析                                   │
│  ├─ 环境变量注入 (GITHUB_ENV, secrets, env 等)            │
│  ├─ working-directory 决策                               │
│  └─ 调起 shell-executor action ──────────────────┐       │
│                                                  │       │
└──────────────────────────────────────────────────┼───────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────┐
│                  Shell Executor 插件                      │
│                                                         │
│  inputs: { script, shell, working-directory }            │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ shell-config │──▶│ script-file  │──▶│   command-   │ │
│  │   .ts        │   │   .ts        │   │  builder.ts  │ │
│  │              │   │              │   │              │ │
│  │ 类型解析      │   │ 临时文件生成  │   │ 命令拼接     │ │
│  │ 配置表查询    │   │ fail-fast注入 │   │ {0}替换      │ │
│  └──────────────┘   └──────────────┘   └──────┬───────┘ │
│                                               │         │
│                                               ▼         │
│                                        ┌──────────────┐ │
│                                        │ executor.ts  │ │
│                                        │              │ │
│                                        │ spawn 子进程  │ │
│                                        │ stdio 透传    │ │
│                                        │ exit code 收集│ │
│                                        └──────┬───────┘ │
│                                               │         │
│         ┌─────────────────────────────────────┘         │
│         ▼                                               │
│  exit code → core.setFailed() / 正常退出                 │
│  清理临时文件                                            │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼ stdio inherit
┌─────────────────────────────────────────────────────────┐
│                    Runner 进程                           │
│                                                         │
│  捕获 stdout → 解析 workflow commands (::error:: 等)     │
│  读取 GITHUB_ENV 文件 → 注入后续 step 环境变量            │
│  读取 GITHUB_OUTPUT 文件 → 设置 step outputs             │
│  读取 GITHUB_STEP_SUMMARY → 渲染 job summary             │
└─────────────────────────────────────────────────────────┘
```

## 2. 插件接口定义

### action.yml

```yaml
name: 'Shell Executor'
description: '平替 GitHub Actions run step 的全量 shell 执行插件'

inputs:
  script:
    description: '要执行的脚本内容（支持多行）'
    required: true
  shell:
    description: |
      Shell 类型。支持以下值：
      - 内置关键字: bash, sh, pwsh, powershell, cmd, python
      - 自定义模板: 任意命令 + {0} 占位符，如 perl {0}, ruby {0}
      - 空值: 自动选择平台默认（非Windows: bash→sh, Windows: pwsh）
    required: false
    default: ''
  working-directory:
    description: '脚本执行的工作目录，空值时继承当前进程工作目录'
    required: false
    default: ''

runs:
  using: 'node20'
  main: 'dist/index.js'
```

### 使用方式

```yaml
# 方式一：用户在 workflow 中直接使用
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: |
        echo "Hello World"
        ls -la
      shell: bash

# 方式二：使用自定义 shell
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: |
        print("Hello from Python")
      shell: python

# 方式三：使用自定义模板（opt-out fail-fast）
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: |
        false
        echo "this still runs"
      shell: bash {0}

# 方式四：不指定 shell，自动 fallback
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: echo "auto shell"
```

## 3. 目录结构

```
shell-executor/
├── action.yml                 # 插件入口定义
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts                # 入口：读 inputs → 编排流程 → 设置结果
│   ├── shell-config.ts        # 内置 shell 配置表 + 自定义模板解析
│   ├── script-file.ts         # 临时脚本文件生成
│   ├── command-builder.ts     # 执行命令拼接
│   ├── executor.ts            # 子进程执行器
│   └── platform.ts            # 平台检测 + 默认 shell fallback
├── __tests__/
│   ├── shell-config.test.ts
│   ├── script-file.test.ts
│   ├── command-builder.test.ts
│   └── platform.test.ts
└── dist/                      # ncc 编译产物
    └── index.js
```

## 4. 模块详细设计

### 4.1 shell-config.ts — Shell 配置表

对齐 [ADR 0277](https://github.com/actions/runner/blob/main/docs/adrs/0277-run-action-shell-options.md) 的完整定义。

#### 数据结构

```typescript
export interface ShellConfig {
  command: string;        // 可执行程序名或路径
  args: string[];         // 参数列表，包含 {0} 占位符
  extension: string;      // 临时脚本文件扩展名
  prepend: string;        // 注入脚本开头的内容（fail-fast 前缀）
  append: string;         // 注入脚本末尾的内容（fail-fast 后缀）
}
```

#### 内置 Shell 配置表

| Shell | command | args | extension | prepend | append |
|---|---|---|---|---|---|
| `bash` | `bash` | `--noprofile --norc -eo pipefail {0}` | `.sh` | _(空)_ | _(空)_ |
| `sh` | `sh` | `-e {0}` | `.sh` | _(空)_ | _(空)_ |
| `pwsh` | `pwsh` | `-command "& '{0}'"` | `.ps1` | `$ErrorActionPreference = 'stop'` | `if ((Test-Path -LiteralPath variable:\LASTEXITCODE)) { exit $LASTEXITCODE }` |
| `powershell` | `powershell` | `-command "& '{0}'"` | `.ps1` | _(同 pwsh)_ | _(同 pwsh)_ |
| `cmd` | `%ComSpec%` 或 `cmd.exe` | `/D /E:ON /V:OFF /S /C "CALL "{0}""` | `.cmd` | _(空)_ | _(空)_ |
| `python` | `python` | `{0}` | `.py` | _(空)_ | _(空)_ |

#### 自定义模板解析规则

```typescript
export function resolveShellConfig(shell: string): ShellConfig {
  // 1. 先查内置表
  const builtin = BUILTIN_SHELLS[shell.toLowerCase()];
  if (builtin) return builtin;

  // 2. 自定义模板
  //    - 包含 {0}：原样使用
  //    - 不含 {0}：追加 {0}
  const template = shell.includes('{0}') ? shell : `${shell} {0}`;
  const firstWord = template.split(/\s+/)[0];

  return {
    command: firstWord,
    args: [], // 由 command-builder 从完整模板解析
    extension: '',  // 自定义 shell 无法推断扩展名，使用空后缀
    prepend: '',
    append: '',
  };
}
```

### 4.2 script-file.ts — 临时脚本文件生成

#### 职责

1. 将用户脚本内容与 fail-fast 前缀/后缀拼接
2. 写入临时目录，文件名随机，扩展名由 ShellConfig 决定
3. 设置可执行权限（非 Windows）

#### 临时目录选择

优先使用 `RUNNER_TEMP` 环境变量（GitHub Actions runner 提供的临时目录），fallback 到 `os.tmpdir()`。与 runner 行为一致。

#### 实现

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { ShellConfig } from './shell-config';

export function createScriptFile(script: string, config: ShellConfig): string {
  const tempDir = process.env.RUNNER_TEMP || os.tmpdir();
  const fileName = `${crypto.randomUUID()}${config.extension}`;
  const filePath = path.join(tempDir, fileName);

  // 拼接: prepend + 用户脚本 + append
  const content = [config.prepend, script, config.append]
    .filter(Boolean)
    .join('\n');

  fs.writeFileSync(filePath, content, { encoding: 'utf-8' });

  // 非 Windows 设置可执行权限
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }

  return filePath;
}

export function cleanupScriptFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // 清理失败不阻塞流程
  }
}
```

### 4.3 command-builder.ts — 命令拼接

#### 职责

将 ShellConfig 的模板 + 临时脚本路径 → 拼成可直接 spawn 的 command + args。

#### 两种路径

```typescript
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
    // 内置 shell：从配置表取 command + args，替换 {0}
    return {
      command: builtin.command,
      args: builtin.args.map(a => a.replace('{0}', scriptPath)),
    };
  }

  // 自定义模板：展开 {0}，按空白切分
  const template = shell.includes('{0}') ? shell : `${shell} {0}`;
  const expanded = template.replace('{0}', scriptPath);
  const parts = expanded.split(/\s+/);

  return {
    command: parts[0],
    args: parts.slice(1),
  };
}
```

### 4.4 executor.ts — 子进程执行器

#### 设计要点

| 项目 | 决策 | 理由 |
|---|---|---|
| 执行方式 | `child_process.spawn` | 比 `@actions/exec` 更可控，不引入额外抽象层 |
| stdio | `['inherit', 'inherit', 'inherit']` | stdout/stderr 直通当前进程，runner 可捕获 workflow commands |
| env | `process.env` 全量透传 | 不过滤任何变量，GITHUB_ENV/OUTPUT/PATH 等自然可用 |
| shell 选项 | `false` | 不二次套 shell，由我们自己拼好的 command 直接执行 |
| exit code | 子进程 close 事件的 code 值 | null 时视为 1（异常退出） |

#### 实现

```typescript
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
      // 常见场景：command 不存在、权限不足
      console.error(`Failed to start process "${command}": ${err.message}`);
      resolve({ exitCode: 1 });
    });
  });
}
```

### 4.5 platform.ts — 平台检测与默认 Shell Fallback

```typescript
import { which } from '@actions/io';

export async function resolveDefaultShell(): Promise<string> {
  if (process.platform === 'win32') {
    return 'pwsh';
  }

  // 非 Windows：bash 优先，找不到降级 sh
  try {
    await which('bash', true);
    return 'bash';
  } catch {
    return 'sh';
  }
}
```

### 4.6 main.ts — 入口编排

```typescript
import * as core from '@actions/core';
import { resolveDefaultShell } from './platform';
import { resolveShellConfig } from './shell-config';
import { createScriptFile, cleanupScriptFile } from './script-file';
import { buildCommand } from './command-builder';
import { execute } from './executor';

async function run(): Promise<void> {
  let scriptPath = '';

  try {
    // 1. 读取 inputs
    const script = core.getInput('script', { required: true });
    let shell = core.getInput('shell');
    const workingDir = core.getInput('working-directory');

    // 2. Shell 为空 → 平台 fallback
    if (!shell) {
      shell = await resolveDefaultShell();
      core.info(`No shell specified, using platform default: ${shell}`);
    }

    // 3. 解析 shell 配置
    const config = resolveShellConfig(shell);

    // 4. 生成临时脚本文件
    scriptPath = createScriptFile(script, config);
    core.debug(`Script file created: ${scriptPath}`);

    // 5. 拼接命令
    const resolved = buildCommand(shell, scriptPath, config);
    core.debug(`Executing: ${resolved.command} ${resolved.args.join(' ')}`);

    // 6. 执行
    const cwd = workingDir || undefined;
    const result = await execute(resolved.command, resolved.args, cwd);

    // 7. Exit code → Action 状态
    if (result.exitCode !== 0) {
      core.setFailed(`Process exited with code ${result.exitCode}`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    // 8. 清理
    if (scriptPath) {
      cleanupScriptFile(scriptPath);
    }
  }
}

run();
```

## 5. 执行流程

```
input(shell, script, working-directory)
       │
       ▼
  shell 为空? ───yes──▶ platform.ts: win32→"pwsh", 否则 bash→sh
       │no                    │
       ◄──────────────────────┘
       │
       ▼
  shell-config.ts: resolveShellConfig(shell)
       │
       ├─ 内置关键字 → 查 BUILTIN_SHELLS 表 → ShellConfig
       │
       └─ 自定义模板 → 解析 command + 补齐 {0} → ShellConfig
       │
       ▼
  script-file.ts: createScriptFile(script, config)
       │
       │  写入: config.prepend + script + config.append
       │  路径: $RUNNER_TEMP/<uuid>.<extension>
       │  权限: 0o755 (非 Windows)
       │
       ▼
  command-builder.ts: buildCommand(shell, scriptPath, config)
       │
       │  模板 {0} → 替换为 scriptPath
       │  → { command, args }
       │
       ▼
  executor.ts: execute(command, args, cwd)
       │
       │  spawn(command, args, {
       │    cwd,
       │    env: process.env,        ← 全量透传
       │    stdio: 'inherit',        ← stdout/stderr 直通
       │    shell: false
       │  })
       │
       ▼
  exitCode === 0 ?
       │
       ├─ yes → 正常退出
       └─ no  → core.setFailed(`Process exited with code ${exitCode}`)
       │
       ▼
  finally: cleanupScriptFile(scriptPath)
```

## 6. Fail-Fast 策略

用户控制 fail-fast 的方式与 GitHub Actions 完全一致：

| 用户写法 | 行为 | 原理 |
|---|---|---|
| `shell: bash` | fail-fast 开启 | 内置关键字，args 中含 `-eo pipefail` |
| `shell: bash {0}` | fail-fast 关闭 | 自定义模板，走通用解析，无 `-eo pipefail` |
| `shell: pwsh` | fail-fast 开启 | prepend 注入 `$ErrorActionPreference = 'stop'` |
| `shell: pwsh -command "& '{0}'"` | fail-fast 关闭 | 自定义模板，走通用解析，无 prepend |
| `shell: cmd` | 无 fail-fast | cmd 本身不支持，与 runner 行为一致 |

**判定逻辑**：只要 shell 值能精确匹配 `BUILTIN_SHELLS` 表的 key（大小写不敏感），就走内置配置（含 fail-fast）。否则一律视为自定义模板，走通用解析（无 fail-fast 注入）。

这意味着 `bash` 和 `bash {0}` 是两种完全不同的行为，与 GitHub Actions 语义一致。

## 7. 环境变量与 Workflow Commands

### 环境变量处理

插件执行子进程时，通过 `env: process.env` 将当前进程的全部环境变量透传给子进程。这包括：

- `GITHUB_ENV` — 指向环境文件的路径
- `GITHUB_OUTPUT` — 指向输出文件的路径
- `GITHUB_STEP_SUMMARY` — 指向摘要文件的路径
- `GITHUB_PATH` — 指向 PATH 追加文件的路径
- `GITHUB_TOKEN`、`GITHUB_REPOSITORY` 等 runner 注入的变量
- 用户在 workflow 中通过 `env:` 定义的变量
- secrets（runner 已解密注入为环境变量）

插件不读取、不修改、不过滤任何环境变量。

### Workflow Commands 处理

用户脚本可能通过 stdout 输出 workflow commands：

```bash
echo "::error::Something went wrong"
echo "::warning::Check this"
echo "::add-mask::secret-value"
echo "key=value" >> $GITHUB_OUTPUT
echo "MY_VAR=hello" >> $GITHUB_ENV
```

插件通过 `stdio: 'inherit'` 将子进程的 stdout/stderr 直接连接到当前进程的 stdout/stderr。Runner 从当前进程的输出中解析这些 commands。插件不做任何解析或拦截。

## 8. 构建与打包

```json
{
  "scripts": {
    "build": "tsc",
    "package": "ncc build src/main.ts -o dist --source-map --license licenses.txt",
    "test": "jest",
    "all": "npm run build && npm run package && npm test"
  },
  "dependencies": {
    "@actions/core": "^1.10.0",
    "@actions/io": "^1.1.3"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@vercel/ncc": "^0.38.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

产物结构：

```
dist/
├── index.js              # ncc 打包的单文件，包含所有依赖
├── index.js.map          # source map
└── licenses.txt          # 第三方许可证
```

## 9. 测试策略

### 单元测试

| 模块 | 测试重点 |
|---|---|
| shell-config | 6 种内置 shell 的配置正确性；自定义模板解析；含 `{0}` 与不含 `{0}` 的处理 |
| script-file | 文件生成路径正确；prepend/append 注入正确；权限设置；清理逻辑 |
| command-builder | 内置 shell 的 `{0}` 替换；自定义模板的切分；边界 case（空格、引号） |
| platform | Windows 返回 pwsh；非 Windows bash 存在时返回 bash；bash 不存在时返回 sh |

### 集成测试

在 GitHub Actions workflow 中实际运行，验证：

```yaml
jobs:
  test-bash:
    runs-on: ubuntu-latest
    steps:
      - uses: ./
        with:
          script: |
            set -x
            echo "VAR=hello" >> $GITHUB_ENV
          shell: bash

  test-python:
    runs-on: ubuntu-latest
    steps:
      - uses: ./
        with:
          script: |
            import os
            print(f"Running on {os.name}")
          shell: python

  test-pwsh:
    runs-on: windows-latest
    steps:
      - uses: ./
        with:
          script: |
            Write-Output "Hello from PowerShell"
          shell: pwsh

  test-fail-fast:
    runs-on: ubuntu-latest
    steps:
      - uses: ./
        id: should-fail
        continue-on-error: true
        with:
          script: |
            false
            echo "should not reach here"
          shell: bash
      - run: |
          if [ "${{ steps.should-fail.outcome }}" != "failure" ]; then
            echo "fail-fast did not work"
            exit 1
          fi

  test-opt-out-fail-fast:
    runs-on: ubuntu-latest
    steps:
      - uses: ./
        with:
          script: |
            false
            echo "this should print"
          shell: bash {0}
```
