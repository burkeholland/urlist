import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAllEnvCaches, getAuthEnv, getCosmosEnv, getGitHubEnv } from '@/lib/env';

const originalEnv = { ...process.env };

describe('env getters', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COSMOS_ENDPOINT;
    delete process.env.COSMOS_KEY;
    delete process.env.COSMOS_DATABASE;
    delete process.env.AUTH_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    _resetAllEnvCaches();
  });

  it('getCosmosEnv throws if endpoint or key is missing', () => {
    expect(() => getCosmosEnv()).toThrow(/Cosmos DB/);
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

  it('getAuthEnv throws if secret is shorter than 32 chars', () => {
    process.env.AUTH_SECRET = 'short';
    expect(() => getAuthEnv()).toThrow(/AUTH_SECRET/);
  });

  it('getGitHubEnv throws if client id or secret is missing', () => {
    process.env.GITHUB_CLIENT_ID = 'id';
    expect(() => getGitHubEnv()).toThrow(/GITHUB_CLIENT_SECRET/);
  });

  it('caches results until caches are reset', () => {
    process.env.AUTH_SECRET = 'a'.repeat(32);
    const first = getAuthEnv();
    process.env.AUTH_SECRET = 'b'.repeat(32);
    expect(getAuthEnv()).toBe(first);
    _resetAllEnvCaches();
    expect(getAuthEnv()).not.toBe(first);
    expect(getAuthEnv().AUTH_SECRET).toBe('b'.repeat(32));
  });
});
