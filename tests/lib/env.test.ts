import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAllEnvCaches, getCosmosEnv } from '@/lib/env';

const originalEnv = { ...process.env };

describe('env getters', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COSMOS_ENDPOINT;
    delete process.env.COSMOS_KEY;
    delete process.env.COSMOS_DATABASE;
    _resetAllEnvCaches();
  });

  it('getCosmosEnv throws if endpoint or key is missing', () => {
    expect(() => getCosmosEnv()).toThrow(/Cosmos DB/);
  });

  it('error message lists each invalid variable with its reason', () => {
    const err = (() => { try { getCosmosEnv(); } catch (e) { return (e as Error).message; } })()!;
    expect(err).toContain('Missing or invalid Cosmos DB environment variables:');
    expect(err).toContain('\n  COSMOS_ENDPOINT: ');
    expect(err).toContain('\n  COSMOS_KEY: ');
  });

  it('getCosmosEnv rejects a non-URL endpoint', () => {
    process.env.COSMOS_ENDPOINT = 'not-a-url';
    process.env.COSMOS_KEY = 'key';
    expect(() => getCosmosEnv()).toThrow(/COSMOS_ENDPOINT must be a valid URL/);
  });

  it('getCosmosEnv rejects an empty key', () => {
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
    process.env.COSMOS_KEY = '';
    expect(() => getCosmosEnv()).toThrow(/COSMOS_KEY is required/);
  });

  it('getCosmosEnv respects an explicit COSMOS_DATABASE', () => {
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
    process.env.COSMOS_KEY = 'key';
    process.env.COSMOS_DATABASE = 'other-db';
    expect(getCosmosEnv().COSMOS_DATABASE).toBe('other-db');
  });

  it('getCosmosEnv returns validated env and defaults database', () => {
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com:443/';
    process.env.COSMOS_KEY = 'key';
    expect(getCosmosEnv()).toEqual({
      COSMOS_ENDPOINT: process.env.COSMOS_ENDPOINT,
      COSMOS_KEY: 'key',
      COSMOS_DATABASE: 'urlist',
    });
  });

  it('caches results until caches are reset', () => {
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
    process.env.COSMOS_KEY = 'key';
    process.env.COSMOS_DATABASE = 'first-db';
    const first = getCosmosEnv();
    process.env.COSMOS_DATABASE = 'second-db';
    expect(getCosmosEnv()).toBe(first);
    _resetAllEnvCaches();
    expect(getCosmosEnv()).not.toBe(first);
    expect(getCosmosEnv().COSMOS_DATABASE).toBe('second-db');
  });
});
