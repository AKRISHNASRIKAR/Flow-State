import { evaluatePoll, MAX_TRACKED_ITEMS, PollState } from './poll-change';
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

describe('evaluatePoll: array_length compares item sets', () => {
  const c = config({ changeMode: 'array_length', stateKey: 'items' });

  it('fires for a new item even when the list keeps its length', () => {
    const first = evaluatePoll(c, { items: [{ id: 1 }, { id: 2 }] }, null);
    const next = evaluatePoll(
      c,
      { items: [{ id: 2 }, { id: 3 }] },
      first.state,
    );
    expect(next).toMatchObject({ kind: 'changed', payloads: [{ id: 3 }] });
  });

  it('does not fire when items only disappear', () => {
    const first = evaluatePoll(c, { items: [{ id: 1 }, { id: 2 }] }, null);
    expect(evaluatePoll(c, { items: [{ id: 2 }] }, first.state).kind).toBe(
      'unchanged',
    );
  });

  it('stores digests, not the items', () => {
    const big = { items: [{ id: 1, text: 'x'.repeat(10_000) }] };
    const json = JSON.stringify(evaluatePoll(c, big, null).state);
    expect(json.length).toBeLessThan(200);
  });

  it('refuses a list too long to track, instead of silently failing later', () => {
    const items = Array.from({ length: MAX_TRACKED_ITEMS + 1 }, (_, i) => i);
    expect(() => evaluatePoll(c, { items }, null)).toThrow(/at most/);
  });

  it('reads a state written before digests without firing or missing', () => {
    const legacy: PollState = {
      mode: 'array_length',
      comparison: 2,
      items: [{ id: 1 }, { id: 2 }],
    };
    expect(
      evaluatePoll(c, { items: [{ id: 1 }, { id: 2 }] }, legacy).kind,
    ).toBe('unchanged');
    expect(
      evaluatePoll(c, { items: [{ id: 2 }, { id: 9 }] }, legacy),
    ).toMatchObject({
      kind: 'changed',
      payloads: [{ id: 9 }],
    });
  });
});

describe('evaluatePoll: legacy states for the other modes', () => {
  it('any: a pre-digest state compares equal to the same response', () => {
    const body = { a: 1 };
    const legacy: PollState = { mode: 'any', comparison: JSON.stringify(body) };
    expect(evaluatePoll(config({}), body, legacy).kind).toBe('unchanged');
    expect(evaluatePoll(config({}), { a: 2 }, legacy).kind).toBe('changed');
  });

  it('specific_field: a pre-digest state compares equal to the same value', () => {
    const c = config({ changeMode: 'specific_field', stateKey: 'version' });
    const legacy: PollState = { mode: 'specific_field', comparison: 3 };
    expect(evaluatePoll(c, { version: 3, noise: 1 }, legacy).kind).toBe(
      'unchanged',
    );
  });

  it('a changed mode starts again from a baseline', () => {
    const first = evaluatePoll(config({}), { items: [1] }, null);
    const c = config({ changeMode: 'array_length', stateKey: 'items' });
    expect(evaluatePoll(c, { items: [1, 2] }, first.state).kind).toBe(
      'baseline',
    );
  });
});
