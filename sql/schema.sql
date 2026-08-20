-- Run this in Supabase SQL Editor before deploying.

create table if not exists questions (
  id                    bigserial primary key,
  category              text not null,
  user_id               bigint not null,
  username              text,
  first_name            text,
  text_content          text,
  final_text            text,                 -- the exact channel post text, admin-editable (emojis, wording, etc.); falls back to an auto-generated version when null
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
  user_id             bigint primary key,
  state               text not null,      -- 'awaiting_question' | 'awaiting_edit'
  category            text,               -- set when state = 'awaiting_question'
  question_id         bigint,             -- set when state = 'awaiting_edit'
  prompt_message_id   bigint,             -- the "please send your question" message, so we can delete it once they answer
  updated_at          timestamptz not null default now()
);

-- If you already ran this schema before adding prompt_message_id, this line
-- safely adds the new column without touching your existing data.
alter table user_sessions add column if not exists prompt_message_id bigint;

-- If you already ran this schema before adding final_text, this line safely
-- adds the new column without touching your existing data.
alter table questions add column if not exists final_text text;

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
