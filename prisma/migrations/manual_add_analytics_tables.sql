-- Analytics tables migration
-- Run this SQL in your PostgreSQL database

-- Page Views table
CREATE TABLE IF NOT EXISTS cms.page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path VARCHAR(500) NOT NULL,
    referrer VARCHAR(1000),
    user_agent TEXT,
    ip VARCHAR(45),
    country VARCHAR(100),
    city VARCHAR(100),
    device VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    session_id VARCHAR(100),
    visitor_id VARCHAR(100),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_page_views_path ON cms.page_views(path);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON cms.page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON cms.page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor_id ON cms.page_views(visitor_id);
CREATE INDEX IF NOT EXISTS idx_page_views_ip ON cms.page_views(ip);

-- Analytics Events table
CREATE TABLE IF NOT EXISTS cms.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    label VARCHAR(200),
    value INTEGER,
    path VARCHAR(500),
    ip VARCHAR(45),
    session_id VARCHAR(100),
    visitor_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON cms.analytics_events(name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_category ON cms.analytics_events(category);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON cms.analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON cms.analytics_events(session_id);

-- Visitor Sessions table
CREATE TABLE IF NOT EXISTS cms.visitor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id VARCHAR(100) NOT NULL,
    ip VARCHAR(45),
    user_agent TEXT,
    country VARCHAR(100),
    city VARCHAR(100),
    device VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    landing_page VARCHAR(500),
    referrer VARCHAR(1000),
    page_views INTEGER NOT NULL DEFAULT 1,
    duration INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor_id ON cms.visitor_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_ip ON cms.visitor_sessions(ip);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_started_at ON cms.visitor_sessions(started_at);
