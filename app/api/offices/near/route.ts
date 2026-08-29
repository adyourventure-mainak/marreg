import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "../../../../lib/supabase/server";
import { districtCodeFor, reverseGeocode } from "../../../../lib/geo/reverse";

/**
 * Resolve a citizen's coordinates to a place the office register understands.
 *
 * The coordinates are used and discarded. They are not logged, not stored and
 * not attached to a session: the only thing that leaves this handler is a PIN
 * code and a district code, both of which are already public facts about the
 * register. A location is the most sensitive thing a citizen can hand a
 * government site, and this service has no reason to keep one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  // Bounds are West Bengal's, generously drawn. A coordinate outside them is
  // rejected before a geocoder is called at all.
  lat: z.number().min(21).max(28),
  lon: z.number().min(85).max(90),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "OUT_OF_AREA" }, { status: 200 });
  }

  const place = await reverseGeocode(parsed.data.lat, parsed.data.lon);
  if (!place.ok) {
    return NextResponse.json(place, { status: place.reason === "UNAVAILABLE" ? 503 : 200 });
  }

  const supabase = await createClient();
  const { data: districts } = await supabase.from("districts").select("code, name, name_bn");
  const district = districtCodeFor(place.districtName, districts ?? []);

  // Neither identifier resolved, so there is nothing to search on. Say so
  // rather than returning the whole directory as if it were "near".
  if (!place.pincode && !district) {
    return NextResponse.json({ ok: false, reason: "OUT_OF_AREA" }, { status: 200 });
  }

  return NextResponse.json({ ok: true, pincode: place.pincode, district });
}
