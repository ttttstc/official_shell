# Shell Executor Action — Vision

## 项目定位

Shell Executor 是一个运行在 GitHub Actions 上的 Node20 插件，目标是**完整平替 GitHub Actions 内置 `run` step 的全量 shell 执行能力**。

它同时承担两个角色：

1. **作为独立 Action**：用户可以在 workflow 中通过 `uses:` 直接引用，获得与内置 `run` 完全一致的 shell 执行体验。
2. **作为流水线引擎内置执行器**：嵌入自研流水线平台，在 `run` 定义下作为底层 shell 调度模块被调起。

## 核心原则

### 1. 完整对齐 GitHub Actions 原生语义

插件的行为规范严格对齐 [GitHub Actions Runner ADR 0277](https://github.com/actions/runner/blob/main/docs/adrs/0277-run-action-shell-options.md)，覆盖全部 6 种内置 shell（bash、sh、pwsh、powershell、cmd、python）的执行模板、文件后缀、fail-fast 策略、exit code 语义，以及任意自定义 shell 模板（`{0}` 占位符机制）。

不做裁剪，不做扩展语义。用户从内置 `run` 切换到本插件时，行为零差异。

### 2. 薄执行层，职责清晰

插件是一个**纯粹的 shell executor**——接收 shell 类型和脚本内容，生成临时文件，拼接命令，spawn 子进程，返回 exit code。

**插件做的事：**

- 解析 shell 类型（内置关键字 or 自定义模板）
- 按 shell 类型注入 fail-fast 前缀/后缀到脚本内容
- 生成带正确扩展名的临时脚本文件
- 拼接完整执行命令（模板 `{0}` 替换）
- spawn 子进程，透传 stdin/stdout/stderr 和全量环境变量
- 根据 exit code 设置 Action 成功/失败状态
- 清理临时文件

**插件不做的事：**

- 不解析 workflow YAML
- 不解析 workflow commands（`::error::`、`::set-output` 等由 runner 处理）
- 不干预 `GITHUB_ENV`、`GITHUB_OUTPUT`、`GITHUB_STEP_SUMMARY` 等环境文件的读写（透传给子进程，由 runner 消费）
- 不管理 secrets 注入
- 不管理 matrix / strategy 逻辑

### 3. 平台感知仅限于默认 shell 选择

插件唯一的平台感知行为是：当用户未指定 shell 时，自动选择平台默认值。

- 非 Windows：优先 `bash`，PATH 中不存在时降级 `sh`
- Windows：默认 `pwsh`

这与 GitHub Actions runner 的行为完全一致。除此之外，插件不做任何平台特化逻辑。

### 4. 可独立使用，可被嵌入

插件的接口是三个 input：`script`、`shell`、`working-directory`。这套接口既能作为 Action 被 workflow 直接调用，也能被流水线引擎程序化地组装参数后调起。没有隐式依赖，没有魔法行为。

## 能力覆盖范围

| 能力 | 来源 | 状态 |
|---|---|---|
| 6 种内置 shell 精确执行模板 | ADR 0277 | 全量覆盖 |
| 自定义 shell 模板 (`{0}` 占位) | ADR 0277 | 全量覆盖 |
| bash/sh fail-fast (`set -eo pipefail`) | ADR 0277 | 覆盖 |
| pwsh/powershell `$ErrorActionPreference` + `LASTEXITCODE` | ADR 0277 | 覆盖 |
| cmd 最后命令 errorlevel 语义 | ADR 0277 | 覆盖 |
| working-directory | workflow syntax | 覆盖 |
| 环境变量全量透传 | runner 行为 | 覆盖 |
| stdout/stderr 透传（workflow commands 兼容） | runner 行为 | 覆盖 |
| 临时文件使用 `RUNNER_TEMP` 目录 | runner 行为 | 覆盖 |
| exit code → Action 成功/失败映射 | runner 行为 | 覆盖 |
| 用户 opt-out fail-fast（传自定义模板） | ADR 0277 | 覆盖 |

## 非目标

以下能力明确不在本插件范围内：

- Docker container 内执行（由调用方通过 `docker exec` 调起本插件）
- Composite action 编排
- 脚本缓存 / 脚本仓库管理
- 超时控制（由 runner 的 `timeout-minutes` 处理）
- 重试机制（由 workflow 的 `continue-on-error` + 外部逻辑处理）
- 条件执行（由 workflow 的 `if` 表达式处理）
