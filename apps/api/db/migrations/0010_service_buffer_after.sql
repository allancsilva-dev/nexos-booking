ALTER TABLE services
ADD COLUMN buffer_after_min integer;

ALTER TABLE services
ADD CONSTRAINT services_buffer_after_min_check
CHECK (
  buffer_after_min IS NULL
  OR (
    buffer_after_min >= 0
    AND buffer_after_min <= 120
    AND buffer_after_min % 5 = 0
  )
);

ALTER TABLE appointments
ADD COLUMN occupied_until timestamptz;

UPDATE appointments
SET occupied_until = ends_at
WHERE occupied_until IS NULL;

ALTER TABLE appointments
ALTER COLUMN occupied_until SET NOT NULL;

ALTER TABLE appointments
DROP CONSTRAINT no_overlap;

ALTER TABLE appointments
ADD CONSTRAINT no_overlap
EXCLUDE USING gist (
  organization_id WITH =,
  professional_id WITH =,
  tstzrange(starts_at, occupied_until, '[)') WITH &&
)
WHERE (status IN ('SCHEDULED', 'CONFIRMED'));
