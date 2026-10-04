-- Farming news digest: store every fetched article once, and record which
-- farm has already received each story so advisories never repeat themselves.
CREATE TABLE "news_articles" (
    "id" SERIAL NOT NULL,
    "link_hash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'kenya',
    "risk" TEXT,
    "published_at" TIMESTAMP(3),
    "first_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_articles_link_hash_key" ON "news_articles"("link_hash");
CREATE INDEX "news_articles_region_first_sent_at_idx" ON "news_articles"("region", "first_sent_at");

CREATE TABLE "news_article_sends" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_article_sends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_article_sends_article_id_farm_id_key" ON "news_article_sends"("article_id", "farm_id");
CREATE INDEX "news_article_sends_farm_id_sent_at_idx" ON "news_article_sends"("farm_id", "sent_at");

ALTER TABLE "news_article_sends" ADD CONSTRAINT "news_article_sends_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "news_article_sends" ADD CONSTRAINT "news_article_sends_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
