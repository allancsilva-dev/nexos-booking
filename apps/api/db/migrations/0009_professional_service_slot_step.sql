ALTER TABLE professional_services
ADD COLUMN slot_step_min integer;

ALTER TABLE professional_services
ADD CONSTRAINT professional_services_slot_step_min_check
CHECK (
  slot_step_min IS NULL
  OR (
    slot_step_min >= 5
    AND slot_step_min <= 240
    AND slot_step_min % 5 = 0
  )
);
