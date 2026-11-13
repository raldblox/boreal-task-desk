import { describe, expect, it } from "vitest";

import { OPENING_TIME, skyDrift, skyState } from "./aurora-activity";

const scalars = (t: number) => {
  const s = skyState(t);
  return [...s.arcI, s.rays, s.folds, s.surge, s.hard, s.red, s.pulse, s.diffuse];
};

describe("the aurora's substorm cycle", () => {
  it("is the same at the same moment, whatever was asked before", () => {
    const a = skyState(4321.5);
    skyState(100);
    skyState(90000);
    expect(skyState(4321.5)).toEqual(a);
  });

  it("never jumps between frames, across phases and cycles", () => {
    let prev = scalars(0);
    let prevZ = skyState(0).arcZ;
    let worst = { jump: 0, at: 0 };
    let worstZ = { jump: 0, at: 0 };
    for (let t = 0.5; t < 20000; t += 0.5) {
      const now = scalars(t);
      const z = skyState(t).arcZ;
      for (let i = 0; i < now.length; i++) if (Math.abs(now[i] - prev[i]) > worst.jump) worst = { jump: Math.abs(now[i] - prev[i]), at: t };
      for (let i = 0; i < 3; i++) if (Math.abs(z[i] - prevZ[i]) > worstZ.jump) worstZ = { jump: Math.abs(z[i] - prevZ[i]), at: t };
      prev = now;
      prevZ = z;
    }
    expect(worst.jump, `brightness at t=${worst.at}`).toBeLessThan(0.2);
    expect(worstZ.jump, `arc position at t=${worstZ.at}`).toBeLessThan(6);
  });

  it("goes through every phase, and only strong substorms turn red", () => {
    const seen = new Set<string>();
    let maxRed = 0;
    let quietRed = 0;
    for (let t = 0; t < 20000; t += 5) {
      const s = skyState(t);
      seen.add(s.phase);
      maxRed = Math.max(maxRed, s.red);
      if (s.phase === "growth") quietRed = Math.max(quietRed, s.red);
    }
    expect([...seen].sort()).toEqual(["expansion", "growth", "recovery"]);
    expect(maxRed).toBeGreaterThan(0.5);
    expect(quietRed).toBe(0);
  });

  it("opens a first visit during a strong breakup", () => {
    const s = skyState(OPENING_TIME);
    expect(s.phase).toBe("expansion");
    expect(s.rays).toBeGreaterThan(0.6);
  });

  it("sums the drift of rays and folds the same way whatever was asked before, without jumps", () => {
    const a = skyDrift(4321.7);
    skyDrift(12);
    skyDrift(90000.3);
    expect(skyDrift(4321.7)).toEqual(a);
    let prev = skyDrift(0);
    for (let t = 0.25; t < 3000; t += 0.25) {
      const now = skyDrift(t);
      // Rays drift 1.2 to 3.4 km/s, so a quarter of a second moves them under a kilometre.
      expect(now.rayKm - prev.rayKm).toBeGreaterThan(0.25);
      expect(now.rayKm - prev.rayKm).toBeLessThan(0.9);
      expect(now.foldT - prev.foldT).toBeGreaterThanOrEqual(0);
      expect(now.foldT - prev.foldT).toBeLessThan(0.26);
      prev = now;
    }
  });
});
