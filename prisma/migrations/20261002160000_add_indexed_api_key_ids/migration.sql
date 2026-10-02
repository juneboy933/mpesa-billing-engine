ALTER TABLE "Merchant" ADD COLUMN "apiKeyId" TEXT;

CREATE UNIQUE INDEX "Merchant_apiKeyId_key" ON "Merchant"("apiKeyId");
