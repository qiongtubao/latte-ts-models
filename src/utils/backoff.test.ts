import { calculateBackoff, formatDelay } from './backoff';

describe('退避算法', () => {
  describe('calculateBackoff', () => {
    test('n=0 时基础延迟为 500-600ms', () => {
      const delay = calculateBackoff(0);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThan(600);
    });

    test('n=1 时基础延迟为 1000-1100ms', () => {
      const delay = calculateBackoff(1);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThan(1100);
    });

    test('n=2 时基础延迟为 2000-2100ms', () => {
      const delay = calculateBackoff(2);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThan(2100);
    });

    test('n=3 时基础延迟为 4000-4100ms', () => {
      const delay = calculateBackoff(3);
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThan(4100);
    });

    test('大 n 值上限为 24 小时', () => {
      const delay = calculateBackoff(100);
      expect(delay).toBeLessThanOrEqual(86_400_000);
    });

    test('jitter 有效性（多次调用结果不同）', () => {
      const delays = new Set();
      for (let i = 0; i < 10; i++) {
        delays.add(calculateBackoff(5));
      }
      // 由于 jitter，多次调用应该产生不同的结果
      expect(delays.size).toBeGreaterThan(1);
    });

    test('负数输入返回 500-600ms', () => {
      const delay = calculateBackoff(-1);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThan(600);
    });

    test('小数输入向下取整', () => {
      const delay = calculateBackoff(2.5);
      // 2.5 向下取整为 2，基础延迟 2000ms
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThan(2100);
    });
  });

  describe('formatDelay', () => {
    test('毫秒格式化', () => {
      expect(formatDelay(500)).toBe('500ms');
      expect(formatDelay(999)).toBe('999ms');
    });

    test('秒格式化', () => {
      expect(formatDelay(1000)).toBe('1.0s');
      expect(formatDelay(5500)).toBe('5.5s');
      expect(formatDelay(59999)).toBe('60.0s');
    });

    test('分钟格式化', () => {
      expect(formatDelay(60000)).toBe('1.0min');
      expect(formatDelay(120000)).toBe('2.0min');
      expect(formatDelay(3599999)).toBe('60.0min');
    });

    test('小时格式化', () => {
      expect(formatDelay(3600000)).toBe('1.0h');
      expect(formatDelay(7200000)).toBe('2.0h');
    });
  });
});
