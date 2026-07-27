-- Script para consolidar sesiones duplicadas por IP/dispositivo/navegador
-- Ejecutar manualmente: psql $DATABASE_URL -f prisma/migrations/manual_consolidate_sessions.sql

-- 1. Crear tabla temporal con sesiones consolidadas
CREATE TEMP TABLE consolidated_sessions AS
SELECT 
  -- Mantener el ID de la sesión más antigua (primera visita)
  MIN(id) as keep_id,
  ip,
  device,
  browser,
  -- Datos de la primera visita
  MIN(landing_page) as landing_page,
  MIN(referrer) as referrer,
  MIN(visitor_id) as visitor_id,
  MIN(user_agent) as user_agent,
  MIN(country) as country,
  MIN(city) as city,
  MIN(os) as os,
  -- Agregaciones
  SUM(page_views) as total_page_views,
  MIN(started_at) as first_started_at,
  MAX(last_seen_at) as last_last_seen_at,
  -- IDs a eliminar
  ARRAY_AGG(id) FILTER (WHERE id != MIN(id)) as ids_to_delete
FROM cms.visitor_sessions
WHERE ip IS NOT NULL
GROUP BY ip, device, browser
HAVING COUNT(*) > 1;

-- 2. Actualizar las sesiones que se mantienen con los valores consolidados
UPDATE cms.visitor_sessions vs
SET 
  page_views = cs.total_page_views,
  started_at = cs.first_started_at,
  last_seen_at = cs.last_last_seen_at
FROM consolidated_sessions cs
WHERE vs.id = cs.keep_id;

-- 3. Eliminar las sesiones duplicadas
DELETE FROM cms.visitor_sessions
WHERE id IN (
  SELECT UNNEST(ids_to_delete) FROM consolidated_sessions
);

-- 4. Mostrar resumen
SELECT 
  'Sesiones consolidadas: ' || COUNT(*) as resultado
FROM consolidated_sessions;

-- Limpiar
DROP TABLE consolidated_sessions;
