import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MESSAGE_LIMIT_PER_MINUTE,
  DEFAULT_SESSION_CREATE_LIMIT_PER_HOUR,
  getMessageLimitPerMinute,
  getSessionCreateLimitPerHour,
} from '../src/config/study';

describe('rate-limit configuration', () => {
  afterEach(() => {
    delete process.env.SESSION_CREATE_LIMIT_PER_HOUR;
    delete process.env.MESSAGE_LIMIT_PER_MINUTE;
  });

  it('uses NAT-safe defaults', () => {
    expect(DEFAULT_SESSION_CREATE_LIMIT_PER_HOUR).toBe(60);
    expect(DEFAULT_MESSAGE_LIMIT_PER_MINUTE).toBe(30);
    expect(getSessionCreateLimitPerHour()).toBe(60);
    expect(getMessageLimitPerMinute()).toBe(30);
  });

  it('honors positive integer overrides from the environment', () => {
    process.env.SESSION_CREATE_LIMIT_PER_HOUR = '200';
    process.env.MESSAGE_LIMIT_PER_MINUTE = '45';
    expect(getSessionCreateLimitPerHour()).toBe(200);
    expect(getMessageLimitPerMinute()).toBe(45);
  });

  it('falls back to the defaults for invalid values', () => {
    for (const bad of ['0', '-3', 'abc', '', ' ', '1.5x']) {
      process.env.SESSION_CREATE_LIMIT_PER_HOUR = bad;
      expect(getSessionCreateLimitPerHour(), `value ${JSON.stringify(bad)}`).toBe(60);
    }
  });
});
