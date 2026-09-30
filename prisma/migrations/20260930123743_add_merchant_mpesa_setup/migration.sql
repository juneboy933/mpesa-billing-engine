-- CreateEnum
CREATE TYPE "MpesaSetupStatus" AS ENUM ('PENDING', 'COMPLETED');

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "mpesaConsumerKeyEncrypted" TEXT,
ADD COLUMN     "mpesaConsumerSecretEncrypted" TEXT,
ADD COLUMN     "mpesaPasskeyEncrypted" TEXT,
ADD COLUMN     "mpesaSetupCompletedAt" TIMESTAMP(3),
ADD COLUMN     "mpesaSetupStatus" "MpesaSetupStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "mpesaShortcode" TEXT;
