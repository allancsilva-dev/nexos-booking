-- 0008: Service snapshot in appointments
-- PROP-E1 ratificada — preserva dados do serviço no momento da reserva

ALTER TABLE appointments ADD COLUMN service_name_snapshot text;
ALTER TABLE appointments ADD COLUMN service_duration_min_snapshot integer;
ALTER TABLE appointments ADD COLUMN service_price_cents_snapshot integer;
ALTER TABLE appointments ADD COLUMN service_currency_snapshot char(3) DEFAULT 'BRL';

UPDATE appointments a SET
  service_name_snapshot = s.name,
  service_duration_min_snapshot = s.duration_min,
  service_price_cents_snapshot = s.price_cents,
  service_currency_snapshot = COALESCE(s.currency, 'BRL')
FROM services s
WHERE a.service_id = s.id
  AND a.organization_id = s.organization_id;

ALTER TABLE appointments ALTER COLUMN service_name_snapshot SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN service_duration_min_snapshot SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN service_price_cents_snapshot SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN service_currency_snapshot SET NOT NULL;
