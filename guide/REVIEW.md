# The Guide — a review

_Reviewed 2026-07-16 by 飛寶, against the book as it stands at commit 901b8de (live on
mindicraft.com). 22 agents: five independent lenses, every serious finding put to two
adversarial verifiers who were told to refute it. What survived is below._

**Status: the critical, the five majors, and the smaller sweep are all FIXED and committed
locally, in all four languages — pushed nowhere, deployed nowhere** (`c402903`, `ab875e1`).
Still open: the contested knapping call (yours), the two missing rungs, and the code layer.
See "What was fixed" at the bottom.

---

## What I think

The book is good. Not "good for a first pass" — good. The tree is real, the voice is
honest, and the knowledge is right where it matters most. Four independent reviewers,
each seeing only their own cluster, came back with the same word: *unusually careful*.

The parts that are genuinely excellent, and should not be touched while fixing anything
else:

- **The tree holds.** 132 guides, 17 domains, zero dangling `needs`, zero cycles, all
  528 language files present, front-matter agreeing with `tree.json` in every single
  file. The chains trace historically correct paths — fire → charcoal → kiln → lime →
  glass; hides + pitch → bellows → bloomery → iron. "Every guide unlocks the next" is a
  promise the data actually keeps.
- **The translations are faithful.** zh, yue and es all checked clean on the six most
  safety-critical guides: every warning present at full strength, every number identical,
  and the 廣東話 is genuine spoken Cantonese, not written Chinese wearing particles.
- **It covers the unglamorous killers.** Latrine siting, handwashing before soap exists,
  oral rehydration, isolating the sick, four independent modes of preservation. The
  survival genre skips these. They are what actually determined how long people lived.
- **The top of the ladder is social.** Councils, records, money-as-trust, teaching
  children — and `plant-a-village` structurally *requires* them. The map asserts that a
  village is agreements as much as it is grain. That is the deepest thing here.

So the work below is not rework. It is six patches and two missing rungs.

---

## The pattern worth knowing

Every confirmed major is a **seam**, not a lone error:

