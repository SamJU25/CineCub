import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "PROXY_SERVICE_RETIRED", message: "Render streaming proxy is retired. Cloud Stream embeds active." },
    { status: 410, headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export async function HEAD() {
  return new NextResponse(null, { status: 410, headers: { "Access-Control-Allow-Origin": "*" } });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
