interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  service: string;
  traceId?: string;
  data?: Record<string, unknown>;
}

export function log(entry: LogEntry): void {
  console.log(
    JSON.stringify({
      severity: entry.level.toUpperCase(),
      message: entry.message,
      service: entry.service,
      traceId: entry.traceId,
      ...entry.data,
      timestamp: new Date().toISOString(),
    }),
  );
}
