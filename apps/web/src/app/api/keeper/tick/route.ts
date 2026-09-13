// Ask for a keeper pass. Public on purpose, and safe to be:
//
//   - A Postgres lock allows one pass at a time and at most one scheduled
//     pass a minute across every server instance, however often this is hit.
//   - A pass can only attempt executions that `execute_basket` guards on
//     chain; it cannot move a user's funds anywhere but into their basket.
//
// Callers: open pages (KeeperPulse, header x-keeper-trigger: visitor) and any
// external scheduler, for example a cron-job.org job doing a GET every minute.
// The response comes back at once; the pass runs after it (see keeperRunner).

import { NextResponse } from "next/server";
import { schedulePass } from "@/lib/keeperRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The pass continues after the response, inside this invocation.
export const maxDuration = 300;

async function handle(req: Request) {
	const trigger = req.headers.get("x-keeper-trigger") === "visitor" ? "visitor" : "cron";
	const result = await schedulePass(trigger);
	return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
