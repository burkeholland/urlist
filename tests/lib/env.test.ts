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

  it('getAuthEnv throws if secret is shorter than 32 chars', () => {
    process.env.AUTH_SECRET = 'short';
    expect(() => getAuthEnv()).toThrow(/Missing or invalid Auth environment variables/);
    expect(() => getAuthEnv()).toThrow(/AUTH_SECRET must be at least 32 characters/);
  });

  it('getGitHubEnv throws if client id or secret is missing', () => {
    process.env.GITHUB_CLIENT_ID = 'id';
    expect(() => getGitHubEnv()).toThrow(/Missing or invalid GitHub OAuth environment variables/);
  });

  it('getGitHubEnv rejects empty values', () => {
    process.env.GITHUB_CLIENT_ID = '';
    process.env.GITHUB_CLIENT_SECRET = '';
    expect(() => getGitHubEnv()).toThrow(/GITHUB_CLIENT_ID is required/);
    expect(() => getGitHubEnv()).toThrow(/GITHUB_CLIENT_SECRET is required/);
  });

  it('getGitHubEnv returns validated env', () => {
    process.env.GITHUB_CLIENT_ID = 'id';
    process.env.GITHUB_CLIENT_SECRET = 'secret';
    expect(getGitHubEnv()).toEqual({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' });
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
