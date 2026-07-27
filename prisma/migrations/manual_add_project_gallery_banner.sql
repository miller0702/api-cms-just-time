-- Agregar banner, galería y brochure a proyectos

ALTER TABLE cms.sale_projects
ADD COLUMN IF NOT EXISTS banner_media_id UUID,
ADD COLUMN IF NOT EXISTS gallery JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS brochure_url VARCHAR(500);

-- Índice para el banner
CREATE INDEX IF NOT EXISTS sale_projects_banner_media_id_idx ON cms.sale_projects(banner_media_id);
