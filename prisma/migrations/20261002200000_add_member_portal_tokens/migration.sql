CREATE TABLE "MemberPortalToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionId" TEXT NOT NULL,

    CONSTRAINT "MemberPortalToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberPortalToken_tokenHash_key" ON "MemberPortalToken"("tokenHash");
CREATE INDEX "MemberPortalToken_subscriptionId_expiresAt_idx" ON "MemberPortalToken"("subscriptionId", "expiresAt");

ALTER TABLE "MemberPortalToken"
ADD CONSTRAINT "MemberPortalToken_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
