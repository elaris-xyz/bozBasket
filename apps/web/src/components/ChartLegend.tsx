/** Series keys and the guard's limit, above a chart. Identity is carried by the
 *  mark beside each name; the names themselves stay in text colours. */
export function ChartLegend({ caption, series, shape }: { caption: string; series: { name: string; color: string }[]; shape: "line" | "dot" }) {
	return (
		<div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
			<p className="text-slate-500">{caption}</p>
			<ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400">
				{series.map((s) => (
					<li key={s.name} className="inline-flex items-center gap-1.5">
						{shape === "line" ? (
							<span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
						) : (
							<span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
						)}
						{s.name}
					</li>
				))}
				<li className="inline-flex items-center gap-1.5">
					<span className="w-4 border-t border-dashed border-amber" aria-hidden />
					guard limit
				</li>
				<li className="inline-flex items-center gap-1.5">
					<span className="h-2.5 w-4 rounded-sm bg-mint/15" aria-hidden />
					inside it
				</li>
			</ul>
		</div>
	);
}
