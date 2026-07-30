import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '@/lib/logger';

describe('log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes a JSON log line to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log({ level: 'warn', message: 'something happened', service: 'rtdb', traceId: 't-1', data: { foo: 'bar' } });
    expect(spy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.severity).toBe('WARN');
    expect(output.message).toBe('something happened');
    expect(output.service).toBe('rtdb');
    expect(output.traceId).toBe('t-1');
    expect(output.foo).toBe('bar');
    expect(typeof output.timestamp).toBe('string');
  });

  it('omits traceId and data when not provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log({ level: 'error', message: 'boom', service: 'api' });
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.severity).toBe('ERROR');
    expect('traceId' in output && output.traceId !== undefined).toBe(false);
  });
});
