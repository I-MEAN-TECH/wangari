-- Refile two livestock purchases that the expense form forced into Animal Feed.
--
-- The finances page offered no "Livestock purchase" category, so two real
-- purchases — KES 1,020,000 for a dairy herd and KES 175,000 for a layer pen,
-- both described as "Livestock purchase: ..." — were filed under
-- `animal_feed`. That put KES 1,195,000 of capital into the feed bucket,
-- which the feed-allocation pool then spread across every flock, making
-- cost-per-unit nonsense (dairy at thousands of shillings per litre against a
-- market near KES 70).
--
-- The taxonomy (server/src/lib/ledger-taxonomy.ts) already maps
-- `livestock_purchase` → stock; this only makes the stored rows match their
-- own descriptions. Amounts and enterprises do not move — only category and
-- bucket — so the M1 conservation invariant (sum of costs equals sum of
-- expense rows) still holds, and the form fix that accompanies this prevents
-- recurrence.
--
-- Idempotent: after the first run the rows no longer match the WHERE clause.

UPDATE transactions
SET category = 'livestock_purchase',
    cost_bucket = 'stock'
WHERE type = 'expense'
  AND category = 'animal_feed'
  AND cost_bucket = 'feed'
  AND description ILIKE 'Livestock purchase%';
