import { DedupFlushService } from '@core/dedup/dedup-flush.service';
import { DEDUP_WINDOW_SECONDS } from '@shared/constants';

describe('DedupFlushService', () => {
  const dedupMock = {
    getActiveEntries: jest.fn(),
    clearEntry: jest.fn(),
  };
  const telegramMock = {
    sendDedupSummary: jest.fn(),
  };
  const prismaMock = {
    errorLog: {
      findFirst: jest.fn(),
    },
  };

  let service: DedupFlushService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DedupFlushService(
      dedupMock as never,
      telegramMock as never,
      prismaMock as never,
    );
  });

  it('должен передавать fingerprint в dedup summary и очищать запись', async () => {
    dedupMock.getActiveEntries.mockResolvedValue([
      {
        fingerprint:
          'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        value: {
          count: 3,
          serviceId: 'svc_1',
          firstLogId: 'log_1',
        },
      },
    ]);
    prismaMock.errorLog.findFirst.mockResolvedValue({
      fingerprint:
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      level: 'ERROR',
      message: 'Something failed',
      serviceId: 'svc_1',
    });

    await service.flush();

    expect(telegramMock.sendDedupSummary).toHaveBeenCalledWith('svc_1', {
      level: 'ERROR',
      message: 'Something failed',
      repeatCount: 2,
      windowSeconds: DEDUP_WINDOW_SECONDS,
      fingerprint:
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });
    expect(dedupMock.clearEntry).toHaveBeenCalledWith(
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    );
  });
});