| Guide | Contradicts |
|---|---|
| `make-soap` | its own prerequisite `ash-lye` (calls the weak grade "strong") |
| `smelt-iron` | `bloomery-furnace` (taps a hole the furnace never builds) |
| `smelt-copper` | `smelt-iron` (which makes CO its #1 warning; copper has none) |
| `butter-and-cheese` | `milk-an-animal` (which carries the boil-first warning) |
| `treat-cuts` | `when-to-get-help` (15 minutes vs 10 for the same decision) |
| `melt-glass` | `burn-lime` (which warns of CO at the same kind of furnace) |
| `dry-food` | `smoke-food` (which knows meat wants salt) |

Seven for seven. The individual pages are excellent; what fails is the join between
them. That makes sense once you see it: **the book is written per page, but it is read
per path.** A reader walks a chain. Each page was cared for alone. The chain was not.

The tree enforces *structure* — `needs: [ash-lye]` is checked to exist. Nothing enforces
*semantics* — that `make-soap` and `ash-lye` describe the same lye. The danger lives in
exactly the gap the tree doesn't cover.

The remedy is not a framework. It is: fix these seven, and know that this class exists,
so the next sweep looks at joined pairs rather than at pages.

---

## Fix first (verified — now fixed, see bottom)

### CRITICAL — `keeping-food/smoke-food.md`

Teaches cold-smoking with the salt cure as optional ("Salt if you have it… Do it if you
can"), holds the food "comfortably warm" for two days, then calls the result a store that
"keeps for weeks."

Both verifiers tried to refute this and could not. Cold-smoking is the highest-risk
preservation method for a beginner because the food never gets hot enough to kill
anything. "Comfortably warm" sits inside the bacterial danger zone. Fish held there,
under-salted, then stored in a closed dry container is the textbook vehicle for
*Clostridium botulinum* type E — whose toxin is tasteless and odourless, which means the
guide's own honest defence ("trust your nose") cannot catch it. In every traditional
cold-smoke practice the salt cure is not a bonus; it is the hurdle that makes the method
safe at all.

**Fix:** make the salt cure mandatory and say plainly that unsalted cold-smoked fish is
unsafe. Require dried-hard-through before it counts as a store. For a beginner without
reliable salt, point at hot-smoking that cooks the food through instead.

This one is live, on a page teaching beginners, and it is the reason I'd move today.

### MAJOR — `everyday-chemistry/make-soap.md`

Requires "strong lye water — the brown liquid from dripping water through hardwood ash,"
gated only by the float test. Its own prerequisite `ash-lye.md` defines exactly that
liquid as the **weak** grade (potassium carbonate, tea-coloured) and says only the
lime-causticized grade "makes real, firm soap," handing off with "bring your egg-floating,
silent-in-vinegar lye." Carbonate saponifies fat poorly and slowly. The beginner boils for
hours, gets greasy sludge, and the troubleshooting says *add stronger lye water* — more of
the same thing that failed. An unrecoverable loop that costs a day of fuel and litres of
rendered fat.

**Fix:** require the causticized grade explicitly in You need ("floats the egg AND stays
silent in vinegar"), and point the greasy-soap remedy at causticizing rather than at more
lye.

### MAJOR — `staying-well/treat-cuts.md`

"Pick out any visible grit, splinters, or bits… Every speck left in is a seed for
infection." No upper bound, anywhere. A large embedded object can be plugging the vessel
it cut; pulling it releases bleeding that may not stop.

**Fix:** anything large, deep, or stuck fast stays **in** — pad around it, bandage without
pressing, go for real care. Only surface grit comes out.

### MAJOR — `metal/smelt-iron.md`

Step 5 says "poke open the small hole near the base" to tap slag. `bloomery-furnace.md`
builds exactly two openings — the tuyere (occupied by the air pipe) and a brick-plugged
arch. The hole does not exist. Mid-smelt, at 1,200 °C, the reader either hunts for it
while slag drowns the tuyere and kills the smelt, or improvises a breach in a wall holding
liquid slag.

**Fix:** either build a clay-plugged tap hole into the furnace guide, or reword the smelt
step to breach the arch plug low, standing to the side. The two guides must describe the
same furnace.

### MAJOR — `metal/smelt-copper.md`

No carbon monoxide warning. Its sibling `smelt-iron` makes CO its first warning ("never
lean over the top breathing the fumes") for the same furnace and the same chemistry. This
guide sends the reader to charge from the top every few minutes for two to four hours, and
its How-it-works even names CO admiringly without flagging it as poison. The only air note
is "outdoor air" in You need — which does not help a reader whose face is over the flue.
Worse, its arsenic warning teaches reliance on smell, and CO has none.

**Fix:** copy the sibling's bullet. Outdoors, upwind, never lean over the top, headache or
dizziness means back off now.

### MAJOR — `keeping-animals/butter-and-cheese.md`

Soft raw-milk cheese, soured 1–2 days, eaten within a week, with smell as the only test —
and no vulnerable-group warning, though `milk-an-animal.md` carries one and even lists
cheese-making as a *safe alternative* to boiling. Fresh soft raw-milk cheese is the classic
Listeria vehicle; Listeria tolerates the acid and grows at the exact cool storage the guide
prescribes, and none of these germs sour, smell, or look wrong. Listeriosis in pregnancy
causes stillbirth.

**Fix:** carry the milk guide's warning here — for the pregnant, young, sick, elderly, make
it from milk boiled first (then soured with live yogurt, which the guide already explains).
Say that smell is not a test for these germs, and that hard aged cheese is safer than fresh.

---

## Contested — your call

**`first-tools/stone-tools.md`** makes eye protection optional ("if you have any… if you
have none, turn your face slightly away"), while its own Watch out calls flying chips "the
real injury of knapping."

One verifier called this a major safety fault: buy the glasses. The other refuted it, and
I think the refuter is right. `stone-tools` has `needs: []` — it is a root of the entire
tool tree. Requiring a purchasable item there breaks the book's founding premise ("when you
have nothing, the most dangerous thing you can do is the wrong thing first"), and "X if you
have it" is a corpus-wide idiom — the same shape appears in `forge-basics` and even in
`ash-lye` for blinding caustic. No guide anywhere assumes a shop exists. Accepting the fix
here logically means rewriting the whole book.

But the disagreement surfaced something true: **the book quietly serves two readers** — the
curious one at a kitchen table, and the one in trouble tonight. "If you have it" is how it
serves both at once. That is a good design and it is currently implicit. My suggestion is a
wording nudge, not a rule change: *"If you are not in an emergency, get glasses before you
start."* It strengthens the kitchen-table path without deleting the zero-resource one.

---

## The two missing rungs

The gaps are not random — they share a shape. The ladder is strongest at the bottom (first
night, fire, water) and thins exactly where it claims to be going: the generational
village. The top of the ladder is **asserted rather than built**.

- **Childbirth and newborn care** — `plant-a-village` spans a generation and
  `teach-children` assumes a next one, yet nothing teaches helping a human birth. The gap
  is loud because `animal-health` covers helping *animal* births. Clean hands, a boiled
  knife for the cord, keeping mother and baby warm, first feeding, and the danger signs
  that mean go now. Fits `staying-well`, needs `keep-clean`, `boil-water`,
  `when-to-get-help`.
- **Dig and shore a well** — the whole water chain rests on surface water, which is shared
  with animals and fails in drought. `common-works` already names the well as the flagship
  shared project; no guide teaches it. And it is genuinely un-improvisable knowledge:
  shoring against collapse, bad air at the bottom, lining, covering, a windlass to lift.
  Fits `moving-things`, and should become a prerequisite of `common-works`.

Valuable, next tier: a pest-proof **granary** (the whole winter currently hangs on one
clause — "store it dry away from mice"; pre-modern losses to rats and weevils ran a third
of the harvest, which is famine); **soil fertility and rotation** (a grain field cropped
the same way exhausts in a few seasons — the village starves slowly in year five);
**brewing** (`make-vinegar` silently depends on a ferment nothing teaches — another seam);
**coppicing** (lime, brick, charcoal and iron all eat wood; a village that smelts strips
its forest and the whole fire branch dies); **care for the dead**; **irrigation**.

---

## Smaller things, worth a sweep — done (`ab875e1`)

- `ash-lye` gives 15 minutes for an alkali eye flush; `make-soap` says 20–30 and
  `burn-lime` says 20. The guide making the strongest caustic gives the shortest minimum.
  Standard is 30+. Pick one number, use it everywhere.
- `make-soap` describes how to do the tongue test on possibly-caustic soap. Cut the how-to;
  keep the finger test.
- `melt-glass` — hours with faces near a hard-driven charcoal furnace, no CO warning.
- `fever-and-belly-care` — no "keep breastfeeding a sick baby, more often not less" line.
  It is a WHO core message, and infants are who dehydration kills fastest.
- `keep-chickens` — bird flu never named; the red flag (sudden die-off of several birds,
  not one hunching bird) is not taught.
- Puncture-wound guides (`leather-goods` awl, `build-fences` stakes, the soil guides) never
  mention tetanus, which is exactly the injury they produce.
- `bloomery-furnace` — no CO line, and the "simple roof" wording could put a test-fire in a
  lean-to.
- `spark-fire` — dried chaga catches sparks raw; that is why it is called true tinder
  fungus. Charring it is not the traditional requirement.
- `make-iron-tools` — the only guide of 132 with no "How it works". House rule breach, and
  it skips the idea that makes the projects transferable (hot iron flows and heals rather
  than being cut away).
- `catch-fish` needs `weave-basket` (step 5 is an explicit weaving project);
  `make-bellows` needs `bone-tools` for the awl it calls for.

---

## The layer under it

No criticals. The live site is byte-for-byte identical to a fresh build of HEAD — nothing
stale. XSS clean: margin notes never touch HTML, every dynamic value is escaped, no secrets
committed. English fallback verified by experiment.

Two real weaknesses, both **abuse economics** rather than correctness:

- The margin's giant-body gate trusts `Content-Length` (a chunked request skips it) and
  buffers the whole body before checking size. `text.length` counts UTF-16 units, so a
  4-byte-character body is 4× the stated cap.
- `GET /margin` walks up to 5 KV list pages per anonymous request, uncached, uncapped. On
  the free tier a trivial loop exhausts the daily quota in minutes, after which the margin
  503s until reset. The static book is unaffected — but the one door where it *receives*
  closes. Cache the counts (they change slowly) or keep a counter key.

Minor: the per-IP 20/day cap is soft (read-modify-write race + eventual consistency), though
total spam stays bounded by the 200-notes-per-slug shelf. `dist/_headers` is written but
Pages ignores it in `_worker.js` mode — dead weight that will mislead someone.
`guide/.wrangler/` local miniflare state is committed (harmless test notes; gitignore it).
`marked` passes raw HTML through — no risk today since content is first-party, but the
documented "true notes are folded into the book" workflow is exactly how that becomes stored
XSS. Make the escaping mechanical before the first fold.

And: **`guide/evidence.json` is an empty `{}`** while the honesty-label chips are live on
the pages. The mechanism ships; the evidence does not.

---

## What was fixed

Same day, after the reading. All six landed in **en, zh, yue and es** — fixing English
alone would have left three languages weaker than the book, which by this project's own
law is a critical defect, and would have been the seam bug all over again.

- **smoke-food** — salt is now mandatory, not "if you have it". The heat target moved off
  "comfortably warm" (blood heat, where germs thrive) to barely-warm. The done-test now
  demands dry to the centre, checked by tearing the thickest piece open. A new section,
  "No salt? Smoke it hot", gives the salt-less reader a safe path: cook it through, eat it
  in days. Botulism is named, and the Watch out says plainly that your senses cannot catch
  it. How it works was rebuilt around the three hurdles — salt, drying, smoke — so the
  reader can see *why* removing one is fatal rather than merely being told.
  - `needs` gained **make-salt**, in tree.json and in all four front-matters. If the craft
    truly requires salt, the tree has to say so — otherwise the page quietly assumes
    something the reader was never taught, which is the one thing this book promises never
    to do. No cycle: make-salt sits at cook-in-pots.
  - The summary changed too, in tree.json *and* the markdown — they are two copies of one
    fact and the build reads both (page from markdown, API and search from tree.json).
- **make-soap** — now demands the caustic grade by both tests (floats the egg AND silent
  in vinegar), names plain ash lye as the weak potash it is, and points the greasy-soap
  remedy at the lime upgrade instead of at more of the lye that just failed. Each
  language reuses its own ash-lye.md's exact established vocabulary for the two grades and
  the vinegar test — using different words would have rebuilt the bug inside the
  translation.
- **treat-cuts** — "every speck" is now bounded: loose grit comes out, anything large,
  deep or stuck fast stays in, padded around and bandaged without pressure. Stated twice,
  in Steps and in Watch out, because it is the instinctive wrong move.
- **smelt-iron** — step 5 now taps through the clay plugging the front arch, which is the
  furnace the prerequisite actually builds, and re-plugs after. The two guides describe
  one furnace again.
- **smelt-copper** — carbon monoxide is now its first Watch out, matching its sibling, with
  charging named as the moment of danger and headache/dizziness as the signal to walk. How
  it works now closes the loop: the gas that strips the ore strips your blood the same way.
- **butter-and-cheese** — carries the milk guide's boil-first warning for the pregnant,
  young, old and sick; says outright that listeria neither sours nor smells and can kill an
  unborn baby; and How it works no longer implies souring excludes everything — it is
  competition, not killing.

Verified after: 0 dangling needs, 0 cycles, 528/528 files, front-matter `needs` matches
tree.json in all four languages, heading structure identical across languages per file,
build clean.

One thing worth recording, because it is the same lesson from the inside: the English
botulism warning first claimed that cooking cannot undo the poison. That is false — the
toxin is destroyed by thorough boiling; the spores are what survive. It was corrected to
what is actually true and still load-bearing (smoked food is eaten cold, so no cooking
step ever comes to save you) — but the correction happened *after* the translators had
already been handed the diff, and all three languages faithfully carried the false
sentence until they were caught and fixed. A seam, made the same way every seam in this
book was made: the source moved and the copy didn't. In a book whose only real asset is
being true, a frightening sentence that is wrong is still a defect.

### The second batch (`ab875e1`) — the minor seams

The eye-flush rule turned out to be worse than this review first caught: not four guides
but **five**, with four different answers, and `tan-hides` carrying no number at all. All
five now say thirty minutes in all four languages, and two of them say out loud that it is
the book's rule wherever a caustic can reach an eye. `treat-cuts` and `when-to-get-help`
now both say ten minutes, and both say go *while* someone keeps pressing.

Everything else on the list landed too: carbon monoxide for `melt-glass` and
`bloomery-furnace` (plus "a roof, never walls"), bird flu's real signal in `keep-chickens`,
tetanus at `leather-goods`' awl, the breastfeeding line in `fever-and-belly-care`, the
tongue-test how-to cut from `make-soap`, and `make-iron-tools` finally has a How it works.

Two departures from what this review recommended, both deliberate:

- **`spark-fire` was corrected further than "flagged".** Dried chaga takes a spark raw —
  that is *why* it is the true tinder fungus, and why old kits carried it. The old text
  cost the reader their best option before they own a tin. Horse-hoof fungus is the one
  that wants work, and now gets the real method (amadou).
- **`make-bellows` was left alone.** The review wanted `bone-tools` added; the guide offers
  "nails, wooden pegs, **or** awl and sinew", and the peg path needs no awl. A hard
  prerequisite would make the tree lie in the other direction. `catch-fish` → `weave-basket`
  was added: its step 5 is unambiguously a weaving project.

And one more lesson from the inside, matching the botulism one above. Three of the
translation defects the verifiers caught were not translation errors at all — they were
**my English**: "mean" pieces (archaic sense of poor), "the gas talking", "a room to move
into". The translators calqued them faithfully into nonsense. Idiom is a liability in a
book that lives in four languages; the house rule *plain words before poetry* is not only
about tone. Fixed at the source and in every copy.

---

_Written per page. Read per path. The danger lives in the joins._
