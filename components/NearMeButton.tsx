"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * "Find offices near me".
 *
 * Deliberately English on the Bengali site too, and the strings in bn.json say
 * so rather than this component overriding the locale. Places are matched in
 * English and by PIN, because that is what the register is written in, so the
 * whole of this control speaks the language the search actually answers to.
 * The rest of the Bengali site is unaffected.
 *
 * The permission prompt is only ever raised by a deliberate press — never on
 * page load — because a citizen looking up a marriage office should not have to
 * refuse a location request they did not ask for. Everything still works
 * without it: the district and PIN filters beside this button are the same
 * search, reached by typing instead of by sharing a location.
 */

type State = "idle" | "locating" | "denied" | "out-of-area" | "unavailable";

export function NearMeButton({ locale }: { locale: string }) {
  const t = useTranslations("Offices");
  const router = useRouter();
  const [state, setState] = useState<State>("idle");

  function locate() {
    if (!("geolocation" in navigator)) return setState("unavailable");
    setState("locating");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch("/api/offices/near", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            }),
          });
          const data = await res.json();
          if (!data.ok) return setState(data.reason === "OUT_OF_AREA" ? "out-of-area" : "unavailable");

          const query = new URLSearchParams();
          if (data.pincode) query.set("pincode", data.pincode);
          if (data.district) query.set("district", data.district);
          router.push(`/${locale}/offices?${query.toString()}`);
          setState("idle");
        } catch {
          setState("unavailable");
        }
      },
      // A refusal is a valid answer, not an error to argue with.
      (error) => setState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={locate}
        disabled={state === "locating"}
        className="focus min-h-12 w-full border border-ink bg-ink px-5 text-sm font-bold text-paper disabled:opacity-60"
      >
        {state === "locating" ? t("nearMeLocating") : t("nearMe")}
      </button>
      {state !== "idle" && state !== "locating" && (
        <p className="mt-2 text-sm text-[var(--muted)]">{t(`nearMeError.${state}`)}</p>
      )}
    </div>
  );
}
