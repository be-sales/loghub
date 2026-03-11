export function createRedisMock() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    scan: jest.fn().mockResolvedValue(['0', []]),
    eval: jest.fn(),
    ttl: jest.fn(),
  };
}
