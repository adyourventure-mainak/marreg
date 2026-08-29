/**
 * Turn a citizen's coordinates into a PIN code and a West Bengal district.
 *
 * Why this exists at all: not one of the 587 offices in the register carries a
 * latitude or longitude, so "the nearest office" cannot be computed as a
 * distance. What every office does carry is a PIN code and a district. So the
 * citizen's position is resolved to those two identifiers and matched against
 * the register, rather than inventing coordinates for offices that the
 * department never published.
 *
 * Three deliberate choices:
 *
 *   1. This runs on the server. The browser posts its coordinates to this site
 *      and nowhere else, so the geocoder never sees the citizen's IP, the CSP
 *      stays `connect-src 'self'`, and no key is shipped to the client.
 *   2. A result outside West Bengal is refused, not translated into a nearest
 *      guess. West Bengal borders Bangladesh and shares district names with it,
 *      and this service covers Indian law only. A citizen standing across that
 *      border must be told this is out of area, not handed an Indian office.
 *   3. The district comes back as a name to be resolved against the districts
 *      table by the caller, never as an invented code. If the register does not
 *      recognise the name, the answer is "no district", not a near match.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

export type ReverseResult =
  | { ok: true; pincode: string | null; districtName: string | null }
  | { ok: false; reason: "OUT_OF_AREA" | "UNAVAILABLE" };

type NominatimAddress = {
  postcode?: string;
  state?: string;
  country_code?: string;
  state_district?: string;
  county?: string;
  district?: string;
};

/** A PIN code is six digits and West Bengal's all begin with 7. */
export function isWestBengalPincode(value: string | null | undefined): boolean {
  return typeof value === "string" && /^7\d{5}$/.test(value);
}

/**
 * Is this address in West Bengal, India?
 *
 * Both checks matter. `country_code` alone would accept Bangladesh's own
 * districts; `state` alone would accept a "West Bengal" string from anywhere.
 */
export function isWestBengal(address: NominatimAddress): boolean {
  const country = (address.country_code ?? "").toLowerCase();
  const state = (address.state ?? "").toLowerCase();
  return country === "in" && state.includes("west bengal");
}

/** The district-like field Nominatim actually filled in, in order of precision. */
export function districtFrom(address: NominatimAddress): string | null {
  return address.state_district ?? address.district ?? address.county ?? null;
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseResult> {
  const url = `${NOMINATIM}?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`;

  let payload: { address?: NominatimAddress };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4500),
      headers: {
        accept: "application/json",
        // Nominatim's usage policy requires an identifying agent.
        "user-agent": "MARREG/1.0 (West Bengal marriage registration portal)",
      },
    });
    if (!res.ok) return { ok: false, reason: "UNAVAILABLE" };
    payload = await res.json();
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const address = payload.address;
  if (!address) return { ok: false, reason: "UNAVAILABLE" };
  if (!isWestBengal(address)) return { ok: false, reason: "OUT_OF_AREA" };

  const postcode = address.postcode?.replace(/\s/g, "") ?? null;
  return {
    ok: true,
    // A PIN that is not a West Bengal PIN is dropped rather than searched on.
    pincode: isWestBengalPincode(postcode) ? postcode : null,
    districtName: districtFrom(address),
  };
}

/**
 * Resolve a geocoder's district name to a code the register actually uses.
 *
 * Matched against the districts table, English and Bengali, so a district can
 * never be recognised under a name the register does not hold. Nominatim
 * writes some districts with a suffix the register omits, so a contains-match
 * is tried in both directions before giving up.
 */
export function districtCodeFor(
  name: string | null,
  districts: { code: string; name: string; name_bn: string | null }[],
): string | null {
  if (!name) return null;
  const needle = name.toLowerCase().replace(/\s+district$/, "").trim();
  if (!needle) return null;

  for (const d of districts) {
    const known = d.name.toLowerCase();
    if (known === needle) return d.code;
    if (d.name_bn && d.name_bn === name) return d.code;
  }
  // Longest first, so "North 24 Parganas" is preferred over a shorter overlap.
  for (const d of [...districts].sort((a, b) => b.name.length - a.name.length)) {
    const known = d.name.toLowerCase();
    if (needle.includes(known) || known.includes(needle)) return d.code;
  }
  return null;
}
