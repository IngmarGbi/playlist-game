declare global {
  interface Window {
    Spotify: {
      Player: new (options: SpotifyPlayerInit) => SpotifyPlayer
    }
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

interface SpotifyPlayerInit {
  name: string
  getOAuthToken: (cb: (token: string) => void) => void
  volume?: number
}

interface SpotifyPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: 'ready', cb: (state: { device_id: string }) => void): void
  addListener(event: 'not_ready', cb: (state: { device_id: string }) => void): void
  addListener(event: 'player_state_changed', cb: (state: SpotifyPlaybackState | null) => void): void
  addListener(event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error', cb: (e: { message: string }) => void): void
  removeListener(event: string): void
  getCurrentState(): Promise<SpotifyPlaybackState | null>
  pause(): Promise<void>
  resume(): Promise<void>
  togglePlay(): Promise<void>
}

interface SpotifyPlaybackState {
  paused: boolean
  position: number
  duration: number
  track_window: {
    current_track: {
      id: string
      name: string
      duration_ms: number
    }
  }
}

export {}
