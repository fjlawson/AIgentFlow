-- run this once in the Supabase SQL editor
create table public.api_keys (
    user_id uuid not null references auth.users (id) on delete cascade,
    provider text not null,
    encrypted_key text not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, provider)
);

-- no policies on purpose: only the backend's secret key can reach this table
alter table public.api_keys enable row level security;
