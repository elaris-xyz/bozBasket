// GET /api/v1/openapi.json: the Guard API's OpenAPI 3.1 description.

import { NextResponse } from "next/server";
import { CORS_HEADERS } from "@/lib/guardApi";
import { openApiSpec } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export function OPTIONS() {
	return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function GET(req: Request) {
	return NextResponse.json(openApiSpec(new URL(req.url).origin), {
		headers: { ...CORS_HEADERS, "cache-control": "public, max-age=300, s-maxage=3600" },
	});
}
