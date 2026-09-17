import { NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";

export async function GET() {
  const bindings = await getCineCubBindings();
  const googleClientId =
    bindings.GOOGLE_CLIENT_ID ||
    bindings.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    "";

  return NextResponse.json(
    {
      googleClientId,
      configured: Boolean(googleClientId),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
