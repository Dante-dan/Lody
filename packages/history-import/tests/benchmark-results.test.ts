import { describe, expect, it } from 'vitest';
import { Bench } from 'tinybench';
import { measuredLatency } from '../benchmarks/latency-stats';

describe('benchmark measurements', () => {
  it('rejects an actual throwing task rather than reporting a zero-duration success', async () => {
    const bench = new Bench({ time: 0, iterations: 1 });
    bench.add('open', () => {
      throw new Error('synthetic open failure');
    });
    await bench.run();
    expect(() => measuredLatency(bench.tasks[0]!)).toThrow('Benchmark open failed');
  });
  it.each([
    undefined,
    {},
    { mean: 0, p99: 0, max: 0, samples: [] },
    { mean: NaN, p99: 1, max: 1, samples: [1] },
  ])('rejects missing or invalid stats: %j', (result) => {
    expect(() => measuredLatency({ name: 'open', result })).toThrow('valid latency');
  });
  it('accepts measured zero and both supported tinybench shapes', () => {
    const stats = { mean: 0, p99: 0, max: 0, samples: [0] };
    expect(measuredLatency({ name: 'open', result: stats })).toEqual(stats);
    expect(measuredLatency({ name: 'open', result: { latency: stats } })).toEqual(stats);
  });
});
