import assert from "node:assert/strict";

import { IdempotencyKeyState } from "../lib/idempotency-key";

const state = new IdempotencyKeyState();
const first = state.get();
assert.equal(state.get(), first, "technical retry must reuse logical submission key");
state.reset();
const second = state.get();
assert.notEqual(second, first, "new logical submission must rotate key");
assert.match(first, /^[0-9a-f-]{36}$/u);
console.log("Stable idempotency key: PASS");
