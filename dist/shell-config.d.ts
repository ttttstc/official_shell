export interface ShellConfig {
    command: string;
    args: string[];
    extension: string;
    prepend: string;
    append: string;
}
export declare const BUILTIN_SHELLS: Record<string, ShellConfig>;
export declare function isBuiltinShell(shell: string): boolean;
export declare function resolveShellConfig(shell: string): ShellConfig;
