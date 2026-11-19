import { describe, expect, it } from "vitest";
import { scanForLeaks } from "./hygiene.js";

const none = { allowedAddresses: [], bannedStrings: [] };

describe("scanForLeaks", () => {
  it("flags an unknown 20-byte address", () => {
    const r = scanForLeaks(
      [{ path: "a.md", content: "send to 0xAbCdEf" + "0".repeat(33) + "1" }],
      none,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.path).toBe("a.md");
  });

  it("allows listed addresses case-insensitively", () => {
    const r = scanForLeaks([{ path: "a.md", content: "0x60B9262456de011f7d15a54cdd8c48baaa8b022f" }], {
      allowedAddresses: ["0x60b9262456de011f7d15a54cdd8c48baaa8b022f"],
      bannedStrings: [],
    });
    expect(r).toHaveLength(0);
  });

  it("flags banned strings case-insensitively", () => {
    const r = scanForLeaks([{ path: "a.md", content: "by SomeHandle" }], {
      allowedAddresses: [],
      bannedStrings: ["somehandle"],
    });
    expect(r).toHaveLength(1);
  });

  it("ignores 32-byte hashes and selectors", () => {
    const r = scanForLeaks([{ path: "a.ts", content: "0x" + "ab".repeat(32) + " 0x70a08231" }], none);
    expect(r).toHaveLength(0);
  });

  it("does not match an address embedded in a longer hex run", () => {
    const r = scanForLeaks([{ path: "a.ts", content: "0x" + "cd".repeat(21) }], none);
    expect(r).toHaveLength(0);
  });

  it("ignores empty banned strings", () => {
    const r = scanForLeaks([{ path: "a.md", content: "anything" }], { allowedAddresses: [], bannedStrings: ["", "  "] });
    expect(r).toHaveLength(0);
  });
});
