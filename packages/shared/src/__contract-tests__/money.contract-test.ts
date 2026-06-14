/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Contrato compile-time: dinheiro em centavos (API_CONTRACTS.md §12).
 *
 * Garante o shape `{ amountCents, currency }` e que centavos são inteiros (número).
 */
import { money, type Money } from "../money.js";
import type { Equal, Expect } from "./type-utils.js";

/** O shape do contrato é exatamente inteiro-em-centavos + moeda. */
type _AssertShape = Expect<
  Equal<Money, { amountCents: number; currency: string }>
>;

/** `money()` retorna um `Money`. */
type _AssertFactoryReturn = Expect<Equal<ReturnType<typeof money>, Money>>;

/** Constrói com moeda default (BRL) e com moeda explícita. */
const _default: Money = money(1500);
const _explicit: Money = money(1500, "USD");

/** `amountCents` é numérico (inteiro em runtime, validado por `money()`). */
const _cents: number = _default.amountCents;

// @ts-expect-error `amountCents` não aceita string (centavos são inteiro numérico).
const _badCents: Money = { amountCents: "1500", currency: "BRL" };

// @ts-expect-error `amountCents` é obrigatório no contrato monetário.
const _missingCents: Money = { currency: "BRL" };
