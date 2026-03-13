import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Ensure a directory exists, creating intermediate dirs as needed.
 */
export function safeMkdir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Write an object as pretty-printed JSON to a file, creating parent dirs.
 */
export function writeJson(filePath: string, data: unknown): void {
  safeMkdir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Read and parse a JSON file. Returns undefined if the file does not exist.
 */
export function readJson<T = unknown>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}
