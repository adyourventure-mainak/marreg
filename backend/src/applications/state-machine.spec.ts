import { describe, expect, it } from "vitest";
import { nextStatus } from "./state-machine";
describe("application state machine", () => {
  it("allows every representative legal edge", () => { expect(nextStatus("DRAFT", "submit")).toBe("PAYMENT_PENDING"); expect(nextStatus("AWAITING_REGISTRATION", "registered")).toBe("REGISTERED"); expect(nextStatus("REGISTERED", "certificateIssued")).toBe("CERTIFICATE_ISSUED"); });
  it("rejects transitions out of terminal states", () => { expect(() => nextStatus("CANCELLED", "submit")).toThrow(); expect(() => nextStatus("LAPSED", "registered")).toThrow(); });
});
