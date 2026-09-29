-- The email a person uses in Slack when it differs from their account email (lib/slack.ts looks them up by it).
-- NULL = use the account email. Additive only; no existing row is rewritten.
ALTER TABLE "user" ADD COLUMN slack_email TEXT;
