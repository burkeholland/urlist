import { CosmosClient, type Database } from '@azure/cosmos';
import { getCosmosEnv } from './env';

let _client: CosmosClient | null = null;
let _db: Database | null = null;

function getClient(): CosmosClient {
  if (!_client) {
    const env = getCosmosEnv();
    _client = new CosmosClient({ endpoint: env.COSMOS_ENDPOINT, key: env.COSMOS_KEY });
  }
  return _client;
}

export function getDb(): Database {
  if (!_db) {
    const env = getCosmosEnv();
    _db = getClient().database(env.COSMOS_DATABASE);
  }
  return _db;
}
