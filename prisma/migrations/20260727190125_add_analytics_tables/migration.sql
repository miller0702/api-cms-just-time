-- CreateTable
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "user_agent" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "session_id" TEXT,
    "visitor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "label" TEXT,
    "value" INTEGER,
    "path" TEXT,
    "ip" TEXT,
    "session_id" TEXT,
    "visitor_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_sessions" (
    "id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "landing_page" TEXT,
    "referrer" TEXT,
    "page_views" INTEGER NOT NULL DEFAULT 1,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_views_path_idx" ON "page_views"("path");

-- CreateIndex
CREATE INDEX "page_views_created_at_idx" ON "page_views"("created_at");

-- CreateIndex
CREATE INDEX "page_views_session_id_idx" ON "page_views"("session_id");

-- CreateIndex
CREATE INDEX "page_views_visitor_id_idx" ON "page_views"("visitor_id");

-- CreateIndex
CREATE INDEX "page_views_ip_idx" ON "page_views"("ip");

-- CreateIndex
CREATE INDEX "analytics_events_name_idx" ON "analytics_events"("name");

-- CreateIndex
CREATE INDEX "analytics_events_category_idx" ON "analytics_events"("category");

-- CreateIndex
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events"("created_at");

-- CreateIndex
CREATE INDEX "analytics_events_session_id_idx" ON "analytics_events"("session_id");

-- CreateIndex
CREATE INDEX "visitor_sessions_visitor_id_idx" ON "visitor_sessions"("visitor_id");

-- CreateIndex
CREATE INDEX "visitor_sessions_ip_idx" ON "visitor_sessions"("ip");

-- CreateIndex
CREATE INDEX "visitor_sessions_started_at_idx" ON "visitor_sessions"("started_at");
