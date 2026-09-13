import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { expect } from "chai";
import { MockMarket } from "../target/types/mock_market";
import {
	airdrop,
	createUsdc,
	expectAnchorError,
	FEEDS,
	feedId,
	fundUsdc,
	makeProvider,
	marketPdas,
	px,
	tokenBalance,
	TOKEN_PROGRAM_ID,
	usdc,
	SystemProgram,
} from "./helpers";

describe("mock_market: mint, reference, fill", () => {
	const provider = makeProvider();
	const program = anchor.workspace.MockMarket as Program<MockMarket>;
	const admin = (provider.wallet as anchor.Wallet).payer;
	const buyer = Keypair.generate();

	let usdcMint: PublicKey;
	let buyerUsdc: PublicKey;
	let buyerStock: PublicKey;
	const symbol = "mAAPL";
	const pdas = () => marketPdas(program.programId, symbol);

	before(async () => {
		await airdrop(provider, buyer.publicKey);
		usdcMint = await createUsdc(provider, admin);
		buyerUsdc = await fundUsdc(provider, admin, usdcMint, buyer.publicKey, 1_000);
	});

	it("init_market creates the mint, treasury and a Pyth-shaped reference", async () => {
		const { market, stockMint, treasury, reference } = pdas();
		await program.methods
			.initMarket(symbol, feedId(FEEDS.AAPL), 20, usdc(50_000))
			.accountsPartial({
				market,
				stockMint,
				usdcMint,
				admin: admin.publicKey,
				tokenProgram: TOKEN_PROGRAM_ID,
				systemProgram: SystemProgram.programId,
				rent: anchor.web3.SYSVAR_RENT_PUBKEY,
			})
			.rpc();
		await program.methods
			.initMarketAccounts()
			.accountsPartial({
				market,
				usdcMint,
				treasury,
				reference,
				admin: admin.publicKey,
				tokenProgram: TOKEN_PROGRAM_ID,
				systemProgram: SystemProgram.programId,
				rent: anchor.web3.SYSVAR_RENT_PUBKEY,
			})
			.rpc();
		// Before any assertion, so one failing check cannot cascade into every
		// later test that needs the buyer's stock account.
		buyerStock = (await getOrCreateAssociatedTokenAccount(provider.connection, admin, stockMint, buyer.publicKey)).address;

		const m = await program.account.market.fetch(market);
		expect(m.symbol).to.equal(symbol);
		expect(m.treasury.equals(treasury)).to.be.true;
		expect(m.reference.equals(reference)).to.be.true;
		expect(m.spreadBps).to.equal(20);
		expect(m.liquidityUsdc.toNumber()).to.equal(50_000_000_000);
		expect(m.priceOverride.toNumber()).to.equal(0);

		const r = await program.account.priceUpdateV2.fetch(reference);
		expect(Buffer.from(r.priceMessage.feedId).toString("hex")).to.equal(FEEDS.AAPL);
		// The placeholder until the first post_reference; US equity feeds use -5.
		expect(r.priceMessage.exponent).to.equal(-5);
		expect(r.priceMessage.publishTime.toNumber()).to.equal(0);

		// Raw layout: 8-byte discriminator, then write_authority at offset 8.
		const info = await provider.connection.getAccountInfo(reference);
		expect(info!.data.length).to.equal(134);
		expect(Buffer.from(info!.data.subarray(0, 8))).to.deep.equal(Buffer.from([34, 241, 35, 99, 157, 126, 244, 205]));
		expect(new PublicKey(info!.data.subarray(8, 40)).equals(admin.publicKey)).to.be.true;
	});

	it("init_market_accounts cannot run twice", async () => {
		// The PDAs already exist, so the system program refuses the allocation
		// before the handler's own AlreadyInitialized guard is reached.
		const { market, treasury, reference } = pdas();
		let failed = false;
		try {
			await program.methods
				.initMarketAccounts()
				.accountsPartial({ market, usdcMint, treasury, reference, admin: admin.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: anchor.web3.SYSVAR_RENT_PUBKEY })
				.rpc();
		} catch (err: any) {
			failed = true;
			expect(String(err)).to.match(/already in use|AlreadyInitialized/);
		}
		expect(failed, "second init_market_accounts must fail").to.be.true;
	});

	it("post_reference writes price, conf and the source publish time", async () => {
		const { market, reference } = pdas();
		const publishTime = 1_789_156_800; // a Friday 16:00 ET close, not "now"
		await program.methods
			.postReference(px(250), new anchor.BN(5_000_000), -8, new anchor.BN(publishTime))
			.accountsPartial({ market, reference, admin: admin.publicKey })
			.rpc();
		const r = await program.account.priceUpdateV2.fetch(reference);
		expect(r.priceMessage.price.toNumber()).to.equal(25_000_000_000);
		expect(r.priceMessage.conf.toNumber()).to.equal(5_000_000);
		expect(r.priceMessage.publishTime.toNumber()).to.equal(publishTime);
		expect(r.postedSlot.toNumber()).to.be.greaterThan(0);
	});

	it("post_reference rejects a non-admin", async () => {
		const { market, reference } = pdas();
		await expectAnchorError(
			program.methods
				.postReference(px(1), new anchor.BN(1), -8, new anchor.BN(1))
				.accountsPartial({ market, reference, admin: buyer.publicKey })
				.signers([buyer])
				.rpc(),
			"NotAdmin",
		);
	});

	it("fill mints units at reference plus spread and drains liquidity", async () => {
		const { market, stockMint, treasury, reference } = pdas();
		// $100 at $250 * 1.002 = 0.399201... units.
		await program.methods
			.fill(usdc(100))
			.accountsPartial({
				market,
				stockMint,
				treasury,
				reference,
				payerUsdc: buyerUsdc,
				payerAuthority: buyer.publicKey,
				recipient: buyerStock,
				tokenProgram: TOKEN_PROGRAM_ID,
			})
			.signers([buyer])
			.rpc();
		const units = await tokenBalance(provider, buyerStock);
		expect(units).to.equal(Math.floor(100_000_000 * 1e8 / 25_050_000_000));
		expect(units).to.equal(399_201);
		expect(await tokenBalance(provider, treasury)).to.equal(100_000_000);
		expect(await tokenBalance(provider, buyerUsdc)).to.equal(900_000_000);
		const m = await program.account.market.fetch(market);
		expect(m.liquidityUsdc.toNumber()).to.equal(49_900_000_000);
	});

	it("set_price_override changes the venue price without touching the reference", async () => {
		const { market, stockMint, treasury, reference } = pdas();
		await program.methods.setPriceOverride(px(300)).accountsPartial({ market, admin: admin.publicKey }).rpc();
		const before = await tokenBalance(provider, buyerStock);
		await program.methods
			.fill(usdc(100))
			.accountsPartial({ market, stockMint, treasury, reference, payerUsdc: buyerUsdc, payerAuthority: buyer.publicKey, recipient: buyerStock, tokenProgram: TOKEN_PROGRAM_ID })
			.signers([buyer])
			.rpc();
		const got = (await tokenBalance(provider, buyerStock)) - before;
		expect(got).to.equal(Math.floor(100_000_000 * 1e8 / (30_000_000_000 * 1.002)));
		const r = await program.account.priceUpdateV2.fetch(reference);
		expect(r.priceMessage.price.toNumber()).to.equal(25_000_000_000);
		await program.methods.setPriceOverride(new anchor.BN(0)).accountsPartial({ market, admin: admin.publicKey }).rpc();
	});

	it("set_liquidity below the order makes fill fail with LowLiquidity", async () => {
		const { market, stockMint, treasury, reference } = pdas();
		await program.methods.setLiquidity(usdc(10)).accountsPartial({ market, admin: admin.publicKey }).rpc();
		await expectAnchorError(
			program.methods
				.fill(usdc(100))
				.accountsPartial({ market, stockMint, treasury, reference, payerUsdc: buyerUsdc, payerAuthority: buyer.publicKey, recipient: buyerStock, tokenProgram: TOKEN_PROGRAM_ID })
				.signers([buyer])
				.rpc(),
			"LowLiquidity",
		);
		await program.methods.setLiquidity(usdc(50_000)).accountsPartial({ market, admin: admin.publicKey }).rpc();
	});

	it("admin controls reject a non-admin", async () => {
		const { market } = pdas();
		await expectAnchorError(
			program.methods.setLiquidity(usdc(1)).accountsPartial({ market, admin: buyer.publicKey }).signers([buyer]).rpc(),
			"NotAdmin",
		);
	});
});
