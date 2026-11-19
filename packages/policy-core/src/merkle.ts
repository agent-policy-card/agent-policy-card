import { concat, keccak256, stringToBytes, type Hex } from "viem";

const ZERO_HASH: Hex = `0x${"0".repeat(64)}`;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export function leafHash(line: string): Hex {
  return keccak256(stringToBytes(line));
}

function pairHash(a: Hex, b: Hex): Hex {
  const [lo, hi] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(concat([lo, hi]));
}

export function merkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) return ZERO_HASH;
  let level: Hex[] = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      next.push(right === undefined ? left : pairHash(left, right));
    }
    level = next;
  }
  return level[0]!;
}

export function merkleProof(leaves: Hex[], index: number): Hex[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new RangeError(`leaf index ${index} out of range [0, ${leaves.length})`);
  }
  const proof: Hex[] = [];
  let level: Hex[] = [...leaves];
  let idx = index;
  while (level.length > 1) {
    const sibling = level[idx ^ 1];
    if (sibling !== undefined) proof.push(sibling);
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      next.push(right === undefined ? left : pairHash(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyProof(leaf: Hex, proof: Hex[], root: Hex): boolean {
  try {
    if (!HASH_RE.test(leaf) || !HASH_RE.test(root)) return false;
    let acc: Hex = leaf;
    for (const p of proof) {
      if (!HASH_RE.test(p)) return false;
      acc = pairHash(acc, p);
    }
    return acc.toLowerCase() === root.toLowerCase();
  } catch {
    return false;
  }
}
