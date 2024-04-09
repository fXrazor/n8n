import { Start } from '../commands/start';
import { Config } from '@oclif/core';
import type Bench from 'tinybench';

export function start(bench: Bench) {
	bench.add('`start` command', async () => {
		const args: string[] = [];
		const config = new Config({ root: __dirname });

		const startCommand = new Start(args, config);

		await startCommand.init();
		await startCommand.run();
	});
}
