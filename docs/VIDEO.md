# Pitch video — production brief

**For the editor.** You do not need to know Solana, and nothing here needs a
wallet, an install or a command line. Everything is screen capture of one
website, plus a voice-over read from the words in this file. Work top to
bottom: the setup first, then the shots in order. Each shot says what to do,
what you should see, exactly what to say, and what to do in the edit.

Keep the narration wording. Where a line is marked **[read from screen]**, that
number changes every day: say whatever the site shows at the moment you record.

---

## 1. The deliverable

| | |
|---|---|
| Length | 2:30–2:50. Hard limit 3:00. |
| Format | MP4, H.264, 1920×1080, 30 fps |
| Audio | One voice-over track; optional music at least 20 dB under the voice |
| Captions | Burned in, every narration line. Judges watch muted. |
| File name | `bozbasket-pitch.mp4` |
| Where it goes | YouTube, unlisted. The link goes in the submission form's **Pitch Video URL** field. |

There is a second, separate film: `docs/VIDEO-TECHNICAL.md`. The two share no
footage. If you are making both, record this one first — it is the one a judge
watches.

## 2. What the product is, in five lines

1. US stocks can now be bought as tokens on Solana, at any hour, any day.
2. A price you can trust, published by Pyth, exists only while the US market
   runs. From Friday evening to Sunday evening there is none: the last price
   sits there getting older.
3. Recurring-buy bots fire on a timer, so they buy at 3 a.m. on a Saturday
   against a two-day-old number.
4. bozBasket is a recurring buy for a basket of these tokens that checks the
   price first, on chain, refuses to buy when it cannot be trusted, and writes
   down why.
5. The site you are filming is live. The refusals you will film are real
   transactions.

## 3. Before you record

**The clock matters more than anything else here.** Record between **Sunday
20:00 and Friday 20:00, New York time**. Outside that window the US market is
closed, the product refuses *every* buy, and shots 6 to 8 — where it does buy —
cannot be filmed.

Check it in five seconds: open https://boz-basket-web.vercel.app and read the
thin strip under the menu. It must say **live**. If it says something like
"1d 7h old", you are in the closed window. Stop and come back later.

Then:

- Chrome, a brand-new profile, no extensions, bookmarks bar hidden, zoom 100%.
- Browser window exactly 1920×1080. No dev tools.
- System notifications off.
- Set the computer's clock to automatic time and sync it. Some ages on the
  site are counted by your computer; a clock a few minutes off makes a fresh
  price look minutes old on camera.
- Open https://boz-basket-web.vercel.app/demo and click **Restore everything**.
  Wait about twenty seconds. That returns the demo to a clean state.
- Keep three tabs open, in this order:
  1. `https://boz-basket-web.vercel.app`
  2. `https://boz-basket-web.vercel.app/plan/5vV866AdEP6kR5NemndnVoopUCK4ygXCuyGUG8L78LZq`
  3. `https://boz-basket-web.vercel.app/demo`
- If a page shows a browser checkpoint or a blank screen, reload once. Never
  film a checkpoint page.
- Capture the whole session in one pass, then cut. Move the mouse slowly: a
  judge is reading the screen, not watching a cursor.

---

## 4. The shots

### Shot 1 — The problem (0:00–0:22)

**Do:** Tab 1, top of the home page. Hold still, then zoom in 10% on the
headline across six seconds.

**See:** The headline "Buy a basket of US stocks on a schedule, only when the
price can be trusted", and the price strip under the menu.

**Say:**

> Tokenized stocks trade around the clock, seven days a week. The price they
> are measured against does not. From Friday evening to Sunday evening no US
> equity price is published at all — the last one just sits there, ageing, for
> two days, while the tokens keep trading. Every recurring-buy tool on chain
> fires on a timer anyway.

**Edit:** Open on a clean frame with no cursor. Let the last sentence land
before cutting.

---

### Shot 2 — What it does (0:22–0:38)

**Do:** Scroll slowly to the three blocks beside the headline: "One
transaction", "Fair-value guard", "Deferral, not a blind fill". Hold two
seconds on each.

**Say:**

> bozBasket buys a basket of them on a schedule, in one atomic transaction —
> but only after the program itself checks the price. If the reference price is
> too old, too uncertain, or the venue has drifted away from it, the buy is
> deferred, and the reason is written on chain.

**Edit:** Put a soft highlight box around each block as it is named.

---

### Shot 3 — The market, right now (0:38–0:55)

**Do:** Scroll to the panel headed "Right now, live from Pyth". Hold on the
three price cards.

**Say:**

