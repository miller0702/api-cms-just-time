-- Script para consolidar sesiones duplicadas por IP/dispositivo/navegador
-- Ejecutar en Supabase SQL Editor o psql

-- PASO 1: Primero actualiza las sesiones que se van a mantener
WITH sessions_to_keep AS (
  SELECT DISTINCT ON (ip, device, browser)
    id as keep_id,
    ip,
    device,
    browser
  FROM cms.visitor_sessions
  WHERE ip IS NOT NULL
  ORDER BY ip, device, browser, started_at ASC
),
aggregated_data AS (
  SELECT 
    sk.keep_id,
    SUM(vs.page_views) as total_page_views,
    MIN(vs.started_at) as first_started_at,
    MAX(vs.last_seen_at) as last_last_seen_at
  FROM sessions_to_keep sk
  JOIN cms.visitor_sessions vs 
    ON vs.ip = sk.ip 
    AND COALESCE(vs.device, '') = COALESCE(sk.device, '')
    AND COALESCE(vs.browser, '') = COALESCE(sk.browser, '')
  GROUP BY sk.keep_id
)
UPDATE cms.visitor_sessions vs
SET 
  page_views = ad.total_page_views,
  started_at = ad.first_started_at,
  last_seen_at = ad.last_last_seen_at
FROM aggregated_data ad
WHERE vs.id = ad.keep_id;
