import { evaluatePoll } from './poll-change';
import { normalizePollingConfig } from './polling-config';

const config = (extra: Record<string, unknown>) =>
  normalizePollingConfig({ endpoint: 'https://example.com', ...extra });

describe('evaluatePoll', () => {
  it('records a baseline on the first poll without firing', () => {
    expect(evaluatePoll(config({}), { a: 1 }, null).kind).toBe('baseline');
  });

  it('any: fires once with the whole response when it changes', () => {
    const c = config({});
    const first = evaluatePoll(c, { a: 1 }, null);
    expect(evaluatePoll(c, { a: 1 }, first.state).kind).toBe('unchanged');
    const changed = evaluatePoll(c, { a: 2 }, first.state);
    expect(changed).toMatchObject({ kind: 'changed', payloads: [{ a: 2 }] });
  });

  it('specific_field: ignores changes elsewhere in the response', () => {
    const c = config({ changeMode: 'specific_field', stateKey: 'version' });
    const first = evaluatePoll(c, { version: 1, noise: 'x' }, null);
    expect(evaluatePoll(c, { version: 1, noise: 'y' }, first.state).kind).toBe(
      'unchanged',
    );
    expect(evaluatePoll(c, { version: 2 }, first.state).kind).toBe('changed');
  });

  it('specific_field: supports JSONPath keys', () => {
    const c = config({ changeMode: 'specific_field', stateKey: '$.data.id' });
    const first = evaluatePoll(c, { data: { id: 1 } }, null);
    expect(evaluatePoll(c, { data: { id: 2 } }, first.state).kind).toBe(
      'changed',
    );
  });

  it('array_length: fires once per new item', () => {
    const c = config({ changeMode: 'array_length', stateKey: 'items' });
    const first = evaluatePoll(c, { items: [{ id: 1 }] }, null);
    const changed = evaluatePoll(
      c,
      { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      first.state,
    );
    expect(changed).toMatchObject({
      kind: 'changed',
      payloads: [{ id: 2 }, { id: 3 }],
    });
  });
});
