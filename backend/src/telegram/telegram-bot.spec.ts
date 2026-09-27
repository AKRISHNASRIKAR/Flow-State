import {
  TelegramUserRecord,
  handleTelegramUpdate,
  isValidTelegramSecret,
} from './telegram-bot';

describe('isValidTelegramSecret', () => {
  it('accepts only an exact match', () => {
    expect(isValidTelegramSecret('s3cret', 's3cret')).toBe(true);
    expect(isValidTelegramSecret('s3creT', 's3cret')).toBe(false);
    expect(isValidTelegramSecret('s3cret-longer', 's3cret')).toBe(false);
  });

  it('refuses everything when no secret is configured', () => {
    expect(isValidTelegramSecret('', undefined)).toBe(false);
    expect(isValidTelegramSecret('anything', undefined)).toBe(false);
    expect(isValidTelegramSecret(undefined, 's3cret')).toBe(false);
  });
});

describe('handleTelegramUpdate', () => {
  let fetchMock: jest.SpyInstance<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >;
  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  });
  afterEach(() => fetchMock.mockRestore());

  const update = (text: string) => ({
    message: {
      text,
      chat: { id: 555 },
      from: { id: 42, username: 'ada', first_name: 'Ada' },
    },
  });

  function sentBody(): { chat_id: number; text: string } {
    const init = fetchMock.mock.calls[0][1];
    return JSON.parse(init?.body as string) as {
      chat_id: number;
      text: string;
    };
  }

  it('/start saves the user and replies with their ID', async () => {
    const saved: TelegramUserRecord[] = [];
    await handleTelegramUpdate(update('/start'), {
      botToken: 'T',
      saveUser: (u) => {
        saved.push(u);
        return Promise.resolve();
      },
    });

    expect(saved).toEqual([
      expect.objectContaining({ telegramId: 42, chatId: 555, username: 'ada' }),
    ]);
    expect(fetchMock.mock.calls[0][0] as string).toBe(
      'https://api.telegram.org/botT/sendMessage',
    );
    expect(sentBody().chat_id).toBe(555);
    expect(sentBody().text).toContain('<code>42</code>');
  });

  it('/id@BotName replies without saving', async () => {
    const saveUser = jest.fn();
    await handleTelegramUpdate(update('/id@FlowStateBot'), {
      botToken: 'T',
      saveUser,
    });
    expect(saveUser).not.toHaveBeenCalled();
    expect(sentBody().text).toContain('<code>42</code>');
  });

  it('ignores other messages and malformed updates', async () => {
    const saveUser = jest.fn();
    await handleTelegramUpdate(update('hello'), { botToken: 'T', saveUser });
    await handleTelegramUpdate(null, { botToken: 'T', saveUser });
    await handleTelegramUpdate(
      { edited_message: {} },
      { botToken: 'T', saveUser },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveUser).not.toHaveBeenCalled();
  });
});
