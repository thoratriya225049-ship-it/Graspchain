-- Add optional password hash and salt for user self-registration
ALTER TABLE students ADD COLUMN passwordHash TEXT;
ALTER TABLE students ADD COLUMN passwordSalt TEXT;
