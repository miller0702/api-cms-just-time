-- PASO 2: Eliminar las sesiones duplicadas (ejecutar DESPUÉS del paso 1)

WITH sessions_to_keep AS (
  SELECT DISTINCT ON (ip, device, browser)
    id as keep_id
  FROM cms.visitor_sessions
  WHERE ip IS NOT NULL
  ORDER BY ip, device, browser, started_at ASC
)
DELETE FROM cms.visitor_sessions
WHERE ip IS NOT NULL
  AND id NOT IN (SELECT keep_id FROM sessions_to_keep);
