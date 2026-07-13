import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  AvailabilityQuerySchema,
  CreateAppointmentSchema,
  ProfessionalServicesInputSchema,
  WorkingHoursSchema,
} from "@nexos/shared";

import { JwtService } from "../src/auth/jwt/jwt.service";

async function main() {
const uuid = randomUUID();

assert.equal(
  CreateAppointmentSchema.safeParse({
    professionalId: uuid,
    serviceId: randomUUID(),
    startsAt: "2030-01-01T12:00:00-03:00",
    client: { name: "x".repeat(121), phone: "+5511999999999" },
  }).success,
  false,
);

assert.equal(
  AvailabilityQuerySchema.safeParse({
    serviceId: uuid,
    from: "2000-01-01",
    to: "2999-12-31",
  }).success,
  false,
);

assert.equal(
  WorkingHoursSchema.safeParse({
    shifts: Array.from({ length: 51 }, () => ({ weekday: 1, startTime: "09:00", endTime: "10:00" })),
  }).success,
  false,
);

assert.equal(
  ProfessionalServicesInputSchema.safeParse({
    serviceIds: Array.from({ length: 201 }, () => randomUUID()),
  }).success,
  false,
);

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_ISSUER = "nexos-booking-test";
process.env.JWT_AUDIENCE = "nexos-api-test";
process.env.JWT_SECRET = "short";
await assert.rejects(
  () => new JwtService().signAccess({ sub: uuid, sid: randomUUID() }),
  /at least 32 characters/u,
);
process.env.JWT_SECRET = "test-jwt-secret-with-at-least-32-characters";
assert.equal(typeof (await new JwtService().signAccess({ sub: uuid, sid: randomUUID() })), "string");
if (previousSecret === undefined) delete process.env.JWT_SECRET;
else process.env.JWT_SECRET = previousSecret;

console.log("Security contracts: PASS");
}

void main();
