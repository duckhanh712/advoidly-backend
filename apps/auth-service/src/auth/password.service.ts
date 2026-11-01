import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id with the OWASP-recommended baseline (19 MiB memory, 2 iterations, 1 lane).
 * Parameters are encoded in each hash, so they can be raised later; `needsRehash` lets
 * login transparently upgrade old hashes.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  /** Hash of a random value, used to keep login timing similar for unknown emails. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, HASH_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, HASH_OPTIONS);
  }

  /** Performs a verification that always fails, to mitigate user enumeration by timing. */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(`dummy-${Math.random()}`);
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
