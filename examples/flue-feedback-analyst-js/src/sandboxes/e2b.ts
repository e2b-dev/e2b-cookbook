// flue-blueprint: sandbox/e2b@1
/**
 * E2B adapter for Flue.
 *
 * Wraps an already-initialized E2B sandbox into Flue's SandboxFactory
 * interface. The user creates and configures the sandbox using the E2B
 * SDK directly — Flue just adapts it.
 */
import { sandboxFromDriver, SandboxOperationUnsupportedError } from '@flue/runtime';
import type { SandboxDriver, SandboxFactory, Sandbox, FileStat } from '@flue/runtime';
import { CommandExitError } from 'e2b';
import type { Sandbox as E2BSandbox } from 'e2b';

/**
 * Implements SandboxDriver by wrapping the E2B v2 TypeScript SDK.
 *
 * E2B's `files` module has direct analogues for most filesystem operations
 * (`read`, `write`, `makeDir`, `remove`, `list`, `exists`, `getInfo`) so we
 * use those rather than shelling out. `makeDir` is always recursive on E2B,
 * so the `recursive: false` case maps to the same call. `remove` has no
 * recursive/force flags, so the adapter explicitly rejects either option
 * before calling the provider.
 *
 * `commands.run()` returns `{ stdout, stderr, exitCode }` directly. Both E2B
 * and Flue express command timeouts in milliseconds, so the adapter forwards
 * them unchanged.
 */
class E2BSandboxDriver implements SandboxDriver {
	constructor(private sandbox: E2BSandbox) {}

	async readFile(path: string): Promise<string> {
		return this.sandbox.files.read(path);
	}

	async readFileBuffer(path: string): Promise<Uint8Array> {
		return this.sandbox.files.read(path, { format: 'bytes' });
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		// E2B accepts string | ArrayBuffer | Blob | ReadableStream. A
		// Uint8Array's underlying ArrayBuffer is the right shape, but slice
		// to its actual byteLength in case the buffer is a larger pool.
		if (typeof content === 'string') {
			await this.sandbox.files.write(path, content);
		} else {
			const ab = content.buffer.slice(
				content.byteOffset,
				content.byteOffset + content.byteLength,
			) as ArrayBuffer;
			await this.sandbox.files.write(path, ab);
		}
	}

	async stat(path: string): Promise<FileStat> {
		const info = await this.sandbox.files.getInfo(path);
		const isDirectory = info.type === 'dir';
		return {
			isFile: info.type === 'file',
			isDirectory,
			isSymbolicLink: typeof info.symlinkTarget === 'string' && info.symlinkTarget.length > 0,
		};
	}

	async readdir(path: string): Promise<string[]> {
		const entries = await this.sandbox.files.list(path);
		return entries.map((e) => e.name);
	}

	async exists(path: string): Promise<boolean> {
		return this.sandbox.files.exists(path);
	}

	async mkdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
		// E2B's makeDir creates parents along the way unconditionally, so
		// the `recursive` option doesn't change behavior here.
		await this.sandbox.files.makeDir(path);
	}

	async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
		const unsupported = [
			options?.recursive ? 'recursive' : undefined,
			options?.force ? 'force' : undefined,
		].filter((option): option is string => option !== undefined);
		if (unsupported.length > 0) {
			throw new SandboxOperationUnsupportedError({
				operation: 'rm',
				provider: 'E2B',
				options: unsupported,
			});
		}
		await this.sandbox.files.remove(path);
	}

	async exec(
		command: string,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
			timeoutMs?: number;
			signal?: AbortSignal;
		},
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		try {
			const result = await this.sandbox.commands.run(command, {
				cwd: options?.cwd,
				envs: options?.env,
				timeoutMs: options?.timeoutMs,
			});
			return {
				stdout: result.stdout ?? '',
				stderr: result.stderr ?? '',
				exitCode: result.exitCode ?? 0,
			};
		} catch (error) {
			// Deviation from the blueprint: e2b's commands.run THROWS a
			// CommandExitError on any non-zero exit, but the SandboxDriver
			// contract wants the failure reported as a ShellResult. The error
			// implements CommandResult, so unwrap it.
			if (error instanceof CommandExitError) {
				return {
					stdout: error.stdout ?? '',
					stderr: error.stderr ?? '',
					exitCode: error.exitCode ?? 1,
				};
			}
			throw error;
		}
	}
}

/**
 * Create a Flue sandbox factory from an initialized E2B sandbox.
 * The user owns the sandbox lifecycle; Flue wraps it into a Sandbox
 * for agent use.
 */
export function e2b(sandbox: E2BSandbox): SandboxFactory {
	return {
		async createSandbox(): Promise<Sandbox> {
			// The E2B base template's default user is `user` with home
			// directory /home/user.
			const sandboxCwd = '/home/user';
			const driver = new E2BSandboxDriver(sandbox);
			return sandboxFromDriver(driver, sandboxCwd);
		},
	};
}
