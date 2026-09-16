import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "PROXY_SERVICE_RETIRED", message: "Render streaming proxy is retired. Cloud Stream embeds active." },
    { status: 410, headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
