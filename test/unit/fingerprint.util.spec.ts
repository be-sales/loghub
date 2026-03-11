import { computeFingerprint } from '@shared/utils/fingerprint.util';

describe('computeFingerprint', () => {
  const serviceId = 'svc_test_123';
  const level = 'ERROR';

  it('должен возвращать одинаковый fingerprint для одинаковых данных', () => {
    const fp1 = computeFingerprint(serviceId, level, 'DB error', 'at db.ts:1:1');
    const fp2 = computeFingerprint(serviceId, level, 'DB error', 'at db.ts:1:1');
    expect(fp1).toBe(fp2);
  });

  it('должен возвращать разные fingerprints для разных сервисов', () => {
    const fp1 = computeFingerprint('svc_a', level, 'error', null);
    const fp2 = computeFingerprint('svc_b', level, 'error', null);
    expect(fp1).not.toBe(fp2);
  });

  it('должен возвращать разные fingerprints для разных level', () => {
    const fp1 = computeFingerprint(serviceId, 'ERROR', 'error', null);
    const fp2 = computeFingerprint(serviceId, 'WARN', 'error', null);
    expect(fp1).not.toBe(fp2);
  });

  it('должен нормализовать числа в message', () => {
    const fp1 = computeFingerprint(serviceId, level, 'Timeout after 3000ms', null);
    const fp2 = computeFingerprint(serviceId, level, 'Timeout after 5000ms', null);
    expect(fp1).toBe(fp2);
  });

  it('должен нормализовать line:col в stack trace', () => {
    const fp1 = computeFingerprint(serviceId, level, 'err', 'at foo.ts:42:10');
    const fp2 = computeFingerprint(serviceId, level, 'err', 'at foo.ts:99:3');
    expect(fp1).toBe(fp2);
  });

  it('должен использовать только первые N строк stack trace', () => {
    const stack1 = 'line1\nline2\nline3\nline4\nline5';
    const stack2 = 'line1\nline2\nline3\ndifferent4\ndifferent5';
    const fp1 = computeFingerprint(serviceId, level, 'err', stack1);
    const fp2 = computeFingerprint(serviceId, level, 'err', stack2);
    expect(fp1).toBe(fp2); // Потому что FINGERPRINT_STACK_LINES = 3
  });

  it('должен корректно обрабатывать null stack trace', () => {
    const fp1 = computeFingerprint(serviceId, level, 'err', null);
    const fp2 = computeFingerprint(serviceId, level, 'err', undefined);
    expect(fp1).toBe(fp2);
  });

  it('должен возвращать hex string длиной 64', () => {
    const fp = computeFingerprint(serviceId, level, 'err', null);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('должен корректно обрабатывать пустой message', () => {
    const fp = computeFingerprint(serviceId, level, '', null);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('должен корректно обрабатывать очень длинный message', () => {
    const longMessage = 'x'.repeat(100_000);
    const fp = computeFingerprint(serviceId, level, longMessage, null);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});
