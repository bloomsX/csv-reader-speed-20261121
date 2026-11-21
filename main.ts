// The program the harness runs: reads every case from /input/cases.json,
// answers each with run, and writes /output/answers.json.
// V8's incremental marking is turned off first, as the house baseline's
// driver does: the answers are chains of joined strings, and marking them
// a step at a time costs wall time under the sandbox.

import { setFlagsFromString } from 'node:v8';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { run } from './solve.js';

setFlagsFromString('--no-incremental-marking');

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(`${INPUT_DIR}/cases.json`, 'utf8'));
const answers = cases.map((c) => run(c.input));
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(`${OUTPUT_DIR}/answers.json`, JSON.stringify(answers));
