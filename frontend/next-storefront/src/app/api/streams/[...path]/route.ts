import { NextRequest, NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const origin = request.headers.get("Origin") || "*";
  await params;

  // Direct scraper backend on Render has been retired.
  // Return empty stream payload immediately so the client seamlessly utilizes Cloud Stream embeds.
  return new NextResponse(
    JSON.stringify({
      status: false,
      message: "Direct scraper backend offline. Cloud Stream active.",
      streams: [],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    }
  );
}
