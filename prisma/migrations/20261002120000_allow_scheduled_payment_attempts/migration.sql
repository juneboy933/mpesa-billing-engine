-- Payment attempts are persisted before the Daraja request so concurrent calls
-- can be deduplicated. The checkout ID is only available after Daraja accepts it.
ALTER TABLE "PaymentAttempt" ALTER COLUMN "checkoutId" DROP NOT NULL;

CREATE TABLE "DarajaCallback" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "DarajaCallback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DarajaCallback_checkoutId_key" ON "DarajaCallback"("checkoutId");
CREATE INDEX "DarajaCallback_processedAt_receivedAt_idx" ON "DarajaCallback"("processedAt", "receivedAt");
