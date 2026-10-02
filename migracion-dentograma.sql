-- =========================================================================
-- DentalManager — Migración: Dentograma 3D
-- Reemplaza el registro simple de caries (tabla dental_records) por el
-- dentograma 3D completo, guardado de forma compacta en patients.dental_map.
-- Pega esto en Supabase → SQL Editor → New query → Run.
-- =========================================================================

-- 1) Nueva columna compacta en patients para guardar el dentograma completo
--    (estado de cada diente, notas y datos generales de la valoración).
--    Es un solo jsonb pequeño por paciente: no se crea una tabla nueva.
alter table patients add column if not exists dental_map jsonb;

-- 2) Ya no se usa el registro simple de caries por diente: se reemplaza por
--    el dentograma. Si prefieres conservar el historial, comenta esta línea.
drop table if exists dental_records;

-- -------------------------------------------------------------------
-- Verificación rápida
-- -------------------------------------------------------------------
-- select id, full_name, dental_map from patients where dental_map is not null;
