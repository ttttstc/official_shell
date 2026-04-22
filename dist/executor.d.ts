export interface ExecResult {
    exitCode: number;
}
export declare function execute(command: string, args: string[], cwd?: string): Promise<ExecResult>;
