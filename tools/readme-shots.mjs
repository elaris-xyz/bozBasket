// README screenshots from the live site: headless Chrome over the DevTools
// Protocol, clipped to the element, at 2x, in New York time. Node 22's
// built-in WebSocket; no dependencies.
//   node tools/readme-shots.mjs docs/img            # the live site
//   SITE=http://127.0.0.1:3200 node tools/readme-shots.mjs docs/img
// Two traps met on 2026-09-19: a chart below the fold captured blank with
// captureBeyondViewport, so the viewport is tall and that is off; and the
// zoomed chart's squashed y axis was invisible to DOM checks that read tick
// labels but not where they sat. Look at the images before committing them.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const SITE = process.env.SITE ?? "https://boz-basket-web.vercel.app";
const outDir = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Removed at the end of every run, errors included: each run used to leave
// ~25 MB of Chrome profile in TEMP.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "shoot-"));
const cleanup = () => {
	try {
		chrome.kill();
	} catch {}
	setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500);
};
process.on("exit", () => fs.rmSync(profile, { recursive: true, force: true }));
process.on("uncaughtException", (e) => {
	console.error(e.message);
	cleanup();
	setTimeout(() => process.exit(1), 2000);
});
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--force-dark-mode", "about:blank"], { stdio: "ignore" });

async function target() {
	for (let i = 0; i < 40; i++) {
		try {
			const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
			const page = list.find((t) => t.type === "page");
			if (page) return page.webSocketDebuggerUrl;
		} catch {}
		await sleep(250);
	}
	throw new Error("chrome did not start");
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
	const m = JSON.parse(e.data);
	if (m.id && pending.has(m.id)) {
		pending.get(m.id)(m);
		pending.delete(m.id);
	}
});
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const n = ++id;
		pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
		ws.send(JSON.stringify({ id: n, method, params }));
	});
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

await send("Page.enable");

// Tall, so every chart is inside the viewport when it measures itself (one
// below the fold came out blank), and in the market's own time zone.
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 2400, deviceScaleFactor: 2, mobile: false });
await send("Emulation.setTimezoneOverride", { timezoneId: "America/New_York" });

async function shoot(url, file, prepare) {
	await send("Page.navigate", { url });
	await sleep(15000); // client-side fetches: prices, proof, shadow, plan, ledger
	const rect = await evaluate(`(async () => { ${prepare} })()`);
	if (!rect) throw new Error(`nothing to clip on ${url}`);
	const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, clip: { ...rect, scale: 1 } });
	fs.writeFileSync(path.join(outDir, file), Buffer.from(data, "base64"));
	console.log(`${file}: ${Math.round(rect.width)}x${Math.round(rect.height)} css px`);
}

// The landing page from the top through the mainnet check.
await shoot(
	`${SITE}/`,
	"home.png",
	`const shadow = [...document.querySelectorAll("section")].find((s) => s.textContent.includes("The real market"));
	 const main = document.querySelector("main").getBoundingClientRect();
	 const end = shadow.getBoundingClientRect().bottom + window.scrollY + 24;
	 return { x: main.left, y: 0, width: main.width, height: end };`,
);

// The demo plan's chart, zoomed to its held-back weekend.
await shoot(
	`${SITE}/plan/5vV866AdEP6kR5NemndnVoopUCK4ygXCuyGUG8L78LZq`,
	"plan.png",
	`let card = null;
	 for (let i = 0; i < 40 && !(card = [...document.querySelectorAll("h3")].find((e) => e.textContent.includes("over time"))?.closest("section"))?.querySelector(".recharts-surface"); i++) await new Promise((r) => setTimeout(r, 500));
	 if (!card) return null;
	 [...card.querySelectorAll("[role=group] button")].find((b) => b.textContent === "Held-back buy")?.click();
	 await new Promise((r) => setTimeout(r, 1500));
	 const r = card.getBoundingClientRect();
	 return { x: r.left - 12, y: r.top + window.scrollY - 12, width: r.width + 24, height: r.height + 24 };`,
);

ws.close();
cleanup();
