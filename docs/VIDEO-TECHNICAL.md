# Technical video — production brief

**For the editor.** This film is watched by an engineer, so the screen is code
and transactions rather than a person clicking. You still need no wallet, no
install and no command line: every file is opened as a normal web page on
GitHub, and every transaction as a normal web page on the Solana explorer. All
the links are written out below — open them exactly as given.

Work top to bottom. Each shot says what to open, what you should see, exactly
what to say, and what to do in the edit. Keep the narration wording; you are
not expected to understand it, and you should not paraphrase it.

This is the companion to `docs/VIDEO.md`, the pitch. **The two share no
footage.** Do not reuse a single frame between them.

---

## 1. The deliverable

| | |
|---|---|
| Length | 3:00–3:20. Hard limit 3:30. |
| Format | MP4, H.264, 1920×1080, 30 fps |
| Audio | One voice-over track. No music, or music at least 25 dB under the voice. |
| Captions | Burned in, every narration line. |
| File name | `bozbasket-technical.mp4` |
| Where it goes | YouTube, unlisted. The link goes in the submission form's **Technical Video URL** field. |

## 2. What you are looking at

The product buys a basket of tokenized US stocks on a schedule, and refuses to
buy when the price it checks cannot be trusted. This film shows an engineer
three things: where that decision is made, that it is made on the blockchain
rather than in the website, and that the refusals are real transactions.

Two words you will hear and see:

- **Pyth** — the service that publishes the reference price.
- **defer** — the product's word for "refuse this buy for now, and write down
  why".

## 3. Before you record

- Chrome, new profile, no extensions, bookmarks bar hidden, zoom 100%.
- **On GitHub, switch to the dark theme** so the code matches the site: any
  GitHub page → the profile icon → Settings → Appearance → Dark. Do this once
  before recording.
- Browser window exactly 1920×1080, no dev tools, notifications off.
- Nothing here depends on the time of day. Unlike the pitch film, you can
  record this at any hour.
- Open these nine links in nine tabs, in this order. The `#L…` part scrolls
  the page to the right lines and highlights them — do not remove it.

| Tab | Link |
|---|---|
| 1 | https://github.com/elaris-xyz/bozBasket |
| 2 | https://github.com/elaris-xyz/bozBasket/blob/main/programs/basket_dca/src/state.rs#L69-L100 |
| 3 | https://github.com/elaris-xyz/bozBasket/blob/main/programs/basket_dca/src/execute.rs#L126-L176 |
| 4 | https://github.com/elaris-xyz/bozBasket/blob/main/programs/basket_dca/src/execute.rs#L180-L195 |
| 5 | https://explorer.solana.com/tx/2NP5yUCncCSZoyoxco4bNdDJQVDYEqqHjnVanbAoAgtB6hbjSi7hq38Q3RkyxvVHy1AGti7g6kPWnTpwrUxwQLfd?cluster=devnet |
| 6 | https://explorer.solana.com/tx/2HyNfzTFehzuEYCsNVWqodFo2XhMKwhYJRnMy5uDFHMmLGcxHLHkJPL6j1pG2JrBuHJKemKMdGn1L3hdSJDabHUD?cluster=devnet |
| 7 | https://github.com/elaris-xyz/bozBasket/blob/main/packages/shared/src/guard.ts#L75-L95 |
| 8 | https://boz-basket-web.vercel.app/developers |
| 9 | https://boz-basket-web.vercel.app/plan/5vV866AdEP6kR5NemndnVoopUCK4ygXCuyGUG8L78LZq |

Tabs 5 and 6 are real transactions and will stay where they are; if either
fails to load, reload once.

The edit cuts between two kinds of page: GitHub (the code) and the live site or
explorer (what the code did). Keep that rhythm — code, then proof, then code.

---

## 4. The shots

### Shot 1 — What the thing is made of (0:00–0:22)

**Do:** Tab 1, the repository front page. Scroll slowly down the file list,
then stop on the README's architecture section.

**Say:**

> An Anchor program on Solana devnet. A keeper that runs as a scheduled
> serverless function, or as a long-running worker, through one code path. A
> Next.js app that reads the chain directly. And a shared package holding the
> guard rules, mirrored in Rust inside the program. Nine instructions, three of
> which matter: create a plan, deposit, execute the basket.

**Edit:** Keep the scroll slow enough to read folder names. No zoom.

---

### Shot 2 — The account model (0:22–0:42)

**Do:** Tab 2. The page opens with the plan account's fields highlighted. Hold,
then zoom gently into the highlighted `vault` lines.

**See:** A Rust struct listing the owner, the legs, the schedule, and a comment
saying the vault's authority is the plan itself.

**Say:**

> A plan is one account: its owner, the stocks and their weights, the amount
> per period, the schedule, and the counters. The money sits in a vault whose
> authority is the plan, and the only key that can withdraw from it is the
> owner's. The keeper can make a plan execute. It can never move that money
> anywhere else.

**Edit:** Put a highlight box around the `owner` field and the `vault` comment
as each is said.

---

### Shot 3 — The guard runs on chain (0:42–1:12)

**Do:** Tab 3. The four checks are highlighted. Scroll through them slowly,
about eight seconds from the first to the last.

**See:** Rust code comparing an age, a confidence figure, a divergence and a
liquidity depth against configured limits, each followed by a line saying
`Verdict::Defer`.

**Say:**

