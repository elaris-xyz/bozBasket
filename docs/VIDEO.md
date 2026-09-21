# Pitch video — production brief

**For the editor.** No Solana knowledge, wallet or install needed: this is
screen capture of one website plus a voice-over. Work top to bottom. Keep the
narration wording; where a line says **[read from screen]**, say what the site
shows when you record.

## 1. Deliverable

| | |
|---|---|
| Length | About 2:30. Hard limit 2:45. |
| Format | MP4, H.264, 1920×1080, 30 fps |
| Audio | Voice-over; music, if any, at least 20 dB under it |
| Captions | Burned in, every line. Judges watch muted. |
| File | `bozbasket-pitch.mp4` → YouTube, unlisted → the form's **Pitch Video URL** |

The technical film, `docs/VIDEO-TECHNICAL.md`, is separate and shares no
footage with this one.

## 2. The product in three lines

- US stocks trade as tokens on Solana around the clock. The price you can trust
  them against, Pyth's, only exists while the US market runs: from Friday 20:00
  to Sunday 20:00 New York time there is none.
- Timer-based bots buy anyway. bozBasket checks the price on chain first,
  refuses when it cannot be trusted, and records why.
- Everything you film is live, and the refusals are real transactions.

## 3. Before you record

- **When:** between Sunday 20:00 and Friday 20:00, New York time. Check: the
  thin strip under the site's menu must say **live**. If it shows an age such
  as "1d 7h old", the market is closed and shots 4–6 cannot be filmed.
- Chrome, new profile, no extensions, bookmarks bar hidden, zoom 100%, window
  1920×1080, notifications off, system clock set to automatic.
- **Network test:** reload https://boz-basket-web.vercel.app five times. If a
  "verifying" or checkpoint page appears even once, switch to another network
  before recording.
- Open https://boz-basket-web.vercel.app/demo, click **Restore everything**,
  wait twenty seconds.
- Three tabs, in this order:
  1. `https://boz-basket-web.vercel.app`
  2. `https://boz-basket-web.vercel.app/plan/5vV866AdEP6kR5NemndnVoopUCK4ygXCuyGUG8L78LZq`
  3. `https://boz-basket-web.vercel.app/demo`
- Capture in one pass, then cut. Move the mouse slowly.

---

## 4. The shots

### Shot 1 — The problem (0:00–0:15)

**Do:** Tab 1, top of the page. Slow 10% zoom on the headline.

**Say:**

> Tokenized stocks trade around the clock. The price they are measured against
> does not: from Friday evening to Sunday evening no US equity price is
> published, and the last one just ages for two days while the tokens keep
> trading. Recurring-buy bots fire on a timer anyway.

**Edit:** Open on a clean frame, no cursor.

---

### Shot 2 — What it does (0:15–0:35)

**Do:** Hold on the three blocks beside the headline ("One transaction",
"Fair-value guard", "Deferral, not a blind fill"), then scroll to the panel
headed "Right now, live from Pyth".

**Say:**

> bozBasket buys a basket of them on a schedule, in one atomic transaction —
> but only after the program checks the price. Too old, too uncertain, or the
> venue has drifted, and the buy is deferred, with the reason written on chain.
> These are Pyth's prices right now. [read from screen: if the market is open,
> "seconds old"; if the tag says "Pyth paused", "(age) old — and a timer bot
> would buy against them anyway".]

**Edit:** Highlight each block as it is named; zoom into one price card on its
age.

---

### Shot 3 — Build a basket (0:35–0:55)

**Do:** Menu → **Build a basket**. Click **Create a demo wallet (no
extension)** at the bottom of the right-hand column and wait for the balance.
Click the preset **Growth Tilt**, nudge the TSLA slider, point at the "When it
buys" block, then click **Create plan and deposit**.

**Say:**

> No extension, no seed phrase: a throwaway key, funded on devnet. A hundred
> dollars a week across Tesla, the Nasdaq 100 and the S&P 500 — and the panel
> says when the first buy will be tried. One transaction creates the plan and
> its vault, and only my key can withdraw.

**Edit:** Cut every wait.

---

### Shot 4 — Break it on purpose (0:55–1:20)

**Do:** Tab 2, scroll to the panel headed "Execution guard"; its verdict reads
**Would execute**. Tab 3: market selector on **TSLA**, click **Force
divergence (TSLA)**. Back to tab 2: within fifteen seconds the verdict turns
amber, **Would defer: Venue diverged from reference**.

**Say:**

> Every number the program checks before it buys: the price's age, its
> confidence, the venue's drift, and depth. Everything passes. Now I push the
> venue's price five percent off — a real transaction, not a switch in the
> interface — and the guard says it would refuse.

**Edit:** Cut from the click to the amber verdict and hold it two seconds.

---

### Shot 5 — The program refuses (1:20–1:40)

**Do:** Tab 3, click **Make the plan due**. Tab 2, **History**: within a
minute a new top row reads "deferred · Venue diverged from reference", with a
"demo control" tag, because a demo button caused it. Click
the transaction link on that row; the explorer opens.

**Say:**

> The keeper does not take the panel's word for it: it submits, and the
> program decides. Deferred. And the transaction itself succeeded — nothing
> moved, and the refusal is on chain with its reason. A timer bot cannot show
> you that.

**Edit:** Zoom into the explorer's green **Success**.

---

### Shot 6 — Put it back, and buy (1:40–1:52)

**Do:** Tab 3: **Restore everything**, then **Make the plan due**. Tab 2:
scroll down to **History** and hold on the new top row, marked "executed".
Then scroll back **up**, past the "Execution guard" panel, to the card headed
**Portfolio**: it is in the right-hand column beside "What the guard did",
just under the chart. Its unit counts have just grown.

**Say:**

> Restore the venue, and the same plan fills: three stocks, one transaction,
> all or nothing. Units, average cost, and the value against the live price.

---

### Shot 7 — Measured, and the close (1:52–2:30)

**Do:** Tab 1. Hold three seconds on "The real market: xStocks on Solana
mainnet", scroll to "Last weekend, measured live", then to the eight-weekend
card below it, then the footer line, and back to the headline.

**Say:**

> And the problem is measured. Every five minutes this checks what a hundred
> dollars buys in real tokenized stocks on mainnet, and runs the same guard —
> read-only. Last weekend Pyth was silent for forty-eight hours, and the guard
> would have refused 495 of 496 checks. It was a calm weekend, and the page
> says so; over the eight before it, a blind buy landed anywhere from two
> percent under to two percent over the next trustworthy price. On devnet the
> stock tokens and fills are simulated, and every page says so; the program,
> the vault, the Pyth prices and every refusal are real. Tokenized stocks made
> the market 24/7. bozBasket makes buying wait for a price worth trusting.
> [read from screen if the numbers differ]

**Edit:** Highlight "would have deferred 495", then the "Worst weekend buy"
lines. End on the headline for two seconds, then cut to black.

---

## 5. If something goes wrong

| You see | Do |
|---|---|
| The strip shows an age, or "Pyth paused" | The market is closed. Come back inside the window. |
| No new History row within a minute | Click **Make the plan due** again; cut the repeat. |
| A panel says it cannot be read | Reload once, wait ten seconds. If it persists, tell the client. |
| A checkpoint page | Switch networks. Never film it. |
| The page differs from this brief | Film what is there and flag the shot. |

## 6. Delivery

The MP4, the project file and the raw capture. Upload the MP4 to YouTube as
unlisted and send the link: it goes in the **Pitch Video URL** field. The form
closes **Friday 25 September, 16:00 New York time**.
