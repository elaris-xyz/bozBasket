// The weekend backtest for the landing page, from the committed data file.
// Served by a route rather than imported into the page, so the home page's
// client bundle does not carry every hourly point.

import { NextResponse } from "next/server";
import file from "@/generated/weekend-backtest.json";
import liveFile from "@/generated/weekend-live.json";
import { backtestView, type BacktestFile } from "@/lib/backtestView";
import { liveWeekendView, type LiveWeekendFile } from "@/lib/liveWeekend";

export const dynamic = "force-static";

export function GET() {
	return NextResponse.json({ ...backtestView(file as unknown as BacktestFile), live: liveWeekendView(liveFile as unknown as LiveWeekendFile) }, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
