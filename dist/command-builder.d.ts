import { ShellConfig } from './shell-config';
export interface ResolvedCommand {
    command: string;
    args: string[];
}
export declare function buildCommand(shell: string, scriptPath: string, config: ShellConfig): ResolvedCommand;
