-- Run this in Supabase SQL Editor before deploying.

create table if not exists questions (
  id                    bigserial primary key,
  category              text not null,
  user_id               bigint not null,
  username              text,
  first_name            text,
  text_content          text,
  attachment_type       text,                 -- 'photo' | 'document' | 'voice' | null
  file_id               text,
  status                text not null default 'pending', -- 'pending' | 'published' | 'rejected'
  admin_message_id      bigint,               -- the review-card message in the admin chat (for editing later)
  published_message_id  bigint,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists questions_status_idx on questions (status);
create index if not exists questions_category_idx on questions (category);

-- Tracks what a user (student OR admin) is currently doing, since serverless
-- functions have no memory between requests.
create table if not exists user_sessions (
  user_id      bigint primary key,
  state        text not null,      -- 'awaiting_question' | 'awaiting_edit'
  category     text,               -- set when state = 'awaiting_question'
  question_id  bigint,             -- set when state = 'awaiting_edit'
  updated_at   timestamptz not null default now()
);

-- Keep updated_at fresh automatically.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists questions_set_updated_at on questions;
create trigger questions_set_updated_at
before update on questions
for each row execute procedure set_updated_at();
