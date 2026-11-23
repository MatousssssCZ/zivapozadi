/** Kanonický JSON (seřazené klíče) – základ pro otisky projektu a checkpointů. */
export function canonicalJson(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return '[' + x.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(x as object).filter((k) => (x as Record<string, unknown>)[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson((x as Record<string, unknown>)[k])).join(',') + '}';
}

/** 64bitový otisk (dvě nezávislé FNV-1a varianty) jako hex. Nejde o kryptografii, jen o detekci změn. */
export function fingerprint(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i; h2 = Math.imul(h2, 0x5bd1e995); h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
