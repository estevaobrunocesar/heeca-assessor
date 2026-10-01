-- Login now happens by e-mail instead of WhatsApp phone (phone stays as the
-- WhatsApp sender-identification key, untouched). Backfill the two known
-- production users by phone, and give any other existing user (e.g. a
-- fresh/local database) a unique placeholder so the column can be made
-- NOT NULL + UNIQUE without guessing a real address for them.

-- The "email" column already exists (nullable) from the initial migration.
UPDATE "User" SET "email" = 'estevaobrunocesar@gmail.com' WHERE "whatsappPhone" = '+5511991469251';
UPDATE "User" SET "email" = 'mariliaizabele@gmail.com' WHERE "whatsappPhone" = '+5511971244487';
UPDATE "User" SET "email" = 'user-' || "id" || '@placeholder.local' WHERE "email" IS NULL;

ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
