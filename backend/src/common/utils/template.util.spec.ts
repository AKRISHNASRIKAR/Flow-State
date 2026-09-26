import { interpolate, interpolateConfig } from './template.util';

describe('interpolate', () => {
  it('resolves nested payload paths', () => {
    expect(
      interpolate('Hi {{payload.user.name}}', { user: { name: 'Ada' } }),
    ).toBe('Hi Ada');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('{{  payload.x  }}', { x: 'ok' })).toBe('ok');
  });

  it('leaves an unresolvable placeholder visible instead of throwing', () => {
    expect(interpolate('Hi {{payload.missing.deep}}', {})).toBe(
      'Hi {{payload.missing.deep}}',
    );
  });

  it('leaves null values unresolved rather than printing "null"', () => {
    expect(interpolate('{{payload.x}}', { x: null })).toBe('{{payload.x}}');
  });

  it('stringifies numbers, booleans, and objects', () => {
    const payload = { n: 0, b: false, o: { a: 1 } };
    expect(
      interpolate('{{payload.n}}|{{payload.b}}|{{payload.o}}', payload),
    ).toBe('0|false|{"a":1}');
  });

  it('indexes into arrays by position', () => {
    expect(interpolate('{{payload.items.1}}', { items: ['a', 'b'] })).toBe('b');
  });

  it('only resolves against the payload root', () => {
    expect(interpolate('{{x}}', { x: 'nope' })).toBe('{{x}}');
  });
});

describe('interpolateConfig', () => {
  it('recurses through objects and arrays, leaving non-strings untouched', () => {
    const config = {
      subject: 'New {{payload.kind}}',
      to: ['{{payload.email}}', 'static@example.com'],
      nested: { count: 3, enabled: true, note: null },
    };

    expect(
      interpolateConfig(config, { kind: 'order', email: 'a@b.co' }),
    ).toEqual({
      subject: 'New order',
      to: ['a@b.co', 'static@example.com'],
      nested: { count: 3, enabled: true, note: null },
    });
  });

  it('does not mutate the stored config', () => {
    const config = { text: '{{payload.x}}' };
    interpolateConfig(config, { x: 'y' });
    expect(config.text).toBe('{{payload.x}}');
  });

  it('can template against a previous HTTP step’s enrichment', () => {
    const payload = { http: { status: 201, body: { id: 'ord_1' } } };
    expect(
      interpolateConfig({ url: '/orders/{{payload.http.body.id}}' }, payload),
    ).toEqual({ url: '/orders/ord_1' });
  });
});
