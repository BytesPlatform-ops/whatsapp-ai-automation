-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  business_name VARCHAR(255),
  state VARCHAR(50) DEFAULT 'WELCOME',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_text TEXT,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  message_type VARCHAR(20) DEFAULT 'text',
  whatsapp_message_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website audits table
CREATE TABLE IF NOT EXISTS website_audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  raw_data JSONB DEFAULT '{}',
  analysis_text TEXT,
  report_pdf_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated sites table
CREATE TABLE IF NOT EXISTS generated_sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  template_id VARCHAR(50),
  site_data JSONB DEFAULT '{}',
  preview_url TEXT,
  status VARCHAR(20) DEFAULT 'collecting',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge chunks table (for RAG)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  source_doc VARCHAR(255),
  category VARCHAR(100),
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audits_user ON website_audits(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_user ON generated_sites(user_id);

-- Vector similarity search index (IVFFlat for performance)
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to users
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Apply trigger to generated_sites
CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON generated_sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
