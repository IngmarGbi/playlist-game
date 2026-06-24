-- Run this in your Supabase SQL editor

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null default 'lobby', -- lobby | adding | playing | results
  current_song_index int not null default 0,
  created_at timestamptz default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  name text not null,
  score int not null default 0,
  created_at timestamptz default now()
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  spotify_track_id text not null,
  title text not null,
  artist text not null,
  cover_url text,
  position int not null,
  created_at timestamptz default now()
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  song_id uuid references songs(id) on delete cascade,
  voter_id uuid references players(id) on delete cascade,
  voted_for_player_id uuid references players(id) on delete cascade,
  created_at timestamptz default now(),
  unique(song_id, voter_id)
);

-- Enable realtime on all tables
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table songs;
alter publication supabase_realtime add table votes;

-- Disable RLS for simplicity (personal use, no sensitive data)
alter table rooms disable row level security;
alter table players disable row level security;
alter table songs disable row level security;
alter table votes disable row level security;
