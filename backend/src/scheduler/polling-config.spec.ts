import {
  MIN_POLLING_INTERVAL_SECONDS,
  normalizePollingConfig,
} from './polling-config';

const ENDPOINT = 'https://api.example.com/items';

describe('normalizePollingConfig', () => {
  it('applies defaults for a minimal config', () => {
    expect(normalizePollingConfig({ endpoint: ENDPOINT })).toEqual({
      interval: 60,
      endpoint: ENDPOINT,
      method: 'GET',
      headers: {},
      stateKey: undefined,
      changeMode: 'any',
    });
  });

  it('rejects non-object configs', () => {
    expect(() => normalizePollingConfig(null)).toThrow('must be an object');
    expect(() => normalizePollingConfig([ENDPOINT])).toThrow(
      'must be an object',
    );
  });

  it('enforces the minimum interval', () => {
    expect(() =>
      normalizePollingConfig({
        endpoint: ENDPOINT,
        interval: MIN_POLLING_INTERVAL_SECONDS - 1,
      }),
    ).toThrow(`at least ${MIN_POLLING_INTERVAL_SECONDS} seconds`);
    expect(
      normalizePollingConfig({
        endpoint: ENDPOINT,
        interval: MIN_POLLING_INTERVAL_SECONDS,
      }).interval,
    ).toBe(MIN_POLLING_INTERVAL_SECONDS);
  });

  it('rejects a non-numeric interval', () => {
    expect(() =>
      normalizePollingConfig({ endpoint: ENDPOINT, interval: 'soon' }),
    ).toThrow('at least');
  });

  it('requires a valid endpoint URL', () => {
    expect(() => normalizePollingConfig({})).toThrow('endpoint is required');
    expect(() => normalizePollingConfig({ endpoint: '   ' })).toThrow(
      'endpoint is required',
    );
    expect(() => normalizePollingConfig({ endpoint: 'not a url' })).toThrow(
      'valid URL',
    );
  });

  it('upper-cases the method and rejects unsupported ones', () => {
    expect(
      normalizePollingConfig({ endpoint: ENDPOINT, method: 'post' }).method,
    ).toBe('POST');
    expect(() =>
      normalizePollingConfig({ endpoint: ENDPOINT, method: 'TRACE' }),
    ).toThrow('Unsupported polling method: TRACE');
    expect(() =>
      normalizePollingConfig({ endpoint: ENDPOINT, method: 42 }),
    ).toThrow('method must be a string');
  });

  it('validates changeMode', () => {
    expect(() =>
      normalizePollingConfig({ endpoint: ENDPOINT, changeMode: 'sometimes' }),
    ).toThrow('changeMode must be any, specific_field, or array_length');
  });

  it('requires a stateKey for specific_field', () => {
    expect(() =>
      normalizePollingConfig({
        endpoint: ENDPOINT,
        changeMode: 'specific_field',
        stateKey: '  ',
      }),
    ).toThrow('stateKey is required');

    expect(
      normalizePollingConfig({
        endpoint: ENDPOINT,
        changeMode: 'specific_field',
        stateKey: 'data.version',
      }).stateKey,
    ).toBe('data.version');
  });

  it('keeps scalar headers as strings and drops the rest', () => {
    expect(
      normalizePollingConfig({
        endpoint: ENDPOINT,
        headers: {
          Authorization: 'Bearer t',
          'X-Count': 3,
          'X-Flag': true,
          'X-Obj': { nested: true },
          'X-Null': null,
        },
      }).headers,
    ).toEqual({ Authorization: 'Bearer t', 'X-Count': '3', 'X-Flag': 'true' });
  });

  it('ignores headers that are not an object', () => {
    expect(
      normalizePollingConfig({ endpoint: ENDPOINT, headers: ['a'] }).headers,
    ).toEqual({});
  });
});