> This is live: Pyth's three reference prices, how old each one is, and how
> tight. [read from screen — if the tag says "Pyth paused", say: "Right now the
> US market is closed and these prices are (age) old. A timer-based bot would
> buy against them anyway." If the market is open, say: "Right now they are
> seconds old, so the guard lets a buy through."]

**Edit:** Zoom to fill the frame with one price card as the age is said.

---

### Shot 4 — Build a basket (0:55–1:18)

**Do:** Click **Try with a demo wallet**, top right. Wait for a balance to
appear. Click **Build a basket** in the menu. Click the preset **Growth Tilt**,
drag the TSLA slider a little, then point at the right-hand column and its
"When it buys" block. Click the create button at the bottom of that column.

**Say:**

> No extension, no seed phrase — this makes a throwaway key in the browser and
> funds it on devnet. Pick the stocks, the weights, the amount and the cadence:
> a hundred dollars a week across Tesla, the Nasdaq 100 and the S&P 500. The
> panel says exactly when the first buy will be attempted, and why. One
> transaction creates the plan, creates its vault and funds it — and the only
> key that can withdraw from that vault is mine.

**Edit:** Cut the wait between the click and the confirmation. Never hold on a
spinner for more than a second.

---

### Shot 5 — The guard, before anything breaks (1:18–1:32)

**Do:** Tab 2, the demo plan. Scroll to the panel headed "Execution guard".
Hold, then pan slowly down the rows.

**Say:**

> Every number the program checks before it buys, for every leg: how old Pyth's
> price is, how wide its confidence band is, how far the venue has drifted from
> it, and whether there is depth to fill the order. Right now everything
> passes.

**Edit:** No zoom. The whole table is the point.

---

### Shot 6 — Break it on purpose (1:32–1:58)

**Do:** Tab 3, the demo controls. The market selector must say **TSLA**. Click
**Force divergence (TSLA)** and wait for the confirmation. Switch to tab 2,
reload, scroll to "Execution guard".

**See:** The TSLA row and the verdict turn amber: "Would defer: venue diverged
from reference".

**Say:**

> Let me push the venue's price five percent away from the reference. That is a
> real transaction changing real state, not a switch in the interface. The
> panel agrees: it would refuse this buy.

**Edit:** Cut straight from the click to the amber panel, and hold on the amber
verdict for two full seconds.

---

### Shot 7 — The program decides, and refuses (1:58–2:20)

**Do:** Tab 3, click **Make the plan due**. Tab 2, scroll to **History** and
wait up to a minute for a new row at the top. Click the transaction link on the
right of that row; the Solana explorer opens in a new tab.

**See:** A row marked "deferred" reading "Venue diverged from reference", and on
the explorer a transaction whose status is **Success**.

**Say:**

> The keeper does not take the panel's word for it. It builds the transaction
> and submits it, and the program decides. Deferred — the venue diverged. And
> look at the transaction itself: it succeeded. Nothing moved. The refusal is on
> chain with its reason, which is the part a timer-based bot can never show you.

**Edit:** Cut the waiting. On the explorer, zoom into the green "Success", then
into the log line carrying the reason.

---

### Shot 8 — Put it back, and buy (2:20–2:36)

**Do:** Tab 3: **Restore everything**, then **Make the plan due** again. Tab 2:
History, wait for the new row, then scroll up to the "Portfolio" card.

**Say:**

> Put the venue back and the same plan fills: one transaction, three stocks,
> all or nothing. Units, average cost, and the value against the live reference
> price.

**Edit:** Land the cut on the executed row, then dissolve to the portfolio
table.

---

### Shot 9 — Measured on the real market (2:36–2:50)

**Do:** Tab 1. Scroll to "The real market: xStocks on Solana mainnet" and hold
three seconds on the two cards. Scroll on to "Weekends, measured" and hold on
the first card there, "Last weekend, measured live". Then scroll a little to
the eight-weekend card below it.

**Say:**

> And the problem is measured, not assumed. Every five minutes this checks what
> a hundred dollars buys in real tokenized stocks on mainnet, and runs the same
> guard over it — nothing is ever bought there. Last weekend Pyth was silent for
> forty-eight hours, and the guard would have refused four hundred and
> ninety-five of four hundred and ninety-six checks. It was a calm weekend, and
> the page says so. Over the eight before it, a blind buy landed anywhere from
> two percent under to two percent over the next price anyone could vouch for.
> That gamble is what the guard removes. [read from screen if the numbers
> differ]

**Edit:** Highlight "would have deferred 495" in the live card's headline, then
the "Worst weekend buy" lines in the eight-weekend card.

---

### Shot 10 — The honest part, and the close (2:50–3:00, trim to fit)

**Do:** Stay on the home page, scroll to the footer line, then back to the
headline.

**Say:**

> Devnet has no real stock tokens, so in the demo the tokens and the fills are
> synthetic, and every page says so. The program, the vault, the schedule, the
> Pyth prices and every refusal are real on chain. Tokenized stocks made the
> market 24/7. bozBasket makes the buying wait for a price worth trusting.

**Edit:** End on the headline, two seconds, clean cut to black. No logo
animation, no outro card.

---

## 5. If something goes wrong

| What you see | What to do |
|---|---|
| The strip says "1d 7h old", or the panel says "Pyth paused" | The US market is closed. Shots 6–8 cannot be filmed. Come back inside the window in section 3. |
| No History row within a minute | Click **Make the plan due** once more, and cut the second click out. |
| A panel says it cannot be read, or a chart is unavailable | Reload once, wait ten seconds. If it persists, tell the client before recording more. |
| A browser checkpoint page | Reload once. Never film it. |
| The page looks different from this brief | The site is live and changes. Film what is there and flag the shot you could not match. |

## 6. Delivery

One MP4, plus the project file and the raw capture. Upload the MP4 to YouTube
as unlisted and send the link. It goes in the **Pitch Video URL** field of the
submission form, which closes **Friday 25 September, 16:00 New York time**.
