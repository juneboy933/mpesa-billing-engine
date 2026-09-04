-- DropIndex
DROP INDEX "Subscription_customerPhone_key";

-- AlterTable
ALTER TABLE "PaymentAttempt" ALTER COLUMN "checkoutId" DROP NOT NULL;
