# Playlist Game — Setup Guide

## 1. Spotify Developer App

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app (name it anything, e.g. "Playlist Game")
3. Note your **Client ID** and **Client Secret**
4. In the app settings, add `http://localhost:3000` as a Redirect URI (not strictly needed but good practice)

> The app uses **Client Credentials** flow — your Spotify credentials are only used server-side for searching tracks. Players never see them.

## 2. Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account + project
2. In the dashboard, go to **SQL Editor** and run the contents of `supabase-schema.sql`
3. Go to **Settings > API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. Fill in `.env.local`

Edit the `.env.local` file at the root of this project:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id
NEXTAUTH_URL=http://localhost:3000
```

## 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5. Play the game

1. **Host** opens the app on their laptop/TV, clicks **Create a room**
2. A 4-letter room code appears — share it with all players
3. **Players** open the app on their phones, type the code and their name
4. Host clicks **Start — everyone adds their song**
5. Each player searches Spotify and picks one song (secretly)
6. Once everyone has added their song, host clicks **Start playing**
7. Songs play one by one — players vote on who added each song
8. After all votes are in, host clicks **Reveal** to show who added it
9. Scores are tallied and shown at the end

## Deploying to Vercel (free)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com), import the repo
3. Add all the `.env.local` variables in Vercel's Environment Variables settings
4. Change `NEXTAUTH_URL` to your Vercel URL (e.g. `https://playlist-game.vercel.app`)
5. Deploy — share the URL instead of localhost

> Note: music **playback** is not built-in (Spotify's Web Playback SDK requires Premium + OAuth login). The host plays music through their normal Spotify app — the game just manages who added what and the voting. This is intentional: it's simpler and works with any Spotify account.
