// ── Event log drawer: streams state transitions to build trust ──

export type LogLevel = 'info' | 'good' | 'warn' | 'bad';

export interface LogEntry {
  time: string;
  level: LogLevel;
  message: string;
}

const ICONS: Record<LogLevel, string> = {
  info: '·',
  good: '✓',
  warn: '!',
  bad: '✕',
};

export class EventLog {
  private entries: LogEntry[] = [];
  private listeners = new Set<(entries: LogEntry[]) => void>();

  add(message: string, level: LogLevel = 'info'): void {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    this.entries.push({ time, level, message });
    if (this.entries.length > 500) this.entries.shift();
    this.emit();
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  all(): LogEntry[] {
    return this.entries.slice();
  }

  /** Plain-text dump for copying. */
  toText(): string {
    return this.entries
      .map((e) => `[${e.time}] ${ICONS[e.level]} ${e.message}`)
      .join('\n');
  }

  subscribe(fn: (entries: LogEntry[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.all());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snapshot = this.all();
    for (const fn of this.listeners) fn(snapshot);
  }
}

export function iconFor(level: LogLevel): string {
  return ICONS[level];
}
