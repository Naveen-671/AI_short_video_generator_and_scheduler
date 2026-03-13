import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeMkdir } from './fsutils.js';

const LOG_DIR = process.env['LOG_DIR'] || './logs';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  module: string;
  runId?: string;
  message: string;
  stack?: string;
}

function formatEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    `[${entry.module}]`,
  ];
  if (entry.runId) parts.push(`[runId:${entry.runId}]`);
  parts.push(entry.message);
  if (entry.stack) parts.push(`\n${entry.stack}`);
  return parts.join(' ');
}

function appendToLog(module: string, entry: LogEntry): void {
  safeMkdir(LOG_DIR);
  const logFile = path.join(LOG_DIR, `${module}.log`);
  fs.appendFileSync(logFile, formatEntry(entry) + '\n', 'utf-8');
}

export function createLogger(module: string, runId?: string) {
  const log = (level: LogEntry['level'], message: string, error?: Error) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      runId,
      message,
      stack: error?.stack,
    };
    appendToLog(module, entry);
  };

  return {
    info: (msg: string) => log('info', msg),
    warn: (msg: string) => log('warn', msg),
    error: (msg: string, err?: Error) => log('error', msg, err),
  };
}
