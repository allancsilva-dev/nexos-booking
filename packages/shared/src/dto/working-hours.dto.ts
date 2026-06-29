import { z } from "zod";
import { WORKING_HOURS_MAX_SHIFTS } from "../limits.js";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const ShiftSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(timeRegex, "Invalid time format. Expected HH:mm"),
  endTime: z.string().regex(timeRegex, "Invalid time format. Expected HH:mm"),
}).refine(
  (s) => s.startTime < s.endTime,
  { message: "startTime must be before endTime", path: ["startTime"] },
);

export const WorkingHoursSchema = z.object({
  shifts: z.array(ShiftSchema).max(WORKING_HOURS_MAX_SHIFTS),
});

export type ShiftDTO = z.infer<typeof ShiftSchema>;
export type WorkingHoursInput = z.infer<typeof WorkingHoursSchema>;
