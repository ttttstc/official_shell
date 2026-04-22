# Shell Executor Action

[中文](./README.zh-CN.md) | **English**

A Node20 action that is a full drop-in replacement for the built-in `run` step of GitHub Actions / AtomGit CodeArts. It covers the complete shell execution semantics defined in [Runner ADR 0277](https://github.com/actions/runner/blob/main/docs/adrs/0277-run-action-shell-options.md) — all 6 built-in shells, custom shell templates, fail-fast strategies, exit-code mapping — with zero behavioral drift.

## Features

- **6 built-in shells**: `bash`, `sh`, `pwsh`, `powershell`, `cmd`, `python` — exact templates, file extensions, and fail-fast behavior aligned with ADR 0277
- **Custom shell templates**: any command + `{0}` placeholder, e.g. `perl {0}`, `ruby {0}`
- **Fail-fast opt-out**: switch from `shell: bash` to `shell: bash {0}` to disable `-eo pipefail`
- **Platform-aware default**: non-Windows → `bash` (fallback `sh`), Windows → `pwsh`
- **Full environment passthrough**: child process inherits `process.env` in its entirety — `ATOMGIT_ENV`, `ATOMGIT_OUTPUT`, `ATOMGIT_STEP_SUMMARY`, secrets, user `env:` all work naturally
- **Stdio inherited**: workflow commands (`::error::`, `::set-output`, `::add-mask::` …) on stdout/stderr flow straight to the runner
- **Temp script in `RUNNER_TEMP`**: matches runner convention, cleaned up after execution

## Inputs

| Name | Required | Default | Description |
|---|---|---|---|
| `script` | yes | — | Script content to execute (multi-line supported) |
| `shell` | no | `''` | Shell type. Built-in keyword (`bash`, `sh`, `pwsh`, `powershell`, `cmd`, `python`), or custom template with `{0}` placeholder. Empty → platform default |
| `working-directory` | no | `''` | Working directory for the script. Empty → inherit current process cwd |

## Usage

### Built-in shell

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

### Custom shell / opt-out fail-fast

```yaml
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: |
        false
        echo "this still runs because fail-fast is off"
      shell: bash {0}
```

### Auto-detected default shell

```yaml
steps:
  - uses: your-org/shell-executor@v1
    with:
      script: echo "auto shell"
```

## Built-in Shell Table

| Shell | Command | Args | Ext | Fail-fast |
|---|---|---|---|---|
| `bash` | `bash` | `--noprofile --norc -eo pipefail {0}` | `.sh` | `-eo pipefail` |
| `sh` | `sh` | `-e {0}` | `.sh` | `-e` |
| `pwsh` | `pwsh` | `-command ". '{0}'"` | `.ps1` | `$ErrorActionPreference='stop'` + `$LASTEXITCODE` |
| `powershell` | `powershell` | `-command ". '{0}'"` | `.ps1` | same as pwsh |
| `cmd` | `%ComSpec%` | `/D /E:ON /V:OFF /S /C "CALL "{0}""` | `.cmd` | errorlevel of last command |
| `python` | `python` | `{0}` | `.py` | none |

## Architecture

Thin execution layer. The plugin does:

- Parse shell type (built-in keyword or custom template)
- Inject fail-fast prepend/append into script content
- Generate temp script file with the right extension
- Build command with `{0}` substitution
- Spawn child process with full env + inherited stdio
- Map exit code → action status
- Clean up temp file

The plugin does NOT:

- Parse workflow YAML
- Parse workflow commands (`::error::`, `::set-output`, …)
- Touch `ATOMGIT_ENV` / `ATOMGIT_OUTPUT` / `ATOMGIT_STEP_SUMMARY` (passthrough only)
- Manage secrets, matrix, or retries

## Development

```bash
npm install
npm run build       # tsc typecheck
npm test            # jest unit tests
npm run package     # ncc bundle → dist/index.js
npm run all         # build + package + test
```

## Project Layout

```
.
├── action.yml             # Action entry definition
├── src/
│   ├── main.ts            # Entry: read inputs, orchestrate, set result
│   ├── shell-config.ts    # Built-in shell table + custom template parsing
│   ├── script-file.ts     # Temp script file generation
│   ├── command-builder.ts # Command assembly ({0} substitution)
│   ├── executor.ts        # Child process executor
│   └── platform.ts        # Platform detection + default shell fallback
├── __tests__/             # Jest unit tests
└── dist/                  # ncc bundled artifact
```

## License

MIT — see [LICENSE](./LICENSE).
