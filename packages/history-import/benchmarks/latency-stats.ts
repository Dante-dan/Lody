/** Both tinybench 2.x and 3.x results, without treating missing measurements as zero. */
export type LatencyStats = { mean?: number; p99?: number; max?: number; samples?: unknown[] };
type MeasuredTask = {
  name: string;
  result?: LatencyStats & { error?: unknown; latency?: LatencyStats };
};

export function measuredLatency(task: MeasuredTask): Required<LatencyStats> {
  if (task.result?.error !== undefined) {
    throw new Error(`Benchmark ${task.name} failed`, { cause: task.result.error });
  }
  const stats = task.result?.latency ?? task.result;
  if (
    !stats?.samples?.length ||
    ![stats.mean, stats.p99, stats.max].every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
    )
  ) {
    throw new Error(`Benchmark ${task.name} did not produce valid latency measurements`);
  }
  return stats as Required<LatencyStats>;
}
