import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto/secret";

describe("secret crypto", () => {
  it("round-trips a key", () => {
    const enc = encryptSecret("shipday-test-key-12345");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe("shipday-test-key-12345");
  });

  it("masks without revealing the middle", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("ab••••mnop");
  });
});
