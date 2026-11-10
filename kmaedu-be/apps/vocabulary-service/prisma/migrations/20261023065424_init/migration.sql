-- CreateTable
CREATE TABLE "r2_delete_tasks" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "r2_delete_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordFamilyCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordFamilyCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordFamily" (
    "id" TEXT NOT NULL,
    "rootWord" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSavedWordFamily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordFamilyId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSavedWordFamily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "r2_delete_tasks_next_attempt_at_idx" ON "r2_delete_tasks"("next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "WordFamilyCategory_name_key" ON "WordFamilyCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WordFamilyCategory_slug_key" ON "WordFamilyCategory"("slug");

-- CreateIndex
CREATE INDEX "WordFamilyCategory_isActive_order_idx" ON "WordFamilyCategory"("isActive", "order");

-- CreateIndex
CREATE INDEX "WordFamily_categorySlug_idx" ON "WordFamily"("categorySlug");

-- CreateIndex
CREATE INDEX "WordFamily_categoryId_idx" ON "WordFamily"("categoryId");

-- CreateIndex
CREATE INDEX "WordFamily_rootWord_idx" ON "WordFamily"("rootWord");

-- CreateIndex
CREATE UNIQUE INDEX "WordFamily_rootWord_categorySlug_key" ON "WordFamily"("rootWord", "categorySlug");

-- CreateIndex
CREATE INDEX "UserSavedWordFamily_userId_idx" ON "UserSavedWordFamily"("userId");

-- CreateIndex
CREATE INDEX "UserSavedWordFamily_wordFamilyId_idx" ON "UserSavedWordFamily"("wordFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSavedWordFamily_userId_wordFamilyId_key" ON "UserSavedWordFamily"("userId", "wordFamilyId");

-- AddForeignKey
ALTER TABLE "WordFamily" ADD CONSTRAINT "WordFamily_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WordFamilyCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedWordFamily" ADD CONSTRAINT "UserSavedWordFamily_wordFamilyId_fkey" FOREIGN KEY ("wordFamilyId") REFERENCES "WordFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

