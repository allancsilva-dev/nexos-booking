import { z } from "zod";
import { isCivilDate } from "../civil-date.js";
import { AVAILABILITY_MAX_RANGE_DAYS } from "../limits.js";

const civilDateString = z.string().refine(isCivilDate, {
  message: "Expected YYYY-MM-DD",
});

export const AvailabilityQuerySchema = z
  .object({
    date: civilDateString.optional(),
    from: civilDateString.optional(),
    to: civilDateString.optional(),
    serviceId: z.string().uuid(),
  })
  .superRefine((value, ctx) => {
    const hasDate = value.date !== undefined;
    const hasFrom = value.from !== undefined;
    const hasTo = value.to !== undefined;

    if (hasDate && (hasFrom || hasTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "date is mutually exclusive with from/to",
        path: ["date"],
      });
    }

    if (!hasDate && !hasFrom && !hasTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "date or from/to is required",
        path: ["date"],
      });
    }

    if (hasFrom !== hasTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from and to must be provided together",
        path: [hasFrom ? "to" : "from"],
      });
    }

    if (hasFrom && hasTo && value.from! >= value.to!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from must be before to",
        path: ["from"],
      });
    }

    // Teto de janela: impede DoS por range gigante (BUG-029). `from`/`to` são
    // datas civis YYYY-MM-DD → Date.parse devolve meia-noite UTC, diff confiável.
    if (hasFrom && hasTo && value.from! < value.to!) {
      const spanDays =
        (Date.parse(value.to!) - Date.parse(value.from!)) / 86_400_000;
      if (spanDays > AVAILABILITY_MAX_RANGE_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `from..to range exceeds ${AVAILABILITY_MAX_RANGE_DAYS} days`,
          path: ["to"],
        });
      }
    }
  });

export const AvailabilitySlotSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

export const AvailabilityDaySchema = z.object({
  date: civilDateString,
  slots: z.array(AvailabilitySlotSchema),
});

/** Volatile projection (ADR-013). Slots NOT guaranteed — POST INSERT is source of truth. */
export const AvailabilityResponseSchema = z.object({
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  timezone: z.string(),
  // Effective slot step used for this query. May differ from organizations.slotIntervalMin.
  slotIntervalMin: z.number().int().min(1),
  days: z.array(AvailabilityDaySchema),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;
export type AvailabilityDay = z.infer<typeof AvailabilityDaySchema>;
