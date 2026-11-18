-- run this once in the Supabase SQL editor
create table public.polymarket_orders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    team_id text,
    mode text not null,
    exchange_order_id text,
    market_slug text not null,
    outcome text not null,
    quantity numeric not null,
    limit_price numeric not null,
    filled_quantity numeric not null default 0,
    avg_fill_price numeric,
    status text not null check (status in ('open', 'partial', 'filled', 'canceled', 'expired', 'rejected')),
    expires_at timestamptz not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index polymarket_orders_user_status on public.polymarket_orders (user_id, status);

create table public.portfolio_snapshots (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    mode text not null,
    cash numeric not null,
    positions_value numeric not null,
    total numeric not null,
    taken_at timestamptz not null default now()
);

create index portfolio_snapshots_user_time on public.portfolio_snapshots (user_id, taken_at);

-- no policies on purpose: only the backend's secret key can reach these tables
alter table public.polymarket_orders enable row level security;
alter table public.portfolio_snapshots enable row level security;
