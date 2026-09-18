// US equities session calendar, derived from Pyth's schedule string so the
// keeper and the oracle agree on "open". Pure functions; unit tested.
//
// Schedule grammar (Pyth market_hours.schedule):
//   "<tz>;<mon>,<tue>,<wed>,<thu>,<fri>,<sat>,<sun>;<MMDD>/<hours>,..."
// where <hours> is "O" (open all day), "C" (closed) or "HHMM-HHMM" (one or
// more ranges joined by "&"). The third block lists holidays and half days.

export const US_EQUITY_SCHEDULE_2026 =
	"America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C;" +
	"0907/C,1126/C,1127/0930-1300,1224/0930-1300,1225/C,0101/C,0118/C,0215/C,0326/C,0531/C,0618/C,0705/C";

export type Session = { open: boolean; reason: "open" | "weekend" | "holiday" | "outside_hours" | "unknown"; label: string };

type Range = { start: number; end: number }; // minutes since midnight, local

function parseHours(spec: string): Range[] | "closed" | "all" {
	if (spec === "C") return "closed";
	if (spec === "O") return "all";
	return spec.split("&").map((r) => {
		const [a, b] = r.split("-");
		return { start: Number(a.slice(0, 2)) * 60 + Number(a.slice(2)), end: Number(b.slice(0, 2)) * 60 + Number(b.slice(2)) };
	});
}

/** One formatter per time zone: building one costs far more than using it,
 *  and a scan across a weekend asks for about three thousand minutes. */
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Local wall-clock parts of `date` in `tz`. */
export function localParts(date: Date, tz: string) {
	let fmt = formatters.get(tz);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hour12: false,
			weekday: "short",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
		formatters.set(tz, fmt);
	}
	const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
	const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
	return {
		weekdayIndex, // 0 = Monday, matching Pyth's order
		mmdd: `${parts.month}${parts.day}`,
		minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
	};
}

/** Is the market described by `schedule` open at `date`? */
export function sessionAt(date: Date, schedule = US_EQUITY_SCHEDULE_2026): Session {
	const [tz, weekSpec, holidaySpec = ""] = schedule.split(";");
	const week = weekSpec.split(",");
	if (week.length !== 7) return { open: false, reason: "unknown", label: "bad schedule" };
	const { weekdayIndex, mmdd, minutes } = localParts(date, tz);

	let hours = parseHours(week[weekdayIndex]);
	let reason: Session["reason"] = "outside_hours";
	if (hours === "closed") reason = "weekend";

	for (const h of holidaySpec.split(",").filter(Boolean)) {
		const [day, spec] = h.split("/");
		if (day === mmdd) {
			hours = parseHours(spec);
			if (hours === "closed") reason = "holiday";
		}
	}

	if (hours === "all") return { open: true, reason: "open", label: "open" };
	if (hours === "closed") return { open: false, reason, label: reason };
	const inRange = hours.some((r) => minutes >= r.start && minutes < r.end);
	return inRange ? { open: true, reason: "open", label: "regular session" } : { open: false, reason: "outside_hours", label: "outside regular hours" };
}

/** Seconds until the next open, scanning minute by minute (cheap enough for a
 *  once-a-minute keeper; bounded to two weeks). */
export function secondsUntilOpen(date: Date, schedule = US_EQUITY_SCHEDULE_2026): number {
	const step = 60_000;
	const limit = 14 * 24 * 60;
	for (let i = 1; i <= limit; i++) {
		const t = new Date(date.getTime() + i * step);
		if (sessionAt(t, schedule).open) return Math.round((t.getTime() - date.getTime()) / 1000);
	}
	return -1;
}

/** When Pyth publishes US equity prices at all, as measured on this
 *  deployment: from Sunday 20:00 to Friday 20:00 ET without a break
 *  (overnight, pre-market, regular and after hours), nothing in between. This
 *  is not the regular session `sessionAt` answers: at 02:38 ET on a Monday the
 *  feeds were seconds old. Holidays are not listed. The program judges the
 *  publish time itself, so this is only the forecast a screen shows. */
export const PYTH_US_EQUITY_WINDOW = "America/New_York;O,O,O,O,0000-2000,C,2000-2400;";

/** Seconds until Pyth is expected to publish US equity prices again; 0 while
 *  it is publishing. */
export function secondsUntilPythPublishes(date: Date): number {
	return sessionAt(date, PYTH_US_EQUITY_WINDOW).open ? 0 : secondsUntilOpen(date, PYTH_US_EQUITY_WINDOW);
}
