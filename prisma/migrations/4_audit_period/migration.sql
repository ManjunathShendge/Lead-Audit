-- Calendar months the social metrics cover (null = the default recent window).
ALTER TABLE "Audit" ADD COLUMN "period" JSONB;
