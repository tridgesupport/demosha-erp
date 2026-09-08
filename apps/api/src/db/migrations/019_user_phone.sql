-- Adds a phone number to users, so the admin "Add User" form can capture it
-- alongside name/email/role.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
