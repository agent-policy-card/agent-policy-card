import { describe, expect, it } from "vitest";
import { concat, keccak256, type Hex } from "viem";
import { leafHash, merkleProof, merkleRoot, verifyProof } from "../src/merkle.js";

const ZERO = ("0x" + "0".repeat(64)) as Hex;

function makeLeaves(n: number): Hex[] {
  return Array.from({ length: n }, (_, i) => leafHash(`line ${i}`));
}

describe("leafHash", () => {
  it("hashes ASCII bytes", () => {
    expect(leafHash("abc")).toBe(keccak256("0x616263"));
  });
  it("hashes UTF-8 bytes for non-ASCII", () => {
    expect(leafHash("é")).toBe(keccak256("0xc3a9"));
  });
});

describe("merkle tree", () => {
  it("one leaf: root is the leaf", () => {
    const leaves = makeLeaves(1);
    const root = merkleRoot(leaves);
    expect(root).toBe(leaves[0]);
    expect(merkleProof(leaves, 0)).toEqual([]);
    expect(verifyProof(leaves[0]!, [], root)).toBe(true);
  });

  it("two leaves: sorted pair hash", () => {
    const leaves = makeLeaves(2);
    const a = leaves[0]!;
    const b = leaves[1]!;
    const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
    expect(merkleRoot(leaves)).toBe(keccak256(concat([lo, hi])));
  });

  for (const n of [5, 7]) {
    it(`${n} leaves: every proof verifies`, () => {
      const leaves = makeLeaves(n);
      const root = merkleRoot(leaves);
      for (let i = 0; i < n; i++) {
        expect(verifyProof(leaves[i]!, merkleProof(leaves, i), root)).toBe(true);
      }
    });
  }

  it("tampering breaks verification", () => {
    const lines = ["a0", "b1", "c2", "d3", "e4"];
    const leaves = lines.map(leafHash);
    const root = merkleRoot(leaves);
    const proof = merkleProof(leaves, 1);
    const tampered = leafHash("b2");
    expect(tampered).not.toBe(leaves[1]);
    expect(verifyProof(tampered, proof, root)).toBe(false);
  });

  it("proof for index 2 does not verify leaf 3", () => {
    const leaves = makeLeaves(5);
    const root = merkleRoot(leaves);
    expect(verifyProof(leaves[3]!, merkleProof(leaves, 2), root)).toBe(false);
  });

  it("empty input gives the zero hash", () => {
    expect(merkleRoot([])).toBe(ZERO);
  });

  it("out of range index throws RangeError", () => {
    const leaves = makeLeaves(5);
    expect(() => merkleProof(leaves, 5)).toThrow(RangeError);
    expect(() => merkleProof(leaves, -1)).toThrow(RangeError);
  });

  it("malformed hex returns false without throwing", () => {
    const root = merkleRoot(makeLeaves(3));
    expect(verifyProof("0xzz" as Hex, [], root)).toBe(false);
  });
});
