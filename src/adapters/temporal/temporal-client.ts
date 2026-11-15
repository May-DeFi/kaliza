import { Client, Connection } from '@temporalio/client';
import { env, isPlaceholder } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let client: Client | null = null;

export function isTemporalConfigured(): boolean {
  return !isPlaceholder(env.temporal.address) && env.temporal.address !== '';
}

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  const address = env.temporal.address;
  const namespace = env.temporal.namespace;

  let connection: Connection;
  if (env.temporal.clientCertPath && env.temporal.clientKeyPath) {
    const { readFileSync } = await import('node:fs');
    const crt = readFileSync(env.temporal.clientCertPath);
    const key = readFileSync(env.temporal.clientKeyPath);
    connection = await Connection.connect({
      address,
      tls: {
        clientCertPair: {
          crt,
          key,
        },
      },
    });
  } else {
    connection = await Connection.connect({ address });
  }

  client = new Client({ connection, namespace });
  logger.info('Temporal client connected', { address, namespace });
  return client;
}

export function getTaskQueue(): string {
  return env.temporal.taskQueue;
}
