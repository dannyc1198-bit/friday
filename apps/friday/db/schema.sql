-- Friday brain state (Postgres >= 14)
-- Run: psql $DATABASE_URL -f apps/friday/db/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Conversation memory (one row per turn)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(20) NOT NULL,            -- 'user' | 'friday'
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);

-- Monitor snapshots (one row per monitor, upserted on each poll)
CREATE TABLE IF NOT EXISTS monitor_snapshots (
    monitor_name VARCHAR(50) PRIMARY KEY,
    data JSONB NOT NULL,
    summary TEXT,                         -- 1-sentence voice-ready summary
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sub-agent task log
CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name VARCHAR(50) NOT NULL,      -- 'ripple' | 'forge' | 'scout'
    task TEXT NOT NULL,
    result TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'running' | 'done' | 'failed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_name, created_at DESC);

-- Friday's persistent KV memory (preferences, accountability state, drift markers)
CREATE TABLE IF NOT EXISTS friday_memory (
    key VARCHAR(200) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drift signals — feeds the "go dark > 36h = check-in" behavior from the soul prompt.
-- Brain writes 'last_contact' on every voice query. A scheduled job reads
-- 'commitment_made' rows and flags overdue ones to the proactive-monitor service.
CREATE TABLE IF NOT EXISTS drift_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type VARCHAR(50) NOT NULL,     -- 'last_contact' | 'commitment_made' | 'commitment_due'
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drift_type_time ON drift_signals(signal_type, occurred_at DESC);
