-- Drop legacy teacher/student role columns after code stopped reading/writing them.
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
ALTER TABLE "User" DROP COLUMN IF EXISTS "roles";
