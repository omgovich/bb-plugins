import { describe, expect, it } from "vitest";
import { parsePmset } from "../src/battery";

const on = (line: string) => `Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t${line}`;
const off = (line: string) => `Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t${line}`;

describe("parsePmset", () => {
  it("reads a draining battery", () => {
    expect(parsePmset(off("3%; discharging; 2:29 remaining present: true"))).toEqual({ percent: 3, state: "discharging", onPower: false, minutesLeft: 149 });
  });
  it("reads charging, charged and on power without charging", () => {
    expect(parsePmset(on("57%; charging; 1:05 remaining present: true"))).toMatchObject({ state: "charging", onPower: true, minutesLeft: 65 });
    expect(parsePmset(on("100%; charged; 0:00 remaining present: true"))).toMatchObject({ percent: 100, state: "charged" });
    expect(parsePmset(on("80%; AC attached; not charging present: true"))).toMatchObject({ state: "not-charging", minutesLeft: null });
  });
  it("has nothing to say without a battery", () => {
    expect(parsePmset("Now drawing from 'AC Power'\n")).toBeNull();
    expect(parsePmset(off("98%; discharging; (no estimate) present: true"))).toMatchObject({ minutesLeft: null });
  });
});
