import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function copyIfExists(source: string, destination: string): Promise<boolean> {
  if (!(await fileExists(source))) return false;
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
  return true;
}
