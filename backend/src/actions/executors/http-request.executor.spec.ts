import { HttpRequestExecutor } from './http-request.executor';
import {
  MAX_RESPONSE_BYTES,
  MAX_STORED_BODY_BYTES,
} from '../../common/utils/response-body';
import { runAction } from '../run-action';

const executor = new HttpRequestExecutor();
const realFetch = global.fetch;

function respondWith(response: Response) {
  const fetchMock = jest.fn().mockResolvedValue(response);
  global.fetch = fetchMock;
  return fetchMock;
}

afterEach(() => {
  global.fetch = realFetch;
});

describe('HttpRequestExecutor', () => {
  it('publishes a normal JSON body under payload.http', async () => {
    respondWith(Response.json({ id: 'ord_1' }));
    const result = await executor.execute({ url: 'https://api.test/x' });
    expect(result).toMatchObject({
      success: true,
      enrichedPayload: { http: { status: 200, body: { id: 'ord_1' } } },
    });
  });

  it('cuts an oversized body to a preview instead of failing the run', async () => {
    respondWith(new Response('x'.repeat(MAX_STORED_BODY_BYTES + 1)));
    const result = await executor.execute({ url: 'https://api.test/x' });
    expect(result.success).toBe(true);
    expect(result.enrichedPayload?.http).toMatchObject({ truncated: true });
    const body = (result.enrichedPayload?.http as { body: string }).body;
    expect(body.length).toBeLessThan(MAX_STORED_BODY_BYTES);
  });

  it('refuses a response past the read limit, without retrying', async () => {
    respondWith(new Response('x'.repeat(MAX_RESPONSE_BYTES + 1)));
    const result = await executor.execute({ url: 'https://api.test/x' });
    expect(result).toMatchObject({ success: false, retryable: false });
  });

  it('marks 4xx as not worth retrying, and 429/5xx as worth it', async () => {
    respondWith(new Response('nope', { status: 404 }));
    expect(await executor.execute({ url: 'https://api.test/x' })).toMatchObject(
      {
        success: false,
        retryable: false,
      },
    );
    respondWith(new Response('busy', { status: 503 }));
    expect(await executor.execute({ url: 'https://api.test/x' })).toMatchObject(
      {
        retryable: true,
      },
    );
    respondWith(new Response('slow down', { status: 429 }));
    expect(await executor.execute({ url: 'https://api.test/x' })).toMatchObject(
      {
        retryable: true,
      },
    );
  });

  it('rejects a URL that is not http(s) before sending anything', async () => {
    const fetchMock = respondWith(new Response('x'));
    const result = await executor.execute({ url: 'file:///etc/passwd' });
    expect(result).toMatchObject({ success: false, retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('escapes payload values into the URL and a JSON body', async () => {
    const fetchMock = respondWith(Response.json({}));
    await runAction(
      new Map([['HTTP_REQUEST', executor]]),
      'HTTP_REQUEST',
      {
        url: 'https://api.test/items/{{payload.id}}',
        method: 'POST',
        body: '{"note": "{{payload.note}}"}',
      },
      { id: '1/../admin', note: 'a "quoted" note' },
      { userId: 'u', workflowId: 'w', executionId: 'e' },
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/items/1%2F..%2Fadmin');
    expect(JSON.parse(init.body as string)).toEqual({
      note: 'a "quoted" note',
    });
  });
});
