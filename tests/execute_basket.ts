import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { expect } from "chai";
import { BasketDca } from "../target/types/basket_dca";
import { MockMarket } from "../target/types/mock_market";
import {
	airdrop,
	configPda,
	createUsdc,
	expectAnchorError,
	feedId,
	fundUsdc,
	makeProvider,
	marketPdas,
	planPda,
	px,
	tokenBalance,
	TOKEN_PROGRAM_ID,
	usdc,
	vaultPda,
	SystemProgram,
} from "./helpers";

const FEEDS = {
	TSLA: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
	QQQ: "9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d",
	VOO: "236b30dd09a9c00dfeec156c7b1efd646c0f01825a1758e3e4a0679e3bdff179",
};

const REASON = { OK: 0, REFERENCE_STALE: 1, CONFIDENCE_TOO_WIDE: 2, MARKET_CLOSED: 3, DIVERGENCE: 4, LOW_LIQUIDITY: 5, INSUFFICIENT_BALANCE: 6 };

const nowTs = () => Math.floor(Date.now() / 1000);

describe("basket_dca: execute_basket guard and atomic fill", () => {
	const provider = makeProvider();
	const program = anchor.workspace.BasketDca as Program<BasketDca>;
	const mockMarket = anchor.workspace.MockMarket as Program<MockMarket>;

	const admin = (provider.wallet as anchor.Wallet).payer;
	const keeper = Keypair.generate();
	const user = Keypair.generate();
	const config = configPda(program.programId);
	let usdcMint: PublicKey;
	let userUsdc: PublicKey;

	type Stock = { symbol: string; feed: string; price: number; weight: number; pdas: ReturnType<typeof marketPdas>; ata?: PublicKey };
	const stocks: Stock[] = [
		{ symbol: "xTSLA", feed: FEEDS.TSLA, price: 365, weight: 5000, pdas: marketPdas(mockMarket.programId, "xTSLA") },
		{ symbol: "xQQQ", feed: FEEDS.QQQ, price: 714, weight: 3000, pdas: marketPdas(mockMarket.programId, "xQQQ") },
		{ symbol: "xVOO", feed: FEEDS.VOO, price: 702, weight: 2000, pdas: marketPdas(mockMarket.programId, "xVOO") },
	];

	const planId = 7;
	let plan: PublicKey;
	let vault: PublicKey;

	const configParams = () => ({
		keeper: keeper.publicKey,
		maxStalenessSecs: 120,
		maxConfBps: 50,
		maxDivergenceBps: 150,
		minLiquidityUsdc: usdc(500),
		fillProgram: mockMarket.programId,
		referenceProgram: mockMarket.programId,
	});

	async function postReference(s: Stock, price: number, publishTime: number, confBps = 5) {
		const conf = new anchor.BN(Math.round((price * 1e8 * confBps) / 10_000));
		await mockMarket.methods
			.postReference(px(price), conf, -8, new anchor.BN(publishTime))
			.accountsPartial({ market: s.pdas.market, reference: s.pdas.reference, admin: admin.publicKey })
			.rpc();
	}

	async function postAllFresh() {
		const t = nowTs();
		for (const s of stocks) await postReference(s, s.price, t);
	}

	function legAccounts() {
		return stocks.flatMap((s) => [
			// On devnet the first entry is the Pyth receiver's account; here the
			// mock market's own reference plays both roles.
			{ pubkey: s.pdas.reference, isSigner: false, isWritable: false },
			{ pubkey: s.pdas.market, isSigner: false, isWritable: true },
			{ pubkey: s.pdas.stockMint, isSigner: false, isWritable: true },
			{ pubkey: s.pdas.treasury, isSigner: false, isWritable: true },
			{ pubkey: s.pdas.reference, isSigner: false, isWritable: false },
			{ pubkey: s.ata!, isSigner: false, isWritable: true },
		]);
	}

	function execute(signer: Keypair = keeper) {
		return program.methods
			.executeBasket()
			.accountsPartial({
				config,
				plan,
				vault,
				keeper: signer.publicKey,
				fillProgram: mockMarket.programId,
				tokenProgram: TOKEN_PROGRAM_ID,
			})
			.remainingAccounts(legAccounts())
			.signers([signer])
			.rpc();
	}

	async function nudge() {
		await program.methods.nudgePlan(new anchor.BN(0)).accountsPartial({ config, plan, admin: admin.publicKey }).rpc();
	}

	const fetchPlan = () => program.account.plan.fetch(plan);
	const stockBalances = () => Promise.all(stocks.map((s) => tokenBalance(provider, s.ata!)));

	before(async () => {
		await airdrop(provider, user.publicKey);
		await airdrop(provider, keeper.publicKey, 2);
		usdcMint = await createUsdc(provider, admin);
		userUsdc = await fundUsdc(provider, admin, usdcMint, user.publicKey, 1_000);

		// Config may already exist from basket_dca.ts (same validator); make it ours.
		const existing = await provider.connection.getAccountInfo(config);
		if (existing) {
			await program.methods.updateConfig(configParams()).accountsPartial({ config, admin: admin.publicKey }).rpc();
		} else {
			await program.methods
				.initConfig(configParams())
				.accountsPartial({ config, usdcMint, admin: admin.publicKey, systemProgram: SystemProgram.programId })
				.rpc();
		}
		// The config pins one USDC mint; if another suite created it first, follow it.
		usdcMint = (await program.account.config.fetch(config)).usdcMint;
		userUsdc = await fundUsdc(provider, admin, usdcMint, user.publicKey, 1_000);

		for (const s of stocks) {
			await mockMarket.methods
				.initMarket(s.symbol, feedId(s.feed), 20, usdc(50_000))
				.accountsPartial({
					market: s.pdas.market,
					stockMint: s.pdas.stockMint,
					usdcMint,
					admin: admin.publicKey,
					tokenProgram: TOKEN_PROGRAM_ID,
					systemProgram: SystemProgram.programId,
					rent: anchor.web3.SYSVAR_RENT_PUBKEY,
				})
				.rpc();
			await mockMarket.methods
				.initMarketAccounts()
				.accountsPartial({
					market: s.pdas.market,
					usdcMint,
					treasury: s.pdas.treasury,
					reference: s.pdas.reference,
					admin: admin.publicKey,
					tokenProgram: TOKEN_PROGRAM_ID,
					systemProgram: SystemProgram.programId,
					rent: anchor.web3.SYSVAR_RENT_PUBKEY,
				})
				.rpc();
			s.ata = (await getOrCreateAssociatedTokenAccount(provider.connection, admin, s.pdas.stockMint, user.publicKey)).address;
		}

		plan = planPda(program.programId, user.publicKey, planId);
		vault = vaultPda(program.programId, plan);
		await program.methods
			.createPlan(
				planId,
				usdc(100),
				new anchor.BN(7 * 86400),
				new anchor.BN(0),
				new anchor.BN(0),
				stocks.map((s) => ({ mint: s.pdas.stockMint, weightBps: s.weight, pythFeedId: feedId(s.feed) })),
			)
			.accountsPartial({
				config,
				usdcMint,
				plan,
				vault,
				owner: user.publicKey,
				tokenProgram: TOKEN_PROGRAM_ID,
				systemProgram: SystemProgram.programId,
				rent: anchor.web3.SYSVAR_RENT_PUBKEY,
			})
			.signers([user])
			.rpc();
		await program.methods
			.deposit(usdc(350))
			.accountsPartial({ plan, vault, ownerUsdc: userUsdc, owner: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
			.signers([user])
			.rpc();
	});

	it("rejects anyone but the keeper", async () => {
		await postAllFresh();
		await expectAnchorError(execute(user), "NotKeeper");
	});

	it("fills all three legs atomically at reference plus spread", async () => {
		await postAllFresh();
		await execute();
		const p = await fetchPlan();
		expect(p.executions).to.equal(1);
		expect(p.deferrals).to.equal(0);
		expect(p.lastReason).to.equal(REASON.OK);
		expect(p.totalInvested.toNumber()).to.equal(100_000_000);
		expect(await tokenBalance(provider, vault)).to.equal(250_000_000);

		const balances = await stockBalances();
		// leg i gets weight% of $100 at price*1.002; 6-decimal units.
		const expected = stocks.map((s) => Math.floor((100_000_000 * s.weight / 10_000) * 1e8 / Math.round(s.price * 1e8 * 1.002)));
		expect(balances).to.deep.equal(expected);
		stocks.forEach((s, i) => expect(p.legs[i].unitsBought.toNumber()).to.equal(expected[i]));
		expect(p.nextExecution.toNumber()).to.be.greaterThan(nowTs() + 7 * 86400 - 120);
	});

	it("refuses to run again before the next period", async () => {
		await postAllFresh();
		await expectAnchorError(execute(), "NotDue");
	});

	it("nudge_plan is admin-only and makes the plan due", async () => {
		await expectAnchorError(
			program.methods.nudgePlan(new anchor.BN(0)).accountsPartial({ config, plan, admin: user.publicKey }).signers([user]).rpc(),
			"NotAdmin",
		);
		await nudge();
		expect((await fetchPlan()).nextExecution.toNumber()).to.be.lessThanOrEqual(nowTs());
	});

	it("defers with REFERENCE_STALE when one leg's price is old, buying nothing", async () => {
		await postAllFresh();
		await postReference(stocks[1], stocks[1].price, nowTs() - 3600);
		const before = await stockBalances();
		await execute();
		const p = await fetchPlan();
		expect(p.lastReason).to.equal(REASON.REFERENCE_STALE);
		expect(p.deferrals).to.equal(1);
		expect(p.executions).to.equal(1);
		expect(await stockBalances()).to.deep.equal(before);
		expect(await tokenBalance(provider, vault)).to.equal(250_000_000);
		expect(p.nextExecution.toNumber()).to.be.greaterThan(nowTs() + 3000);
	});

	it("defers with CONFIDENCE_TOO_WIDE", async () => {
		await nudge();
		await postAllFresh();
		await postReference(stocks[0], stocks[0].price, nowTs(), 120); // 1.2% > 0.5%
		await execute();
		const p = await fetchPlan();
		expect(p.lastReason).to.equal(REASON.CONFIDENCE_TOO_WIDE);
		expect(p.deferrals).to.equal(2);
	});

	it("defers with DIVERGENCE when the venue quote drifts from the reference", async () => {
		await nudge();
		await postAllFresh();
		await mockMarket.methods
			.setPriceOverride(px(stocks[2].price * 1.05))
			.accountsPartial({ market: stocks[2].pdas.market, admin: admin.publicKey })
			.rpc();
		await execute();
		const p = await fetchPlan();
		expect(p.lastReason).to.equal(REASON.DIVERGENCE);
		expect(p.deferrals).to.equal(3);
		await mockMarket.methods
			.setPriceOverride(new anchor.BN(0))
			.accountsPartial({ market: stocks[2].pdas.market, admin: admin.publicKey })
			.rpc();
	});

	it("defers with LOW_LIQUIDITY on the last leg without touching the first two", async () => {
		await nudge();
		await postAllFresh();
		await mockMarket.methods.setLiquidity(usdc(10)).accountsPartial({ market: stocks[2].pdas.market, admin: admin.publicKey }).rpc();
		const before = await stockBalances();
		await execute();
		const p = await fetchPlan();
		expect(p.lastReason).to.equal(REASON.LOW_LIQUIDITY);
		expect(p.deferrals).to.equal(4);
		expect(await stockBalances()).to.deep.equal(before);
		await mockMarket.methods.setLiquidity(usdc(50_000)).accountsPartial({ market: stocks[2].pdas.market, admin: admin.publicKey }).rpc();
	});

	it("executes again once every check passes", async () => {
		await nudge();
		await postAllFresh();
		await execute();
		const p = await fetchPlan();
		expect(p.executions).to.equal(2);
		expect(p.lastReason).to.equal(REASON.OK);
		expect(p.totalInvested.toNumber()).to.equal(200_000_000);
		expect(await tokenBalance(provider, vault)).to.equal(150_000_000);
	});

	it("defers with INSUFFICIENT_BALANCE when the vault cannot cover a period", async () => {
		await program.methods
			.withdraw(usdc(100))
			.accountsPartial({ plan, vault, ownerUsdc: userUsdc, owner: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
			.signers([user])
			.rpc();
		// 50 left < 100: withdraw paused the plan; the owner resumes anyway.
		await program.methods.setPaused(false).accountsPartial({ plan, owner: user.publicKey }).signers([user]).rpc();
		await nudge();
		await postAllFresh();
		await execute();
		const p = await fetchPlan();
		expect(p.lastReason).to.equal(REASON.INSUFFICIENT_BALANCE);
		expect(p.deferrals).to.equal(5);
	});

	it("refuses a paused plan", async () => {
		await program.methods.setPaused(true).accountsPartial({ plan, owner: user.publicKey }).signers([user]).rpc();
		await nudge();
		await expectAnchorError(execute(), "PlanNotActive");
	});

	it("rejects a wrong number of leg accounts", async () => {
		await program.methods.setPaused(false).accountsPartial({ plan, owner: user.publicKey }).signers([user]).rpc();
		await nudge();
		await expectAnchorError(
			program.methods
				.executeBasket()
				.accountsPartial({ config, plan, vault, keeper: keeper.publicKey, fillProgram: mockMarket.programId, tokenProgram: TOKEN_PROGRAM_ID })
				.remainingAccounts(legAccounts().slice(0, 12))
				.signers([keeper])
				.rpc(),
			"WrongLegAccountCount",
		);
	});
});
