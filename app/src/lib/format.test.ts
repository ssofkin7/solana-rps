import { describe, expect, it } from "vitest";
import { formatAge, formatCountdown, formatSol, parseSol, shortAddress } from "./format";

describe("formatSol", () => {
  it("shows whole and fractional SOL without trailing zeros", () => {
    expect(formatSol(1_000_000_000n)).toBe("1");
    expect(formatSol(10_000_000n)).toBe("0.01");
    expect(formatSol(19_500_000n)).toBe("0.0195");
    expect(formatSol(1n)).toBe("0.000000001");
    expect(formatSol(0n)).toBe("0");
    expect(formatSol(9_000_000_000_000_000_000n)).toBe("9000000000");
  });
});

describe("parseSol", () => {
  it("parses decimal text exactly, without floating point", () => {
    expect(parseSol("0.01")).toBe(10_000_000n);
    expect(parseSol("1")).toBe(1_000_000_000n);
    expect(parseSol("0.1")).toBe(100_000_000n);
    expect(parseSol(" 2.5 ")).toBe(2_500_000_000n);
    expect(parseSol(".5")).toBe(500_000_000n);
    expect(parseSol("0.000000001")).toBe(1n);
  });
  it("returns null for anything that is not a positive amount", () => {
    for (const bad of ["", "abc", "-1", "1.2.3", "0.0000000001", "1e3", "0", "0.0"]) {
      expect(parseSol(bad), bad).toBeNull();
    }
  });
});

describe("formatAge", () => {
  it("uses the largest sensible unit", () => {
    expect(formatAge(5)).toBe("just now");
    expect(formatAge(90)).toBe("1 min ago");
    expect(formatAge(3_600 * 3)).toBe("3 hr ago");
    expect(formatAge(86_400 * 2)).toBe("2 days ago");
    expect(formatAge(-10)).toBe("just now");
  });
});

describe("formatCountdown", () => {
  it("shows minutes and seconds", () => {
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(61)).toBe("1:01");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
    expect(formatCountdown(3_725)).toBe("1:02:05");
  });
});

describe("shortAddress", () => {
  it("keeps the ends of an address", () => {
    expect(shortAddress("DeDGEc6itNb78RVUSpWoQQbnoEkgJcFCfDfambdtY7XF")).toBe("DeDG…Y7XF");
  });
});
