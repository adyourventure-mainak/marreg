import { describe, expect, it } from "vitest";
import { districtCodeFor, districtFrom, isWestBengal, isWestBengalPincode } from "./reverse";

const DISTRICTS = [
  { code: "WB-KOL", name: "Kolkata", name_bn: "কলকাতা" },
  { code: "WB-DAR", name: "Darjeeling", name_bn: "দার্জিলিং" },
  { code: "WB-PUR", name: "Purulia", name_bn: "পুরুলিয়া" },
  { code: "WB-24PN", name: "North 24 Parganas", name_bn: "উত্তর ২৪ পরগনা" },
  { code: "WB-24PS", name: "South 24 Parganas", name_bn: "দক্ষিণ ২৪ পরগনা" },
];

describe("isWestBengal", () => {
  it("accepts West Bengal, India", () => {
    expect(isWestBengal({ country_code: "in", state: "West Bengal" })).toBe(true);
  });

  /**
   * The guard that matters most. West Bengal borders Bangladesh, the two share
   * district names, and this service covers Indian law only — so a citizen
   * standing across that border must be told they are out of area rather than
   * handed an Indian marriage office.
   */
  it("refuses Bangladesh", () => {
    expect(isWestBengal({ country_code: "bd", state: "Dhaka" })).toBe(false);
    expect(isWestBengal({ country_code: "bd", state: "Khulna" })).toBe(false);
  });

  it("refuses another Indian state", () => {
    expect(isWestBengal({ country_code: "in", state: "Bihar" })).toBe(false);
  });

  it("refuses a matching state name in the wrong country", () => {
    expect(isWestBengal({ country_code: "bd", state: "West Bengal" })).toBe(false);
  });

  it("refuses an address with no country at all", () => {
    expect(isWestBengal({ state: "West Bengal" })).toBe(false);
  });
});

describe("isWestBengalPincode", () => {
  it("accepts a West Bengal PIN", () => {
    expect(isWestBengalPincode("700013")).toBe(true);
    expect(isWestBengalPincode("734010")).toBe(true);
  });

  it("rejects PINs outside the 7-series, and malformed ones", () => {
    expect(isWestBengalPincode("110001")).toBe(false); // Delhi
    expect(isWestBengalPincode("70001")).toBe(false);
    expect(isWestBengalPincode("7000133")).toBe(false);
    expect(isWestBengalPincode(null)).toBe(false);
    expect(isWestBengalPincode(undefined)).toBe(false);
  });
});

describe("districtFrom", () => {
  it("prefers the most precise field available", () => {
    expect(districtFrom({ state_district: "Purulia", county: "Other" })).toBe("Purulia");
    expect(districtFrom({ county: "Darjeeling" })).toBe("Darjeeling");
    expect(districtFrom({})).toBeNull();
  });
});

describe("districtCodeFor", () => {
  it("resolves the names the geocoder actually returned for real coordinates", () => {
    expect(districtCodeFor("Kolkata", DISTRICTS)).toBe("WB-KOL");
    expect(districtCodeFor("Darjeeling", DISTRICTS)).toBe("WB-DAR");
    expect(districtCodeFor("Purulia", DISTRICTS)).toBe("WB-PUR");
  });

  it("tolerates a 'District' suffix the register omits", () => {
    expect(districtCodeFor("Purulia District", DISTRICTS)).toBe("WB-PUR");
  });

  it("prefers the longest match, so the two 24 Parganas stay distinct", () => {
    expect(districtCodeFor("North 24 Parganas", DISTRICTS)).toBe("WB-24PN");
    expect(districtCodeFor("South 24 Parganas", DISTRICTS)).toBe("WB-24PS");
  });

  it("matches a Bengali district name", () => {
    expect(districtCodeFor("কলকাতা", DISTRICTS)).toBe("WB-KOL");
  });

  it("returns null rather than a near guess for an unknown district", () => {
    expect(districtCodeFor("Patna", DISTRICTS)).toBeNull();
    expect(districtCodeFor(null, DISTRICTS)).toBeNull();
    expect(districtCodeFor("", DISTRICTS)).toBeNull();
  });
});
