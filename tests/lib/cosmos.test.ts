import { beforeEach, describe, expect, it, vi } from 'vitest';

const cosmosClientInstances: any[] = [];
const databaseCalls: string[] = [];

vi.mock('@azure/cosmos', () => {
  class CosmosClient {
    config: any;
    constructor(config: any) {
      this.config = config;
      cosmosClientInstances.push(this);
    }
    database(id: string) {
      databaseCalls.push(id);
      return { id, isMockDatabase: true };
    }
  }
  return { CosmosClient };
});

// Re-import fresh module state per test group
async function importCosmos() {
  return import('@/lib/cosmos');
}

describe('lib/cosmos', () => {
  beforeEach(() => {
    vi.resetModules();
    cosmosClientInstances.length = 0;
    databaseCalls.length = 0;
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
    process.env.COSMOS_KEY = 'test-key';
    process.env.COSMOS_DATABASE = 'urlist-test';
  });

  it('getDb creates a CosmosClient with env credentials and returns the database', async () => {
    const { getDb } = await importCosmos();
    const db = getDb();
    expect(cosmosClientInstances).toHaveLength(1);
    expect(cosmosClientInstances[0].config).toEqual({
      endpoint: 'https://example.documents.azure.com',
      key: 'test-key',
    });
    expect(databaseCalls).toEqual(['urlist-test']);
    expect(db).toEqual({ id: 'urlist-test', isMockDatabase: true });
  });

  it('reuses the cached client when the database cache is intact', async () => {
    const { getDb } = await importCosmos();
    getDb();
    getDb();
    expect(cosmosClientInstances).toHaveLength(1);
  });

  it('reuses the cached client when getDb is called repeatedly', async () => {
    const { getDb } = await importCosmos();
    const first = getDb();
    const second = getDb();
    expect(second).toBe(first);
    expect(databaseCalls).toHaveLength(1);
  });

  it('getDb caches the database across calls', async () => {
    const { getDb } = await importCosmos();
    const first = getDb();
    const second = getDb();
    expect(second).toBe(first);
    expect(cosmosClientInstances).toHaveLength(1);
    expect(databaseCalls).toHaveLength(1);
  });

  it('throws when Cosmos env is invalid', async () => {
    delete process.env.COSMOS_ENDPOINT;
    const { getDb } = await importCosmos();
    expect(() => getDb()).toThrow(/Cosmos DB/);
  });
});
