import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from './prisma.js';

/**
 * Private object storage. Files are never public: clients get short-lived signed URLs.
 * LocalDiskStorage is for development; add an S3/R2 implementation of this interface for production.
 */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

/** Keys are random and carry no patient information. */
export const newImageKey = () => `${randomUUID()}.jpg`;
export const KEY_PATTERN = /^[0-9a-f-]{36}\.jpg$/;

export class LocalDiskStorage implements Storage {
  constructor(private readonly dir: string) {}

  private path(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    return join(this.dir, key);
  }

  async put(key: string, data: Buffer) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(key), data);
  }

  async get(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

/** Stores files in Postgres — for hosts with no persistent disk (Render free, most PaaS). */
export class DatabaseStorage implements Storage {
  constructor(private readonly db: Db) {}

  async put(key: string, data: Buffer, contentType: string) {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    await this.db.storedFile.upsert({
      where: { key },
      create: { key, data: new Uint8Array(data), contentType },
      update: { data: new Uint8Array(data), contentType },
    });
  }

  async get(key: string) {
    if (!KEY_PATTERN.test(key)) return null;
    const row = await this.db.storedFile.findUnique({ where: { key } });
    return row ? Buffer.from(row.data) : null;
  }

  async delete(key: string) {
    if (!KEY_PATTERN.test(key)) return;
    await this.db.storedFile.deleteMany({ where: { key } });
  }
}

export function createStorage(driver: 'local' | 'db', dir: string, db: Db): Storage {
  return driver === 'db' ? new DatabaseStorage(db) : new LocalDiskStorage(dir);
}

const URL_TTL_SECONDS = 60 * 60;

function signature(secret: string, key: string, exp: number) {
  return createHmac('sha256', `files:${secret}`).update(`${key}:${exp}`).digest('base64url');
}

/** A relative, time-limited URL for a private file. */
export function signedFileUrl(secret: string, key: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + URL_TTL_SECONDS;
  return `/api/v1/files/${key}?exp=${exp}&sig=${signature(secret, key, exp)}`;
}

export function verifyFileSignature(secret: string, key: string, exp: string, sig: string, now = Date.now()) {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum * 1000 < now) return false;
  const expected = Buffer.from(signature(secret, key, expNum));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
