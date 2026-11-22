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

describe('escaping by context', () => {
  const payload = {
    quote: 'say "hi"\n',
    html: '<a href="x">click</a>',
    id: 'a/b?c=1&d',
    n: 5,
    obj: { a: 1 },
    url: 'https://example.com/x',
    md: 'a_b*c',
  };

  it('json: escapes inside strings, inserts JSON literals outside them', () => {
    const out = interpolate(
      '{"text": "{{payload.quote}}", "n": {{payload.n}}, "o": {{payload.obj}}, "s": {{payload.id}}}',
      payload,
      'json',
    );
    expect(JSON.parse(out)).toEqual({
      text: payload.quote,
      n: 5,
      o: { a: 1 },
      s: payload.id,
    });
  });

  it('json: a value cannot close its string and add a field', () => {
    const out = interpolate(
      '{"note": "{{payload.x}}"}',
      { x: '", "admin": true, "y": "' },
      'json',
    );
    expect(Object.keys(JSON.parse(out) as object)).toEqual(['note']);
  });

  it('json: escaped quotes in the literal text do not flip the string state', () => {
    const out = interpolate('{"a": "x\\"{{payload.quote}}"}', payload, 'json');
    expect((JSON.parse(out) as { a: string }).a).toBe(`x"${payload.quote}`);
  });

  it('url: encodes path and query values, leaves the host position raw', () => {
    expect(
      interpolate(
        'https://api.test/items/{{payload.id}}?q={{payload.id}}',
        payload,
        'url',
      ),
    ).toBe('https://api.test/items/a%2Fb%3Fc%3D1%26d?q=a%2Fb%3Fc%3D1%26d');
    expect(interpolate('{{payload.url}}', payload, 'url')).toBe(payload.url);
    expect(
      interpolate('{{payload.url}}/more/{{payload.id}}', payload, 'url'),
    ).toBe('https://example.com/x/more/a%2Fb%3Fc%3D1%26d');
  });

  it('html and markdown escape their specials', () => {
    expect(interpolate('<p>{{payload.html}}</p>', payload, 'html')).toBe(
      '<p>&lt;a href=&quot;x&quot;&gt;click&lt;/a&gt;</p>',
    );
    expect(interpolate('{{payload.md}}', payload, 'markdown')).toBe(
      'a\\_b\\*c',
    );
  });

  it('triple braces insert the value raw, in any context', () => {
    expect(interpolate('{{{payload.html}}}', payload, 'html')).toBe(
      payload.html,
    );
  });

  it('interpolateConfig applies a field’s context to everything under it', () => {
    expect(
      interpolateConfig(
        { body: '<b>{{payload.html}}</b>', subject: '{{payload.html}}' },
        payload,
        { body: 'html' },
      ),
    ).toEqual({
      body: '<b>&lt;a href=&quot;x&quot;&gt;click&lt;/a&gt;</b>',
      subject: payload.html,
    });
  });

  it('does not resolve through the prototype chain', () => {
    expect(interpolate('{{payload.constructor}}', {})).toBe(
      '{{payload.constructor}}',
    );
  });
});
