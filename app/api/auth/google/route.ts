import type { NextRequest } from "next/server";
import { signInWithGoogle } from "../../../actions/auth";

/** Plain form POST endpoint so the Google button works without client-side JS. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  await signInWithGoogle(formData);
}
