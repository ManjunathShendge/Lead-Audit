-- Website audit and Google Business Profile targets confirmed for an audit (null on older audits).
ALTER TABLE "Audit" ADD COLUMN "channels" JSONB;
