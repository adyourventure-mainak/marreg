import { describe, expect, it } from "vitest";
import { addCalendarMonths, sma13Window } from "./act-rules";
describe("legal date arithmetic", () => {
  it("clamps January 31 plus six months to July 31", () => expect(addCalendarMonths(new Date("2026-01-31T00:00:00Z"), 6).toISOString()).toBe("2026-07-31T00:00:00.000Z"));
  it("clamps August 31 plus six months to February 28", () => expect(addCalendarMonths(new Date("2026-08-31T00:00:00Z"), 6).toISOString()).toBe("2027-02-28T00:00:00.000Z"));
  it("starts SMA 13 solemnisation after 30 days", () => { const window = sma13Window(new Date("2026-01-01T00:00:00Z")); expect(window.earliest.toISOString()).toBe("2026-01-31T00:00:00.000Z"); });
});
