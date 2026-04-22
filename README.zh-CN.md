# Shell Executor Action

**中文** | [English](./README.md)

一个 Node20 插件，完整平替 GitHub Actions / AtomGit CodeArts 内置 `run` step 的 shell 执行能力。严格对齐 [Runner ADR 0277](https://github.com/actions/runner/blob/main/docs/adrs/0277-run-action-shell-options.md)：覆盖 6 种内置 shell、自定义模板、fail-fast 策略、exit code 映射，用户从内置 `run` 切换到本插件时**行为零差异**。

## 功能特性

- **6 种内置 shell**：`bash`、`sh`、`pwsh`、`powershell`、`cmd`、`python` —— 执行模板、文件扩展名、fail-fast 行为完全对齐 ADR 0277
- **自定义 shell 模板**：任意命令 + `{0}` 占位符，如 `perl {0}`、`ruby {0}`
- **Fail-fast 可选关闭**：`shell: bash` → `shell: bash {0}` 即可关掉 `-eo pipefail`
- **平台感知默认值**：非 Windows → `bash`（不存在降级 `sh`），Windows → `pwsh`
- **环境变量全量透传**：子进程继承 `process.env` 全部内容，`ATOMGIT_ENV`、`ATOMGIT_OUTPUT`、`ATOMGIT_STEP_SUMMARY`、secrets、用户 `env:` 均自然可用
- **stdio 直通**：workflow commands（`::error::`、`::set-output`、`::add-mask::` 等）原样流向 runner
- **临时脚本写入 `RUNNER_TEMP`**：与 runner 约定一致，执行后自动清理

## 输入参数

| 参数名 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `script` | 是 | — | 要执行的脚本内容（支持多行） |
| `shell` | 否 | `''` | Shell 类型。内置关键字（`bash`、`sh`、`pwsh`、`powershell`、`cmd`、`python`）或带 `{0}` 占位符的自定义模板。空值 → 使用平台默认 |
| `working-directory` | 否 | `''` | 脚本工作目录。空值 → 继承当前进程 cwd |

## 使用示例

### 内置 shell

```yaml
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: |
        echo "Hello World"
        ls -la
      shell: bash
```

### Python

```yaml
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: |
        import os
        print(f"Running on {os.name}")
      shell: python
```

### 自定义 shell / 关闭 fail-fast

```yaml
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: |
        false
        echo "这一行仍会执行，因为 fail-fast 已关闭"
      shell: bash {0}
```

### 自动选择默认 shell

```yaml
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: echo "auto shell"
```

## 内置 Shell 配置表

| Shell | 可执行程序 | 参数 | 扩展名 | Fail-fast |
|---|---|---|---|---|
| `bash` | `bash` | `--noprofile --norc -eo pipefail {0}` | `.sh` | `-eo pipefail` |
| `sh` | `sh` | `-e {0}` | `.sh` | `-e` |
| `pwsh` | `pwsh` | `-command ". '{0}'"` | `.ps1` | `$ErrorActionPreference='stop'` + `$LASTEXITCODE` |
| `powershell` | `powershell` | `-command ". '{0}'"` | `.ps1` | 同 pwsh |
| `cmd` | `%ComSpec%` | `/D /E:ON /V:OFF /S /C "CALL "{0}""` | `.cmd` | 最后命令的 errorlevel |
| `python` | `python` | `{0}` | `.py` | 无 |

## 架构设计

**薄执行层**。插件只做：

- 解析 shell 类型（内置关键字 or 自定义模板）
- 按 shell 类型注入 fail-fast 前缀/后缀
- 生成带正确扩展名的临时脚本文件
- 拼接命令（`{0}` 替换为脚本路径）
- spawn 子进程（env 全量透传 + stdio inherit）
- 根据 exit code 设置 Action 状态
- 清理临时文件

**插件不做**：

- 不解析 workflow YAML
- 不解析 workflow commands（`::error::`、`::set-output` 等由 runner 消费）
- 不干预 `ATOMGIT_ENV` / `ATOMGIT_OUTPUT` / `ATOMGIT_STEP_SUMMARY` 等环境文件的读写
- 不管理 secrets、matrix、重试逻辑

## 本地开发

```bash
npm install
npm run build       # tsc 类型检查
npm test            # jest 单元测试
npm run package     # ncc 打包 → dist/index.js
npm run all         # build + package + test 一条龙
```

## 目录结构

```
.
├── action.yml              # 插件入口定义
├── src/
│   ├── main.ts             # 入口：读 inputs、编排流程、设置结果
│   ├── shell-config.ts     # 内置 shell 配置表 + 自定义模板解析
│   ├── script-file.ts      # 临时脚本文件生成
│   ├── command-builder.ts  # 执行命令拼接（{0} 替换）
│   ├── executor.ts         # 子进程执行器
│   └── platform.ts         # 平台检测 + 默认 shell fallback
├── __tests__/              # Jest 单元测试
└── dist/                   # ncc 打包产物
```

## 许可证

MIT —— 详见 [LICENSE](./LICENSE)。
