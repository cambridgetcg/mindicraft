# What a warning must carry

This is an offline reviewer aid for one historical seam, not a translation
checker or safety approval. It quotes existing passages without rewriting them.
English is a comparison reference, not factual authority. Four languages can
agree on a source mistake.

From the repository root:

```sh
node test/warnings-across-languages.mjs
node test/warnings-across-languages.mjs --json
node --test test/warnings-across-languages.test.mjs
npm --prefix guide run verify
```

The script reads only eight fixed source files, resolves them relative to itself,
and prints to stdout. It uses Node built-ins, no network, clock, model, external
service, dependency installation, or file writes. There is no write option.
The existing test glob includes its software tests in `verify` and CI. The live
test checks report fidelity (returned source spans and digests); selection
coverage and quantity signals are diagnostic only. Rewording or moving a
selected passage, or changing its quantities, does not require a selector or
test update to pass. The site builder does not consume the report.
Exit 0 means a report was produced, even with differences or unresolved selectors;
it never means safe. Missing or unparsed source files and invalid CLI arguments
exit 1. A read failure also exits 1 with a relative-path error.

## The pilot and its provenance

Selected on **2026-10-21** from [guide/REVIEW.md](../guide/REVIEW.md), reviewed
2026-07-16. That document identifies the `treat-cuts` / `when-to-get-help`
discrepancy; commit `72acae8` records its reconciliation on 2026-07-16. The last
document follow-up is commit `912ac7d` on 2026-07-17 and concerns other work.
Both commit dates come from git, not dated follow-up headings in the document.
The document also records a source error faithfully
copied into translations. These are historical repository observations, not
current clinical evidence.

The pilot reads `guide/content/{en,zh,yue,es}/staying-well/{treat-cuts,when-to-get-help}.md`.
Its four roles are the pressure passage, referral warning, bleeding trigger,
and onward-care step. The latter two belong to a different guide: the relevant
condition and action do not occupy a single bullet there. Parent list lines
are printed as context; they are not included in quantity comparison. The full
files remain necessary reading, including exceptions outside these selections.

At selection time on repository base `27aba53b3`, all 16 excerpts were located,
and their extracted duration candidates had no numerical difference. This is
not a review of the duration's correctness or the warning's meaning. **Bilingual
review of the selections, wording and synthetic fixtures is pending. Subject
review is pending. External factual evidence is to re-observe.** No external
medical source was fetched or endorsed for this software prototype.

The existing builder's frontmatter reader in `guide/build.mjs` was inspected.
It is private to a module that runs the build on import, so the aid uses a small
line-preserving scanner instead of importing it. The build and its review pins
are unchanged.

## Reading and recording a review

The text and JSON reports group each role across English, Simplified Chinese,
Cantonese and Spanish. They retain relative source paths, physical line ranges,
original text, parent lines, and SHA-256 of each entire source file. Digests
identify the edition; they grant no approval. A moved or duplicated anchor is
reported as missing or ambiguous, with no English fallback or guessed match.

Mechanical signals cover differing heading levels or list layout, differing
quantity multisets, and supported time units with unparsed numbers. Quantity
comparison spans languages and the three related duration roles, so a change
shared by all translations of only one guide remains visible. There is no
hard-coded correct duration. Empty extraction is explicitly labelled.

Each report leaves separate questions pending for:

- English paired with each other language: selection/context, conditions,
  prohibitions, required actions and concurrency, quantities and qualifiers.
- Subject review across all four languages: whether the source claim itself
  is supported in the stated context, with dated authoritative evidence.

For a human review record, retain the source digests and question IDs, then
record findings and dated evidence in the normal reviewed change discussion.
Rerun after edits: the script does not store, import, or carry forward approval.
Do not mark a question resolved just because no signal appeared. Any later
content correction needs its own safety and four-language review.

## Deliberate limits and examples

The scanner recognizes the book's ATX headings and space-indented Markdown
lists, skips frontmatter and fenced examples, and keeps wrapped list items.
It is not a general Markdown parser: HTML, blockquotes, tables, setext headings,
tabs and other layouts need manual review or explicit future support. It
compares heading levels and list markers/indentation, not heading meanings.
Anchors are curated prefixes scoped to exact headings, not semantic alignment.

Quantity extraction is deliberately limited to minutes, seconds and hours in
the four languages; Arabic/fullwidth digits with a decimal point or comma;
`ten`, `fifteen`, `thirty`, `diez`, `quince`, `treinta`; and Chinese numerals
through 99. English `full`/`complete` between number and unit is tolerated.
Other units, word-number forms, compound numbers, ranges, fractions, typography
and quantities split across physical lines can be missed or misread. Some known
compound/range/alternative contexts (including English `or`, Spanish `o`/`u`,
and Chinese `或`) are flagged as unparsed. A comma is treated as a decimal
separator; ambiguous three-digit separators and values beyond 15 digits are
unparsed rather than guessed or rounded. Columns are
JavaScript UTF-16 offsets, not visual screen columns. Always inspect raw text.
No unit conversion, negation, urgency, minimum/maximum, scope or factual check
is attempted. Equal multisets can conceal different attachment or order.

[The fixtures](fixtures/warnings-across-languages.json) use synthetic paper-card
rules, never altered medical instructions. Tests demonstrate:

| Deliberate change | Mechanical result | Reviewer lesson |
|---|---|---|
| One translation changes a number or unit | Difference | Inspect the source and translation; neither wins automatically. |
| All languages of just one related guide change | Difference | Review joins between guides as well as translations. |
| Equivalent duration written in another unit | Difference | False positive: conversions need human interpretation. |
| Heading level changes without changing the instruction | Structure difference | False positive: layout is not meaning. |
| Unsupported number before a recognized unit | Unparsed, comparison incomplete | A coverage gap is not agreement. |
| Condition or prohibition removed, or concurrent action made sequential | No signal | False negatives: numbers and structure cannot carry the warning. |
| Every language and both guides share a number contrary to the fixture's stipulated rule | No signal | False negative: agreement cannot establish factual correctness. |

These are demonstrations, not measured accuracy rates. The live pilot test
reports selection coverage without requiring all anchors to match or fixing
quantity counts, units or values. It verifies returned source spans and digests,
not clinical correctness. After a reviewed content edit, rerun the CLI and
review any missing or ambiguous selectors to restore useful coverage; selectors
remain exact heading-scoped prefixes, with no guessed matches. To add a seam,
deliberately review its anchors, context, quantity
grouping and fixtures; do not automatically crawl or rewrite the book.

## Publication and build boundaries

Review added files and any saved report for public-repository privacy before
sharing: use relative repository paths, public source evidence and no personal
details, credentials, private notes or machine identifiers. The CLI emits no
absolute paths or environment metadata. Do not commit an unreviewed report as
new care guidance.

The existing wildfire review expired on **2026-09-03**. On 2026-10-21 the normal
`verify` command is expected to stop at that build brake after the tests. This
tool cannot unblock it. A real safety review and deliberate re-pin belong to
a separate change; do not bump the date, fake the clock or bypass the brake.
