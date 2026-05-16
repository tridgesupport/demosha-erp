-- Migration 006: indent revision support
ALTER TABLE purchase_indents
  ADD COLUMN IF NOT EXISTS revision_number  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_indent_id UUID REFERENCES purchase_indents(indent_id);
