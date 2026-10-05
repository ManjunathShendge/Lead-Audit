-- Target audience entered by the team (null = let the analysis infer it) and the
-- audience-alignment analysis of the collected posts (null until generated).
ALTER TABLE "Audit" ADD COLUMN "targetAudience" JSONB;
ALTER TABLE "Audit" ADD COLUMN "alignment" JSONB;
