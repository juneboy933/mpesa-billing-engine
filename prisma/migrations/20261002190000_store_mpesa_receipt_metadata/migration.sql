ALTER TABLE "PaymentAttempt"
ADD COLUMN "mpesaReceiptNumber" TEXT,
ADD COLUMN "mpesaTransactionDate" TIMESTAMP(3);

CREATE UNIQUE INDEX "PaymentAttempt_mpesaReceiptNumber_key"
ON "PaymentAttempt"("mpesaReceiptNumber");
