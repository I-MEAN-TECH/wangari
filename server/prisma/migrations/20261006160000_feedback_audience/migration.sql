-- Gate the public feedback link by who is answering.
--
-- The public link shipped without a way to tell a farmer from a passer-by. A
-- MiroFish simulation then did what a real investor would do: filled in the
-- farmer form and rated it 1/5. The number an investor takes from an open link
-- is how many people answered, so an unclassified respondent inflates the one
-- thing this project refuses to inflate.
--
-- Nullable on purpose. in_app responses come from a signed-in farmer and booth
-- rows are typed in by our own staff; neither is asked, and pre-gate rows have
-- no value. Aggregation files those under 'unspecified' rather than dropping
-- them, so the denominator never silently shrinks.
--
-- Additive and idempotent: no column is dropped or retyped, so this cannot
-- lose a row.

ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "audience" TEXT;