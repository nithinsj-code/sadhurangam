-- Users table to extend Supabase Auth
create table if not exists public.users (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text not null,
  avatar_initials text,
  wins integer default 0,
  losses integer default 0,
  draws integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Function to handle new user profile creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, username, display_name, avatar_initials)
  values (
    new.id, 
    new.raw_user_meta_data->>'username', 
    new.raw_user_meta_data->>'display_name',
    upper(substring(new.raw_user_meta_data->>'display_name' from 1 for 2))
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call function on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Friendships table
create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.users(id) on delete cascade not null,
  receiver_id uuid references public.users(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(sender_id, receiver_id)
);

-- Rooms table
create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  white_player_id uuid references public.users(id),
  black_player_id uuid references public.users(id),
  fen text default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  turn text default 'white',
  white_time_remaining integer, -- in seconds
  black_time_remaining integer, -- in seconds
  time_control_minutes integer,
  captured_white text[] default '{}',
  captured_black text[] default '{}',
  status text check (status in ('waiting', 'active', 'finished')) default 'waiting',
  winner_id uuid references public.users(id),
  draw_offered_by uuid references public.users(id),
  rematch_offered_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Challenges table
create table if not exists public.challenges (
  id uuid default gen_random_uuid() primary key,
  challenger_id uuid references public.users(id) on delete cascade not null,
  opponent_id uuid references public.users(id) on delete cascade not null,
  room_id uuid references public.rooms(id) on delete set null,
  time_control integer not null, -- in minutes
  status text check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Moves table
create table if not exists public.moves (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  player_id uuid references public.users(id),
  move_san text not null,
  fen_after text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security (RLS)

-- Users
alter table public.users enable row level security;
drop policy if exists "Users can view all profiles" on public.users;
drop policy if exists "Users can insert their own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;
create policy "Users can view all profiles" on public.users for select using (true);
create policy "Users can insert their own profile" on public.users for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

-- Friendships
alter table public.friendships enable row level security;
drop policy if exists "Users can view their friendships" on public.friendships;
drop policy if exists "Users can create friend requests" on public.friendships;
drop policy if exists "Users can update their friendships" on public.friendships;
create policy "Users can view their friendships" on public.friendships for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users can create friend requests" on public.friendships for insert with check (auth.uid() = sender_id);
create policy "Users can update their friendships" on public.friendships for update using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Rooms
alter table public.rooms enable row level security;
drop policy if exists "Rooms are viewable by everyone" on public.rooms;
drop policy if exists "Authenticated users can create rooms" on public.rooms;
drop policy if exists "Players can update their rooms" on public.rooms;
create policy "Rooms are viewable by everyone" on public.rooms for select using (true);
create policy "Authenticated users can create rooms" on public.rooms for insert with check (auth.role() = 'authenticated');
create policy "Players can update their rooms" on public.rooms for update using (auth.uid() = white_player_id or auth.uid() = black_player_id or status = 'waiting');

-- Challenges
alter table public.challenges enable row level security;
drop policy if exists "Users can view their challenges" on public.challenges;
drop policy if exists "Users can create challenges" on public.challenges;
drop policy if exists "Users can update their challenges" on public.challenges;
create policy "Users can view their challenges" on public.challenges for select using (auth.uid() = challenger_id or auth.uid() = opponent_id);
create policy "Users can create challenges" on public.challenges for insert with check (auth.uid() = challenger_id);
create policy "Users can update their challenges" on public.challenges for update using (auth.uid() = challenger_id or auth.uid() = opponent_id);

-- Moves
alter table public.moves enable row level security;
drop policy if exists "Moves are viewable by everyone" on public.moves;
drop policy if exists "Players can insert moves" on public.moves;
create policy "Moves are viewable by everyone" on public.moves for select using (true);
create policy "Players can insert moves" on public.moves for insert with check (
  exists (
    select 1 from public.rooms 
    where rooms.id = moves.room_id 
    and (rooms.white_player_id = auth.uid() or rooms.black_player_id = auth.uid())
    and rooms.status = 'active'
  )
);
