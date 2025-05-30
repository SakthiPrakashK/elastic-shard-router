export class EsShardRouterMurmur3Hash {
  /**
   * Computes the Murmur3 hash for the given routing string.
   * @param routing The string to hash.
   * @returns The 32-bit signed hash value.
   */
  static hash(routing: string): number {
    const strLen = routing.length;
    const bytesToHash = Buffer.alloc(strLen * 2);
    for (let i = 0; i < strLen; i++) {
      bytesToHash.writeUInt16LE(routing.charCodeAt(i), 2 * i);
    }
    return EsShardRouterMurmur3Hash._murmurhash3_x86_32(bytesToHash, 0, strLen * 2, 0);
  }

  /**
   * MurmurHash3 x86 32-bit implementation.
   * @param data Buffer of bytes to hash
   * @param offset Start offset in buffer
   * @param length Number of bytes to hash
   * @param seed Hash seed
   * @returns 32-bit signed hash value
   */
  private static _murmurhash3_x86_32(
    data: Buffer,
    offset: number,
    length: number,
    seed: number,
  ): number {
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;
    const r1 = 15;
    const r2 = 13;
    const m = 5;
    const n = 0xe6546b64;
    let hash = seed >>> 0;
    const chunks = Math.floor(length / 4);
    for (let i = 0; i < chunks; i++) {
      let k = data.readUInt32LE(offset + i * 4);
      k = Math.imul(k, c1) >>> 0;
      k = ((k << r1) | (k >>> (32 - r1))) >>> 0;
      k = Math.imul(k, c2) >>> 0;
      hash ^= k;
      hash = ((hash << r2) | (hash >>> (32 - r2))) >>> 0;
      hash = (Math.imul(hash, m) + n) >>> 0;
    }
    const remaining = length % 4;
    if (remaining > 0) {
      let k = 0;
      const tailStart = offset + chunks * 4;
      if (remaining >= 3) k ^= data[tailStart + 2] << 16;
      if (remaining >= 2) k ^= data[tailStart + 1] << 8;
      if (remaining >= 1) k ^= data[tailStart];
      k = Math.imul(k, c1) >>> 0;
      k = ((k << r1) | (k >>> (32 - r1))) >>> 0;
      k = Math.imul(k, c2) >>> 0;
      hash ^= k;
    }
    hash ^= length;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b) >>> 0;
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
    hash ^= hash >>> 16;
    // Convert to signed 32-bit int
    if (hash >= 0x80000000) {
      hash -= 0x100000000;
    }
    return hash;
  }
}
