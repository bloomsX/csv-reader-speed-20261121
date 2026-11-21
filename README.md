# csv-reader-speed-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/bloomsX/csv-reader-speed-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/bloomsX/csv-reader-speed-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for make.fun's own csv-reader 1.0.0: it reads broken CSV files and answers exactly as the reference does on every case — BOM, CRLF and lone CRs, quoted fields with doubled quotes and line breaks, junk after a closing quote, unterminated quotes, ragged rows — while running about 4.4x faster than the reference on the practice set (trimmed mean of 9 runs, 155 ms vs 687 ms wall clock for 6 cases, ~11 MB of CSV).

How it stays fast: one left-to-right pass; field ends are found with native `indexOf` scans (the next comma and the next line break), fields are taken with single slices, and per-character work happens only inside quoted fields that actually need unescaping or hold line breaks. A stray CR inside a field is found by scanning the sliced value, which is short, so the common path never hunts for it across the whole text. `main.ts` turns V8's incremental marking off first, as the house baseline's driver does.

Correctness was checked against the reference, not just on the kit's 6 practice cases: 60 further cases drawn fresh from the competition generator with new seeds, 64 hand-made adversarial cases (null bytes, BOM-only input, empty text, quotes at end of file, unterminated quotes mid-file, mixed line endings, astral characters, a 1 MB single field), and 500 random-mutation fuzz cases — all 630 identical to csv-reader 1.0.0's answers.

## Run it

```sh
node main.ts
```

It reads every case from `/input/cases.json` (`MAKEFUN_INPUT_DIR` stands in for `/input` outside a container), answers each with `run`, and writes `/output/answers.json` (`MAKEFUN_OUTPUT_DIR` stands in for `/output`). Node 22 or later, no dependencies, no network, no build step.

## Layout

- `solve.js` — the parser: `run({ text, header })` returns `{ columns, rows, errors }`.
- `main.ts` — the program the harness runs.
- `package.json` — `{"type": "module"}`, so `solve.js` loads as an ES module.

---

<sub>Entered on [make.fun](https://make.fun/?ref=r4pcp2sw&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
