export type RoomStatus = 'lobby' | 'adding' | 'playing' | 'results'

export interface Room {
  id: string
  code: string
  status: RoomStatus
  current_song_index: number
  created_at: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  score: number
  created_at: string
}

export interface Song {
  id: string
  room_id: string
  player_id: string
  spotify_track_id: string
  title: string
  artist: string
  cover_url: string | null
  position: number
  created_at: string
}

export interface Vote {
  id: string
  room_id: string
  song_id: string
  voter_id: string
  voted_for_player_id: string
  created_at: string
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: { name: string }[]
  album: { images: { url: string }[] }
  uri: string
  duration_ms: number
}
