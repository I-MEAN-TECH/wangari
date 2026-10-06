-- Remember which campaign link brought each feedback response.
--
-- GAP 1 (reach) ranks above every feature on the roadmap: 9 users, and no way
-- to tell whether that is because the product is wrong or because nobody was
-- told. Those have opposite fixes. This column is what separates them — the
-- shareable link carries ?utm_source=&utm_medium=&utm_campaign= and the admin
-- summary groups by it, so a booth QR, a WhatsApp message and the marketing
-- site become three countable things instead of one anonymous number.
--
-- Nullable on purpose: most farmers arrive by typing the link. Aggregation
-- labels those `direct` rather than filing them as broken, because a farmer
-- who typed the URL by hand is the respondent we most want to hear from.
--
-- Additive and idempotent; cannot lose a row.

ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "utm" TEXT;