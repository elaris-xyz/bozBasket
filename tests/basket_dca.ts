import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { BasketDca } from "../target/types/basket_dca";
import { MockMarket } from "../target/types/mock_market";
import {
	airdrop,
	configPda,
	createUsdc,
	expectAnchorError,
	FEEDS,
	feedId,
	fundUsdc,
	planPda,
	tokenBalance,
	TOKEN_PROGRAM_ID,
	usdc,
	vaultPda,
	SystemProgram,
} from "./helpers";

describe("basket_dca: config, plan, vault", () => {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);
	const program = anchor.workspace.BasketDca as Program<BasketDca>;
	const mockMarket = anchor.workspace.MockMarket as Program<MockMarket>;

	const admin = (provider.wallet as anchor.Wallet).payer;
	const keeper = Keypair.generate();
	const user = Keypair.generate();
	let usdcMint: PublicKey;
	let userUsdc: PublicKey;
	const config = configPda(program.programId);

	const mintA = Keypair.generate().publicKey;
	const mintB = Keypair.generate().publicKey;
	const legs = [
		{ mint: mintA, weightBps: 6000, pythFeedId: feedId(FEEDS.AAPL) },
		{ mint: mintB, weightBps: 4000, pythFeedId: feedId(FEEDS.NVDA) },
	];
	const week = new anchor.BN(7 * 86400);

	before(async () => {
		await airdrop(provider, user.publicKey);
		usdcMint = await createUsdc(provider, admin);
		userUsdc = await fundUsdc(provider, admin, usdcMint, user.publicKey, 1_000);
	});

	it("init_config stores parameters and the admin", async () => {
		await program.methods
			.initConfig({
				keeper: keeper.publicKey,
				maxStalenessSecs: 60,
				maxConfBps: 50,
				maxDivergenceBps: 150,
				minLiquidityUsdc: usdc(1_000),
				fillProgram: mockMarket.programId,
				referenceProgram: mockMarket.programId,
			})
			.accounts({ config, usdcMint, admin: admin.publicKey, systemProgram: SystemProgram.programId })
			.rpc();
		const c = await program.account.config.fetch(config);
		expect(c.admin.equals(admin.publicKey)).to.be.true;
		expect(c.keeper.equals(keeper.publicKey)).to.be.true;
		expect(c.usdcMint.equals(usdcMint)).to.be.true;
		expect(c.maxStalenessSecs).to.equal(60);
		expect(c.maxDivergenceBps).to.equal(150);
		expect(c.referenceProgram.equals(mockMarket.programId)).to.be.true;
	});

	it("update_config rejects a non-admin", async () => {
		await expectAnchorError(
			program.methods
				.updateConfig({
					keeper: keeper.publicKey,
					maxStalenessSecs: 10,
					maxConfBps: 50,
					maxDivergenceBps: 150,
					minLiquidityUsdc: usdc(1),
					fillProgram: mockMarket.programId,
					referenceProgram: mockMarket.programId,
				})
				.accounts({ config, admin: user.publicKey })
				.signers([user])
				.rpc(),
			"NotAdmin",
		);
	});

	const createPlan = (planId: number, args: Partial<{ amount: anchor.BN; period: anchor.BN; start: number; end: number; legs: typeof legs }> = {}) => {
		const plan = planPda(program.programId, user.publicKey, planId);
		const vault = vaultPda(program.programId, plan);
		const tx = program.methods
			.createPlan(
				planId,
				args.amount ?? usdc(100),
				args.period ?? week,
				new anchor.BN(args.start ?? 0),
				new anchor.BN(args.end ?? 0),
				args.legs ?? legs,
			)
			.accounts({
				config,
				usdcMint,
				plan,
				vault,
				owner: user.publicKey,
				tokenProgram: TOKEN_PROGRAM_ID,
				systemProgram: SystemProgram.programId,
				rent: anchor.web3.SYSVAR_RENT_PUBKEY,
			})
			.signers([user]);
		return { plan, vault, rpc: () => tx.rpc() };
	};

	it("create_plan validates weights, legs and period", async () => {
		await expectAnchorError(createPlan(90, { legs: [] }).rpc(), "BadLegCount");
		await expectAnchorError(
			createPlan(91, { legs: [{ ...legs[0], weightBps: 5000 }, { ...legs[1], weightBps: 4000 }] }).rpc(),
			"WeightsDoNotSum",
		);
		await expectAnchorError(
			createPlan(92, { legs: [{ ...legs[0], weightBps: 5000 }, { ...legs[0], weightBps: 5000 }] }).rpc(),
			"DuplicateMint",
		);
		await expectAnchorError(createPlan(93, { amount: usdc(0) }).rpc(), "ZeroAmount");
		await expectAnchorError(createPlan(94, { period: new anchor.BN(30) }).rpc(), "PeriodTooShort");
		await expectAnchorError(createPlan(95, { start: 2_000_000_000, end: 1_999_999_999 }).rpc(), "EndBeforeStart");
	});

	let plan: PublicKey;
	let vault: PublicKey;

	it("create_plan stores legs and opens an empty vault owned by the plan", async () => {
		const c = createPlan(1);
		plan = c.plan;
		vault = c.vault;
		await c.rpc();
		const p = await program.account.plan.fetch(plan);
		expect(p.owner.equals(user.publicKey)).to.be.true;
		expect(p.planId).to.equal(1);
		expect(p.legCount).to.equal(2);
		expect(p.legs[0].mint.equals(mintA)).to.be.true;
		expect(p.legs[0].weightBps).to.equal(6000);
		expect(p.legs[1].weightBps).to.equal(4000);
		expect(p.legs[2].weightBps).to.equal(0);
		expect(p.amountPerPeriod.toNumber()).to.equal(100_000_000);
		expect(p.periodSeconds.toNumber()).to.equal(7 * 86400);
		expect(p.nextExecution.toNumber()).to.be.greaterThan(1_700_000_000);
		expect(p.status).to.equal(0);
		expect(p.vault.equals(vault)).to.be.true;
		expect(await tokenBalance(provider, vault)).to.equal(0);
	});

	it("deposit moves USDC into the vault", async () => {
		await program.methods
			.deposit(usdc(250))
			.accounts({ plan, vault, ownerUsdc: userUsdc, owner: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
			.signers([user])
			.rpc();
		expect(await tokenBalance(provider, vault)).to.equal(250_000_000);
		expect(await tokenBalance(provider, userUsdc)).to.equal(750_000_000);
	});

	it("deposit rejects a stranger", async () => {
		const stranger = Keypair.generate();
		await airdrop(provider, stranger.publicKey, 1);
		const strangerUsdc = await fundUsdc(provider, admin, usdcMint, stranger.publicKey, 10);
		await expectAnchorError(
			program.methods
				.deposit(usdc(1))
				.accounts({ plan, vault, ownerUsdc: strangerUsdc, owner: stranger.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
				.signers([stranger])
				.rpc(),
			"NotOwner",
		);
	});

	it("withdraw returns USDC and keeps the plan active while a period remains", async () => {
		await program.methods
			.withdraw(usdc(100))
			.accounts({ plan, vault, ownerUsdc: userUsdc, owner: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
			.signers([user])
			.rpc();
		expect(await tokenBalance(provider, vault)).to.equal(150_000_000);
		expect(await tokenBalance(provider, userUsdc)).to.equal(850_000_000);
		expect((await program.account.plan.fetch(plan)).status).to.equal(0);
	});

	it("withdraw below one period pauses the plan", async () => {
		await program.methods
			.withdraw(usdc(100))
			.accounts({ plan, vault, ownerUsdc: userUsdc, owner: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
			.signers([user])
			.rpc();
		expect(await tokenBalance(provider, vault)).to.equal(50_000_000);
		expect((await program.account.plan.fetch(plan)).status).to.equal(1);
	});

	it("withdraw cannot overdraw the vault", async () => {
		await expectAnchorError(
			program.methods
				.withdraw(usdc(51))
				.accounts({ plan, vault, ownerUsdc: userUsdc, owner: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
				.signers([user])
				.rpc(),
			"InsufficientVault",
		);
	});

	it("set_paused resumes and refuses a no-op", async () => {
		await program.methods.setPaused(false).accounts({ plan, owner: user.publicKey }).signers([user]).rpc();
		expect((await program.account.plan.fetch(plan)).status).to.equal(0);
		await expectAnchorError(
			program.methods.setPaused(false).accounts({ plan, owner: user.publicKey }).signers([user]).rpc(),
			"NoStatusChange",
		);
		await program.methods.setPaused(true).accounts({ plan, owner: user.publicKey }).signers([user]).rpc();
		expect((await program.account.plan.fetch(plan)).status).to.equal(1);
	});
});
