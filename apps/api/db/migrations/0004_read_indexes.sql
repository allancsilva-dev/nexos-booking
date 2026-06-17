-- 0004_read_indexes
-- Índices de leitura (btree parciais) para performance operacional.

-- ═══════════════════════════════════════════════════════════════════
-- 1. SLOTS/AGENDA ATIVOS — endpoint mais quente: agenda + disponibilidade
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX appointments_active_slots_idx
  ON appointments (organization_id, professional_id, starts_at)
  WHERE status IN ('SCHEDULED', 'CONFIRMED');

-- ═══════════════════════════════════════════════════════════════════
-- 2. VISÃO DIÁRIA DA EMPRESA E BUSCA POR CLIENTE
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX appointments_org_starts_idx
  ON appointments (organization_id, starts_at);

CREATE INDEX appointments_client_idx
  ON appointments (client_id);

-- ═══════════════════════════════════════════════════════════════════
-- 3. OUTBOX PENDENTE — varredura do relay
--    Dead-letter (publish_failed_at IS NOT NULL) sai do índice.
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX appointment_events_unpublished_idx
  ON appointment_events (created_at)
  WHERE published_at IS NULL AND publish_failed_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 4. SESSÕES ATIVAS — revogação (logout / troca de senha / DISABLED)
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX refresh_sessions_active_idx
  ON refresh_sessions (user_id)
  WHERE revoked_at IS NULL;
