-- 0003_advanced_constraints
-- CHECK de intervalo, CHECK semânticos, EXCLUDE, FKs compostas tenant-safe, uniques parciais.
-- Pré-requisito: tabelas e chaves candidatas UNIQUE (organization_id, id) da 0002.

-- ═══════════════════════════════════════════════════════════════════
-- 1. FKs COMPOSTAS TENANT-SAFE (substituem as FKs simples da 0002)
-- ═══════════════════════════════════════════════════════════════════

-- appointments: professional_id, service_id, client_id
ALTER TABLE appointments
  DROP CONSTRAINT appointments_professional_id_professionals_id_fk;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_professional_fk
  FOREIGN KEY (organization_id, professional_id)
  REFERENCES professionals (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE appointments
  DROP CONSTRAINT appointments_service_id_services_id_fk;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_service_fk
  FOREIGN KEY (organization_id, service_id)
  REFERENCES services (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE appointments
  DROP CONSTRAINT appointments_client_id_clients_id_fk;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_client_fk
  FOREIGN KEY (organization_id, client_id)
  REFERENCES clients (organization_id, id) ON DELETE RESTRICT;

-- professional_services: professional_id, service_id
ALTER TABLE professional_services
  DROP CONSTRAINT professional_services_professional_id_professionals_id_fk;
ALTER TABLE professional_services
  ADD CONSTRAINT professional_services_professional_fk
  FOREIGN KEY (organization_id, professional_id)
  REFERENCES professionals (organization_id, id) ON DELETE CASCADE;

ALTER TABLE professional_services
  DROP CONSTRAINT professional_services_service_id_services_id_fk;
ALTER TABLE professional_services
  ADD CONSTRAINT professional_services_service_fk
  FOREIGN KEY (organization_id, service_id)
  REFERENCES services (organization_id, id) ON DELETE CASCADE;

-- working_hours: professional_id
ALTER TABLE working_hours
  DROP CONSTRAINT working_hours_professional_id_professionals_id_fk;
ALTER TABLE working_hours
  ADD CONSTRAINT working_hours_professional_fk
  FOREIGN KEY (organization_id, professional_id)
  REFERENCES professionals (organization_id, id) ON DELETE CASCADE;

-- availability_blocks: professional_id
ALTER TABLE availability_blocks
  DROP CONSTRAINT availability_blocks_professional_id_professionals_id_fk;
ALTER TABLE availability_blocks
  ADD CONSTRAINT availability_blocks_professional_fk
  FOREIGN KEY (organization_id, professional_id)
  REFERENCES professionals (organization_id, id) ON DELETE CASCADE;

-- appointment_events: appointment_id
ALTER TABLE appointment_events
  DROP CONSTRAINT appointment_events_appointment_id_appointments_id_fk;
ALTER TABLE appointment_events
  ADD CONSTRAINT appointment_events_appointment_fk
  FOREIGN KEY (organization_id, appointment_id)
  REFERENCES appointments (organization_id, id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- 2. CHECK DE INTERVALO
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE appointments
  ADD CONSTRAINT chk_interval CHECK (ends_at > starts_at);

ALTER TABLE working_hours
  ADD CONSTRAINT chk_shift_interval CHECK (end_time > start_time);

ALTER TABLE availability_blocks
  ADD CONSTRAINT chk_block_interval CHECK (ends_at > starts_at);

-- ═══════════════════════════════════════════════════════════════════
-- 3. CHECK SEMÂNTICOS
-- ═══════════════════════════════════════════════════════════════════

-- cancelado ⇔ tem quem cancelou
ALTER TABLE appointments
  ADD CONSTRAINT chk_cancelled_by
  CHECK ((status = 'CANCELLED') = (cancelled_by_type IS NOT NULL));

-- hash e expiração do token de cancelamento andam juntos
ALTER TABLE appointments
  ADD CONSTRAINT chk_cancel_token_pair
  CHECK ((public_cancel_token_hash IS NULL) = (public_cancel_token_expires_at IS NULL));

-- STAFF ⇔ tem actor_user_id; CLIENT/SYSTEM ⇔ sem
ALTER TABLE appointment_events
  ADD CONSTRAINT chk_actor_user
  CHECK ((actor_type = 'STAFF') = (actor_user_id IS NOT NULL));

-- ═══════════════════════════════════════════════════════════════════
-- 4. EXCLUDE (anti-sobreposição)
-- ═══════════════════════════════════════════════════════════════════

-- no_overlap: sem sobreposição de horário ativo para o mesmo profissional
ALTER TABLE appointments
  ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    organization_id WITH =,
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'CONFIRMED'));

-- no_shift_overlap: turnos do mesmo profissional/dia não se sobrepõem
ALTER TABLE working_hours
  ADD CONSTRAINT no_shift_overlap
  EXCLUDE USING gist (
    professional_id WITH =,
    weekday WITH =,
    timerange(start_time, end_time, '[)') WITH &&
  );

-- ═══════════════════════════════════════════════════════════════════
-- 5. UNIQUES PARCIAIS
-- ═══════════════════════════════════════════════════════════════════

-- token de cancelamento é credencial única (quando existir)
CREATE UNIQUE INDEX appointments_cancel_token_uk
  ON appointments (public_cancel_token_hash)
  WHERE public_cancel_token_hash IS NOT NULL;

-- telefone não duplica cliente dentro da empresa (ADR-016: NULLABLE para anonimização)
CREATE UNIQUE INDEX clients_org_phone_uk
  ON clients (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

-- um user_id mapeia para no máximo um professional por empresa (B1)
CREATE UNIQUE INDEX professionals_org_user_uk
  ON professionals (organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- no máximo um convite pendente por e-mail por empresa (reenvio substitui)
CREATE UNIQUE INDEX invitations_org_email_pending_uk
  ON invitations (organization_id, lower(email))
  WHERE accepted_at IS NULL;
