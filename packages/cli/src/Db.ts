/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { Container } from 'typedi';
import type { EntityManager } from '@n8n/typeorm';
import { DataSource as Connection } from '@n8n/typeorm';
import { ErrorReporterProxy as ErrorReporter } from 'n8n-workflow';

import config from '@/config';
import { inTest } from '@/constants';
import { wrapMigration } from '@db/utils/migrationHelpers';
import type { Migration } from '@db/types';
import { getConnectionOptions } from '@db/config';

let connection: Connection;

export const getConnection = () => connection!;

type ConnectionState = {
	connected: boolean;
	migrated: boolean;
};

export const connectionState: ConnectionState = {
	connected: false,
	migrated: false,
};

// Ping DB connection every 2 seconds
let pingTimer: NodeJS.Timer | undefined;
if (!inTest) {
	const pingDBFn = async () => {
		if (connection?.isInitialized) {
			try {
				await connection.query('SELECT 1');
				connectionState.connected = true;
				return;
			} catch (error) {
				ErrorReporter.error(error);
			} finally {
				pingTimer = setTimeout(pingDBFn, 2000);
			}
		}
		connectionState.connected = false;
	};
	pingTimer = setTimeout(pingDBFn, 2000);
}

export async function transaction<T>(fn: (entityManager: EntityManager) => Promise<T>): Promise<T> {
	return await connection.transaction(fn);
}

export async function setSchema(conn: Connection) {
	const schema = config.getEnv('database.postgresdb.schema');
	const searchPath = ['public'];
	if (schema !== 'public') {
		await conn.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
		searchPath.unshift(schema);
	}

	try {
		const databaseName = config.getEnv('database.postgresdb.database');
		await conn.query(`ALTER DATABASE ${databaseName} SET search_path TO ${searchPath.join(',')}`);
	} catch {
		console.warn('WARNING: Could not set search_path for database. Using session instead.');
		console.warn(
			'This could cause issues. Please make sure that the database user has the permissions to set the search_path.',
		);
		await conn.query(`SET search_path TO ${searchPath.join(',')}`);
	}
}

export async function init(): Promise<void> {
	if (connectionState.connected) return;

	const dbType = config.getEnv('database.type');
	const connectionOptions = getConnectionOptions();

	connection = new Connection(connectionOptions);
	Container.set(Connection, connection);
	await connection.initialize();

	if (dbType === 'postgresdb') {
		await setSchema(connection);
	}

	connectionState.connected = true;
}

export async function migrate() {
	(connection.options.migrations as Migration[]).forEach(wrapMigration);
	await connection.runMigrations({ transaction: 'each' });
	connectionState.migrated = true;
}

export const close = async () => {
	if (pingTimer) {
		clearTimeout(pingTimer);
		pingTimer = undefined;
	}

	if (connection.isInitialized) await connection.destroy();
};
