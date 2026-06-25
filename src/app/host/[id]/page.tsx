'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Room, Player, Song, Vote, SpotifyTrack } from '@/types'

type HostStep = 'name' | 'lobby' | 'adding' | 'playing' | 'results'

export default function HostPage() {
  const { id } = useParams<{ id: string }>()

  // Game state
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [songs, setSongs] = useState<Song[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [showReveal, setShowReveal] = useState(false)

  // Host as player
  const [me, setMe] = useState<Player | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)

  // Song search
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([])
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrack | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // UI
  const [step, setStep] = useState<HostStep>('name')
  const [nameInput, setNameInput] = useState('')

  // Spotify
  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null)
  const [spotifyUser, setSpotifyUser] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/spotify/token').then(r => r.json()).then(data => {
      setSpotifyConnected(data.connected)
      if (data.connected) setSpotifyUser(data.display_name)
    })
  }, [])

  // Load Spotify Web Playback SDK when connected
  useEffect(() => {
    if (!spotifyConnected) return

    function initPlayer() {
      fetch('/api/spotify/token').then(r => r.json()).then(({ access_token }) => {
        if (!access_token) return

        const player = new window.Spotify.Player({
          name: 'Playlist Game',
          getOAuthToken: cb => {
            fetch('/api/spotify/token').then(r => r.json()).then(d => cb(d.access_token))
          },
          volume: 0.8,
        })

        player.addListener('ready', ({ device_id }) => setDeviceId(device_id))
        player.addListener('player_state_changed', state => {
          if (!state) return
          setIsPlaying(!state.paused)
          setPosition(state.position)
          setDuration(state.duration)
        })

        player.connect()
        playerRef.current = player
      })
    }

    if (window.Spotify) {
      initPlayer()
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer
      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      document.body.appendChild(script)
    }

    return () => { playerRef.current?.disconnect() }
  }, [spotifyConnected])

  // Auto-play when song changes
  useEffect(() => {
    const song = songs[currentSongIndex]
    if (!deviceId || !song || room?.status !== 'playing') return
    async function play() {
      const { access_token } = await fetch('/api/spotify/token').then(r => r.json())
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [`spotify:track:${song.spotify_track_id}`] }),
      })
    }
    play()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSongIndex, deviceId, room?.status])

  // Progress bar ticker
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!isPlaying) return
    intervalRef.current = setInterval(() => setPosition(p => p + 1000), 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isPlaying])

  useEffect(() => {
    if (!id) return

    supabase.from('rooms').select('*').eq('id', id).single().then(({ data }) => {
      if (data) { setRoom(data); setCurrentSongIndex(data.current_song_index) }
    })

    supabase.from('players').select('*').eq('room_id', id).order('created_at').then(({ data }) => {
      if (data) setPlayers(data)
    })

    const roomSub = supabase.channel(`room-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${id}` },
        ({ new: r }) => { setRoom(r as Room); setCurrentSongIndex((r as Room).current_song_index) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${id}` },
        ({ new: p }) => setPlayers(prev => [...prev, p as Player]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${id}` },
        ({ new: p }) => setPlayers(prev => prev.map(pl => pl.id === (p as Player).id ? p as Player : pl)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'songs', filter: `room_id=eq.${id}` },
        ({ new: s }) => setSongs(prev => [...prev, s as Song]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${id}` },
        ({ new: v }) => setVotes(prev => {
          const filtered = prev.filter(x => !(x.song_id === (v as Vote).song_id && x.voter_id === (v as Vote).voter_id))
          return [...filtered, v as Vote]
        }))
      .subscribe()

    return () => { supabase.removeChannel(roomSub) }
  }, [id])

  // Sync step from room status (after host has joined as player)
  useEffect(() => {
    if (!room || !me) return
    if (room.status === 'adding') {
      const myCount = songs.filter(s => s.player_id === me.id).length
      setStep(myCount >= (room.songs_per_player ?? 1) ? 'playing' : 'adding')
    }
    if (room.status === 'playing') {
      supabase.from('songs').select('*').eq('room_id', room.id).order('position').then(({ data }) => {
        const sorted = data ?? []
        setSongs(sorted)
        setMyVote(null)
        setRevealed(false)
        setShowReveal(false)
        setStep('playing')
      })
    }
    if (room.status === 'results') setStep('results')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.current_song_index])

  const updateRoom = useCallback(async (body: object) => {
    await fetch(`/api/rooms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }, [id])

  async function broadcastReveal() {
    await supabase.channel(`player-room-${id}`).send({
      type: 'broadcast',
      event: 'reveal',
      payload: {},
    })
  }

  async function joinAsPlayer() {
    if (!nameInput.trim() || !room) return
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: room.id, name: nameInput.trim() }),
    })
    const player = await res.json()
    setMe(player)
    setStep('lobby')
  }

  async function search(q: string) {
    setQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSearchResults(data.tracks ?? [])
    }, 400)
  }

  async function submitSong() {
    if (!selectedTrack || !room || !me) return
    setSubmitting(true)
    await fetch('/api/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: room.id,
        player_id: me.id,
        spotify_track_id: selectedTrack.id,
        title: selectedTrack.name,
        artist: selectedTrack.artists.map((a: { name: string }) => a.name).join(', '),
        cover_url: selectedTrack.album.images[0]?.url ?? null,
      }),
    })
    setSelectedTrack(null)
    setQuery('')
    setSearchResults([])
    setSubmitting(false)
  }

  async function castVote(playerIdGuess: string) {
    if (!room || !me || !currentSong || myVote) return
    setMyVote(playerIdGuess)
    await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: room.id,
        song_id: currentSong.id,
        voter_id: me.id,
        voted_for_player_id: playerIdGuess,
      }),
    })
  }

  async function startAdding() {
    await updateRoom({ status: 'adding' })
  }

  async function markDone() {
    if (!me) return
    await fetch(`/api/players/${me.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    })
    setMe(prev => prev ? { ...prev, done: true } : prev)
  }

  async function startPlaying() {
    const shuffled = [...songs].sort(() => Math.random() - 0.5)
    await Promise.all(shuffled.map((s, i) =>
      supabase.from('songs').update({ position: i }).eq('id', s.id)
    ))
    setSongs(shuffled)
    await updateRoom({ status: 'playing', current_song_index: 0 })
  }

  async function nextSong() {
    setShowReveal(false)
    const next = currentSongIndex + 1
    if (next >= songs.length) {
      await updateRoom({ status: 'results' })
    } else {
      await updateRoom({ status: 'playing', current_song_index: next })
      setCurrentSongIndex(next)
    }
  }

  if (!room) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      Loading...
    </main>
  )

  const mySongs = me ? songs.filter(s => s.player_id === me.id) : []
  const currentSong = songs[currentSongIndex]
  const currentVotes = votes.filter(v => v.song_id === currentSong?.id)
  const allVoted = currentSong
    ? players.filter(p => p.id !== currentSong.player_id).every(p => currentVotes.some(v => v.voter_id === p.id))
    : false
  const everyoneReady = players.every(p => p.done && songs.some(s => s.player_id === p.id))
  const isMyCurrentSong = me && currentSong?.player_id === me.id
  const roomUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${room.code}` : ''

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col p-6 gap-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-green-400">Host Screen</h1>
        {room.code && (
          <div className="text-right">
            <div className="text-3xl font-mono font-bold tracking-widest">{room.code}</div>
            <div className="text-xs text-gray-400 truncate max-w-48">{roomUrl}</div>
          </div>
        )}
      </div>

      {/* SPOTIFY BANNER */}
      {spotifyConnected === true && (
        <div className="bg-green-900 border border-green-600 rounded-2xl px-4 py-3 flex items-center justify-between">
          <span className="text-green-300 text-sm font-semibold">Spotify connected</span>
          <span className="text-green-400 text-sm">{spotifyUser}</span>
        </div>
      )}
      {spotifyConnected === false && (
        <a
          href={`/api/spotify/auth?roomId=${id}`}
          className="bg-gray-800 border border-gray-600 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-gray-700 transition"
        >
          <span className="text-gray-300 text-sm">Connect Spotify for audio playback</span>
          <span className="text-green-400 text-sm font-semibold">Connect →</span>
        </a>
      )}

      {/* NAME ENTRY */}
      {step === 'name' && (
        <div className="flex flex-col gap-4 mt-4">
          <h2 className="text-xl font-semibold">Enter your name to join as a player</h2>
          <input
            type="text"
            placeholder="Your name"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinAsPlayer()}
            className="w-full py-4 px-4 bg-gray-800 text-white rounded-2xl outline-none focus:ring-2 focus:ring-green-500 text-lg"
          />
          <button
            onClick={joinAsPlayer}
            disabled={!nameInput.trim()}
            className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl disabled:opacity-40"
          >
            Join & open lobby
          </button>
        </div>
      )}

      {/* LOBBY */}
      {step === 'lobby' && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-800 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-3">Players joined ({players.length})</h2>
            {players.length === 0
              ? <p className="text-gray-400">Waiting for players...</p>
              : <div className="flex flex-wrap gap-2">
                  {players.map(p => (
                    <span key={p.id} className={`px-3 py-1 rounded-full text-sm ${me && p.id === me.id ? 'bg-green-700 text-white' : 'bg-gray-700'}`}>
                      {p.name}{me && p.id === me.id ? ' (you)' : ''}
                    </span>
                  ))}
                </div>
            }
          </div>

          <button
            onClick={startAdding}
            disabled={players.length < 2}
            className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl disabled:opacity-40"
          >
            Start — everyone adds their songs
          </button>
          {players.length < 2 && <p className="text-gray-400 text-sm text-center">Need at least 2 players</p>}
        </div>
      )}

      {/* ADDING SONGS */}
      {step === 'adding' && room.status === 'adding' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Add your songs</h2>
            <span className="text-green-400 font-semibold">{mySongs.length} added</span>
          </div>

          {!(me?.done) && (
            <>
              <input
                type="text"
                placeholder="Search Spotify..."
                value={query}
                onChange={e => search(e.target.value)}
                className="w-full py-3 px-4 bg-gray-800 text-white rounded-2xl outline-none focus:ring-2 focus:ring-green-500"
              />
              {selectedTrack && (
                <div className="bg-green-900 border border-green-600 rounded-2xl p-4 flex gap-3 items-center">
                  {selectedTrack.album.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedTrack.album.images[0].url} alt="cover" className="w-14 h-14 rounded-xl" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{selectedTrack.name}</div>
                    <div className="text-sm text-gray-300 truncate">{selectedTrack.artists.map((a: { name: string }) => a.name).join(', ')}</div>
                  </div>
                  <button onClick={() => setSelectedTrack(null)} className="text-gray-400 hover:text-white text-xl">×</button>
                </div>
              )}
              {searchResults.length > 0 && !selectedTrack && (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {searchResults.map((t: SpotifyTrack) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTrack(t); setSearchResults([]) }}
                      className="bg-gray-800 hover:bg-gray-700 rounded-2xl p-3 flex gap-3 items-center text-left"
                    >
                      {t.album.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.album.images[0].url} alt="cover" className="w-12 h-12 rounded-lg" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{t.name}</div>
                        <div className="text-sm text-gray-400 truncate">{t.artists.map((a: { name: string }) => a.name).join(', ')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={submitSong}
                disabled={!selectedTrack || submitting}
                className="w-full py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-2xl disabled:opacity-40"
              >
                {submitting ? 'Adding...' : 'Add this song'}
              </button>
            </>
          )}

          {mySongs.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm text-gray-400 font-semibold">Your songs</h3>
              {mySongs.map(s => (
                <div key={s.id} className="bg-gray-800 rounded-xl p-3 flex gap-3 items-center">
                  {s.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.cover_url} alt="cover" className="w-10 h-10 rounded-lg" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate text-sm">{s.title}</div>
                    <div className="text-xs text-gray-400 truncate">{s.artist}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {mySongs.length > 0 && !me?.done && (
            <button
              onClick={markDone}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl"
            >
              I&apos;m done adding songs
            </button>
          )}

          <div className="bg-gray-800 rounded-2xl p-4">
            <h3 className="font-semibold mb-2">Player progress</h3>
            {players.map(p => {
              const count = songs.filter(s => s.player_id === p.id).length
              return (
                <div key={p.id} className="flex items-center justify-between py-1">
                  <span className="text-sm">{p.name}{me && p.id === me.id ? ' (you)' : ''}</span>
                  <span className={p.done ? 'text-green-400 text-sm' : 'text-gray-500 text-sm'}>
                    {p.done ? `✓ Done (${count})` : `${count} added...`}
                  </span>
                </div>
              )
            })}
          </div>

          <button
            onClick={startPlaying}
            disabled={!everyoneReady}
            className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl disabled:opacity-40"
          >
            Everyone&apos;s ready — start playing!
          </button>
          {!everyoneReady && (
            <p className="text-gray-400 text-sm text-center">
              Waiting for all players to finish adding songs
            </p>
          )}
        </div>
      )}

      {/* PLAYING */}
      {step === 'playing' && room.status === 'playing' && currentSong && (
        <div className="flex flex-col gap-4">
          <div className="text-center text-gray-400 text-sm">
            Song {currentSongIndex + 1} of {songs.length}
          </div>

          <div className="bg-gray-800 rounded-2xl p-5 flex gap-4 items-center">
            {currentSong.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentSong.cover_url} alt="cover" className="w-20 h-20 rounded-xl object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xl truncate">{currentSong.title}</div>
              <div className="text-gray-400 truncate">{currentSong.artist}</div>
            </div>
          </div>

          {/* Playback controls */}
          {deviceId && (
            <div className="bg-gray-800 rounded-2xl p-4 flex flex-col gap-3">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-400 h-2 rounded-full transition-all"
                  style={{ width: duration > 0 ? `${Math.min((position / duration) * 100, 100)}%` : '0%' }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{Math.floor(position / 60000)}:{String(Math.floor((position % 60000) / 1000)).padStart(2, '0')}</span>
                <button
                  onClick={() => playerRef.current?.togglePlay()}
                  className="bg-green-500 hover:bg-green-400 text-black font-bold px-6 py-2 rounded-full text-sm"
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <span>{Math.floor(duration / 60000)}:{String(Math.floor((duration % 60000) / 1000)).padStart(2, '0')}</span>
              </div>
            </div>
          )}
          {spotifyConnected && !deviceId && (
            <div className="bg-gray-800 rounded-2xl px-4 py-3 text-center text-gray-400 text-sm">
              Connecting to Spotify player...
            </div>
          )}

          {/* Voting / your song */}
          {!isMyCurrentSong ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold">Who added this song?</h3>
              <div className="flex flex-col gap-2">
                {players.filter(p => me && p.id !== me.id).map(p => (
                  <button
                    key={p.id}
                    onClick={() => castVote(p.id)}
                    disabled={!!myVote}
                    className={`w-full py-3 rounded-2xl font-semibold text-lg transition ${
                      myVote === p.id ? 'bg-green-500 text-black'
                      : myVote ? 'bg-gray-700 text-gray-400 opacity-50'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {myVote && !revealed && (
                <div className="bg-gray-800 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Your vote</span>
                  <span className="font-semibold text-green-400">{players.find(p => p.id === myVote)?.name}</span>
                </div>
              )}
              {myVote && revealed && (
                <div className={`rounded-2xl px-4 py-4 text-center ${myVote === currentSong.player_id ? 'bg-green-900 border border-green-500' : 'bg-red-900 border border-red-500'}`}>
                  <div className="text-sm text-gray-300 mb-1">
                    {myVote === currentSong.player_id ? '✓ Correct!' : '✗ Wrong!'}
                  </div>
                  <div className="text-lg font-bold">
                    {players.find(p => p.id === currentSong.player_id)?.name} added this song
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-yellow-900 border border-yellow-600 rounded-2xl p-4 text-center">
              <p className="text-yellow-300 font-semibold">This is your song!</p>
              {revealed && <p className="text-gray-300 text-sm mt-1">Players can see the result</p>}
            </div>
          )}

          {/* Host controls */}
          <div className="border-t border-gray-700 pt-4 flex flex-col gap-3">
            <div className="bg-gray-800 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">Votes</h3>
                <span className="text-sm text-gray-400">
                  {currentVotes.length}/{players.filter(p => p.id !== currentSong.player_id).length}
                </span>
              </div>
              {players.filter(p => p.id !== currentSong.player_id).map(p => {
                const voted = currentVotes.some(v => v.voter_id === p.id)
                return (
                  <div key={p.id} className="flex items-center justify-between py-0.5">
                    <span className="text-sm">{p.name}{me && p.id === me.id ? ' (you)' : ''}</span>
                    <span className={voted ? 'text-green-400 text-sm' : 'text-gray-500 text-sm'}>{voted ? '✓' : '...'}</span>
                  </div>
                )
              })}
            </div>

            {!showReveal ? (
              <button
                onClick={async () => { setShowReveal(true); setRevealed(true); await broadcastReveal() }}
                disabled={!allVoted}
                className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-lg rounded-2xl disabled:opacity-40"
              >
                {allVoted ? 'Reveal who added it!' : 'Waiting for all votes...'}
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="bg-green-900 border border-green-500 rounded-2xl p-4 text-center">
                  <div className="text-gray-300 text-sm mb-1">This song was added by</div>
                  <div className="text-2xl font-bold text-green-300">
                    {players.find(p => p.id === currentSong.player_id)?.name ?? 'Unknown'}
                  </div>
                  <div className="mt-2 text-sm text-gray-300">
                    {(() => {
                      const correct = currentVotes.filter(v => v.voted_for_player_id === currentSong.player_id)
                      return `${correct.length}/${currentVotes.length} players guessed correctly`
                    })()}
                  </div>
                </div>
                <button
                  onClick={nextSong}
                  className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl"
                >
                  {currentSongIndex + 1 < songs.length ? 'Next song →' : 'Show final scores'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTS */}
      {step === 'results' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-center text-green-400">Final Scores</h2>
          <div className="flex flex-col gap-2">
            {[...players]
              .map(p => ({
                ...p,
                score: votes.filter(v => v.voter_id === p.id && songs.find(s => s.id === v.song_id)?.player_id === v.voted_for_player_id).length,
              }))
              .sort((a, b) => b.score - a.score)
              .map((p, i) => (
                <div key={p.id} className={`rounded-2xl px-4 py-3 flex items-center justify-between ${me && p.id === me.id ? 'bg-green-900 border border-green-600' : 'bg-gray-800'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono w-6">{i + 1}.</span>
                    <span className="font-semibold">{p.name}{me && p.id === me.id ? <span className="text-xs text-green-400 ml-1">(you)</span> : null}</span>
                  </div>
                  <span className="text-green-400 font-bold text-lg">{p.score} pts</span>
                </div>
              ))}
          </div>
          <a href="/" className="w-full py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg rounded-2xl text-center block mt-2">
            Back to home
          </a>
        </div>
      )}
    </main>
  )
}
