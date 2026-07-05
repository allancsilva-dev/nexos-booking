interface ResolveEffectiveSlotStepInput {
  professionalServiceSlotStepMin: number | null | undefined;
  serviceDurationMin: number | null | undefined;
  organizationSlotIntervalMin: number | null | undefined;
}

function isPositiveInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function resolveEffectiveSlotStepMin(
  input: ResolveEffectiveSlotStepInput,
): number {
  const {
    professionalServiceSlotStepMin,
    serviceDurationMin,
    organizationSlotIntervalMin,
  } = input;

  if (professionalServiceSlotStepMin != null) {
    if (
      !Number.isInteger(professionalServiceSlotStepMin) ||
      professionalServiceSlotStepMin < 5 ||
      professionalServiceSlotStepMin > 240 ||
      professionalServiceSlotStepMin % 5 !== 0
    ) {
      throw new Error("Invalid professional_services.slot_step_min configuration");
    }
    return professionalServiceSlotStepMin;
  }

  if (isPositiveInteger(serviceDurationMin)) {
    return serviceDurationMin;
  }

  if (isPositiveInteger(organizationSlotIntervalMin)) {
    return organizationSlotIntervalMin;
  }

  throw new Error("Unable to resolve effective slot step");
}
