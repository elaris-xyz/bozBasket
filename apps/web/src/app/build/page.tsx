import { BasketBuilder } from "@/components/BasketBuilder";

export const metadata = { title: "Build a basket" };

export default function BuildPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold">Build a basket</h1>
				<p className="text-slate-400">Three tokenized US stocks are live on devnet. Pick weights, an amount and a cadence.</p>
			</div>
			<BasketBuilder />
		</div>
	);
}
