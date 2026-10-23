-- Jalankan di Supabase Dashboard > SQL Editor.
create table if not exists public.nexvora_conversations (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  title text not null default 'Chat baru',
  model text not null default 'openai/gpt-oss-20b',
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.nexvora_conversations enable row level security;
revoke all on public.nexvora_conversations from anon;
grant select, insert, update, delete on public.nexvora_conversations to authenticated;

drop policy if exists "Users can read own Nexvora conversations" on public.nexvora_conversations;
create policy "Users can read own Nexvora conversations"
  on public.nexvora_conversations for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own Nexvora conversations" on public.nexvora_conversations;
create policy "Users can insert own Nexvora conversations"
  on public.nexvora_conversations for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own Nexvora conversations" on public.nexvora_conversations;
create policy "Users can update own Nexvora conversations"
  on public.nexvora_conversations for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own Nexvora conversations" on public.nexvora_conversations;
create policy "Users can delete own Nexvora conversations"
  on public.nexvora_conversations for delete to authenticated using (auth.uid() = user_id);