> This is the part that is not a dashboard. Inside the transaction, for every
> leg: the price account has to be the one the Pyth receiver just wrote, its
> feed has to match the leg, and its verification level has to be full. Then
> four numbers against limits held on chain — how old the price is, how wide
> its confidence band is, how far the venue has drifted from it, and whether
> there is depth to fill this leg. Any one of them fails, and the verdict is
> defer.

**Edit:** As each of the four checks is named, highlight that block. This is
the most important shot in the film: give it room.

---

### Shot 4 — A refusal is a successful transaction (1:12–1:32)

**Do:** Tab 4. Hold on the highlighted block.

**See:** Code writing a reason code into the plan, emitting an event, and
returning `Ok`.

**Say:**

> When it defers, the reason code and the leg go into the plan's account, an
> event is emitted, and the instruction returns success. That is deliberate. A
> failed transaction leaves nothing anyone can audit, and this product's whole
> claim is that its refusals are as visible as its buys.

**Edit:** Highlight the line that returns success.

---

### Shot 5 — One transaction, three stocks (1:32–1:52)

**Do:** Tab 5, the explorer. Scroll to the instruction list and expand it if it
is collapsed. Then scroll to the token balance changes.

**See:** Status Success. One `ExecuteBasket` instruction with three `Fill`
calls inside it. Three stock balances going up, and the plan's dollar balance
going down by a hundred. A Pyth instruction at the end, closing the price
update this transaction consumed.

**Say:**

> Here is a real execution. The keeper first posts Pyth's signed price update
> to Pyth's own on-chain receiver. Then, in this transaction, the program reads
> that account back, checks it, and buys all three legs — all or nothing, one
> signature. Three balances up, a hundred dollars out of the vault, once. And
> note the time: ten to five in the morning, New York, hours before the
> exchange opens. It filled because Pyth was publishing a price, not because a
> calendar said the market was open.

**Edit:** Zoom into the instruction names, then into the balance changes.

---

### Shot 6 — And here is a refusal (1:52–2:12)

**Do:** Tab 6, the explorer. Show the Success status. Scroll to the token
balance section and hold — there is nothing to see there, and that is the
point. Then scroll to the program logs and stop on the line that begins
`Program data:`. Then cut to tab 9, the plan page, scroll to **History**, and
stop on the row reading "Reference price stale · TSLA price 47 h old".

**See:** Status Success. An `ExecuteBasket` instruction. No token balance
change at all. A `Program data:` line of base64.

**Say:**

> And here is the same plan refusing, ten hours earlier. Status: success.
> The basket instruction ran — and not one token moved. The reason is not
> printed in plain text; it is in that encoded line, the event the program
> emitted, and in the plan's own account. Decoded, it says: reference price
> stale, first leg, forty-seven hours old, retry in an hour. The site decodes
> the same event, and that is the row you can read.

**Note for the editor:** do not look for a readable reason in the log. It is
not there, and the shot is built around that: the machine-readable event on
one side, the site's decoded row on the other.

**Edit:** For the last three seconds, put the two explorer pages side by side:
the execution's balance changes on the left, this transaction's untouched
balances on the right. Then the site's History row, full frame.

---

### Shot 7 — One rulebook, three readers (2:12–2:38)

**Do:** Tab 7, the shared guard file. Hold five seconds. Then tab 8, the
developers page on the live site; scroll to the endpoint that returns a
verdict.

**Say:**

> The Rust inside the program and this TypeScript are the same rules, and the
> comment above the reason codes says all three files change together. The
> plan page, the keeper and the public API all call this one function, so the
> number a reader sees is the number the program will act on. And that API is
> open: any wallet or recurring-buy tool can ask for a verdict before its own
> swap.

**Edit:** Cut between the code and the API page on the word "API".

---

### Shot 8 — Measured against the real market (2:38–2:58)

**Do:** Open https://boz-basket-web.vercel.app and scroll to "The real market:
xStocks on Solana mainnet", then to "Weekends, measured".

**Say:**

> None of this is argued from a whiteboard. Every five minutes the keeper asks
> a real venue what a hundred dollars actually buys in tokenized stocks on
> mainnet, compares it with Pyth, and runs the same guard over it — read-only,
> nothing is bought. The table underneath is built from real trades, hour by
> hour, over eight weekends. Both panels say how they were measured, including
> the parts that do not flatter the guard.

**Edit:** Highlight the "read-only · every 5 min" tag, then the medians.

---

### Shot 9 — What is real, and what is not (2:58–3:15)

**Do:** Scroll to the footer line of the home page. Hold.

**Say:**

> Devnet has no real tokenized stocks and no real venue, so in the demo the
> stock tokens and the fills come from a mock market program that fills at the
> reference price, and every page says so. The program, the vaults, the
> schedule, the Pyth updates, the guard and every deferral are real on chain.
> The repository is in the description.

**Edit:** End on the repository page from shot 1 for two seconds, then cut to
black.

---

## 5. If something goes wrong

| What you see | What to do |
|---|---|
| A GitHub link does not highlight any lines | The file changed. Film the file anyway, from its top, and tell the client which link missed. |
| An explorer page says the transaction was not found | Reload once, then switch the network selector to **Devnet** at the top right. |
| The developers page or the site shows an error panel | Reload once and wait ten seconds; tell the client if it persists. |
| GitHub is in light theme | Stop and fix it (section 3). A white page in a dark film is jarring. |

## 6. Delivery

One MP4, plus the project file and the raw capture. Upload to YouTube as
unlisted and send the link. It goes in the **Technical Video URL** field of the
submission form, which closes **Friday 25 September, 16:00 New York time**.
