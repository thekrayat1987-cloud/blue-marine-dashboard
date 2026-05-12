-- Blue Marine — Track Meta push state on ad_planner_history
-- Run after 004. Adds columns to record which plans were pushed to Meta as drafts.

alter table public.ad_planner_history
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id text,
  add column if not exists meta_ad_ids text[],
  add column if not exists meta_pushed_at timestamptz;
