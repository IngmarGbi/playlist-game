'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Room, Player, Song, SpotifyTrack } from '@/types'

type Step = 'join' | 'adding' | 'waiting' | 'voting' | 'reveal' | 'results'

export default function RoomPage() {
  const { code } = useParams<{ code: string }>()
  const [room, setRoom] = useState<Room | null>(null)
  const [me, setMe] = useState<Player | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [songs, setSongs] = useState<Song[]>([])
  const [step, setStep] = useState<Step>('join')

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([])
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrack | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [mySong, setMySong] = useState<Song | null>(null)

  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [votes, setVotes] = useState<{ voter_id: string; voted_for_player_id: string }[]>([])
  const [showReveal, setShowReveal] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!code) return
    supabase.from('rooms').select('*').eq('code', code.toUpperCase()).single().then(({ data }) => {
      if (data) setRoom(data)
    })
  }, [code])

  useEffect(() => {
    if (!room) return

    supabase.from('players').select('*').eq('room_id', room.id).order('created_at').then(({ data }) => {
      if (data) setPlayers(data)
    })
    supabase.from('songs').select('*').eq('room_id', room.id).order('position').then(({ data }) => {
      if (data) setSongs(data)
    })

    const sub = supabase.channel(`player-room-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        ({ new: r }) => setRoom(r as Room))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        ({ new: p }) => setPlayers(prev => [...prev, p as Player]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'songs', filter: `room_id=eq.${room.id}` },
        ({ new: s }) => setSongs(prev => [...prev, s as Song]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${room.id}` },
        ({ new: v }) => setVotes(prev => {
          const f = prev.filter(x => !(x.voter_id === (v as { voter_id: string }).voter_id && (v as { song_id?: string }).song_id === currentSong?.id))
          return [...f, v as { voter_id: string; voted_for_player_id: string }]
        }))
      .on('broadcast', { event: 'reveal' }, () => setRevealed(true))
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id])

  // Sync step from room status
  useEffect(() => {
    if (!room || !me) return
    if (room.status === 'lobby') setStep('join')
    if (room.status === 'adding') {
      const myCount = songs.filter(s => s.player_id === me.id).length
      setStep(myCount >= (room.songs_per_player ?? 1) ? 'waiting' : 'adding')
    }
    if (room.status === 'playing') {
      // Re-fetch songs sorted by position — the host may have shuffled them after players loaded
      supabase.from('songs').select('*').eq('room_id', room.id).order('position').then(({ data }) => {
        const sorted = data ?? []
        setSongs(sorted)
        const song = sorted[room.current_song_index]
        setCurrentSong(song ?? null)
        setMyVote(null)
        setRevealed(false)
        setShowReveal(false)
        setStep(song?.player_id === me?.id ? 'reveal' : 'voting')
      })
    }
    if (room.status === 'results') setStep('results')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.current_song_index])

  async function joinRoom() {
    if (!name.trim() || !room) return
    const taken = players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())
    if (taken) { setNameError('Name already taken'); return }
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: room.id, name: name.trim() }),
    })
    const player = await res.json()
    setMe(player)
    setStep('waiting')
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
        artist: selectedTrack.artists.map(a => a.name).join(', '),
        cover_url: selectedTrack.album.images[0]?.url ?? null,
      }),
    })
    setMySong({ ...selectedTrack, player_id: me.id } as unknown as Song)
    setSelectedTrack(null)
    setQuery('')
    setSearchResults([])
    const newCount = songs.filter(s => s.player_id === me.id).length + 1
    setStep(newCount >= (room.songs_per_player ?? 1) ? 'waiting' : 'adding')
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

  if (!room) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <p className="text-gray-400">Loading room...</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col p-5 gap-5 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-green-400">Playlist Game</h1>
        <span className="font-mono font-bold text-lg tracking-widest text-gray-300">{room.code}</span>
      </div>

      {step === 'join' && (
        <div className="flex flex-col gap-4 mt-8">
          <h2 className="text-xl font-semibold">Enter your name</h2>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => { setName(e.target.value); setNameError('') }}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
            className="w-full py-4 px-4 bg-gray-800 text-white rounded-2xl outline-none focus:ring-2 focus:ring-green-500 text-lg"
          />
          {nameError && <p className="text-red-400 text-sm">{nameError}</p>}
          <button
            onClick={joinRoom}
            disabled={!name.trim()}
            className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl disabled:opacity-40"
          >
            Join
          </button>
        </div>
      )}

      {step === 'waiting' && room.status === 'lobby' && (
        <div className="flex flex-col gap-3 mt-8 text-center">
          <p className="text-green-400 font-semibold text-lg">You&apos;re in!</p>
          <p className="text-gray-400">Waiting for the host to start the game...</p>
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {players.map(p => <span key={p.id} className="bg-gray-800 px-3 py-1 rounded-full text-sm">{p.name}</span>)}
          </div>
        </div>
      )}

      {step === 'adding' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Pick your songs</h2>
            <span className="text-green-400 font-semibold">
              {me ? songs.filter(s => s.player_id === me.id).length : 0}/{room.songs_per_player ?? 1}
            </span>
          </div>
          <p className="text-gray-400 text-sm">Search for songs to add. Others will have to guess they&apos;re yours!</p>
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
                <div className="text-sm text-gray-300 truncate">{selectedTrack.artists.map(a => a.name).join(', ')}</div>
              </div>
              <button onClick={() => setSelectedTrack(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
          )}
          {searchResults.length > 0 && !selectedTrack && (
            <div className="flex flex-col gap-2">
              {searchResults.map(t => (
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
                    <div className="text-sm text-gray-400 truncate">{t.artists.map(a => a.name).join(', ')}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={submitSong}
            disabled={!selectedTrack || submitting}
            className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl disabled:opacity-40 mt-2"
          >
            {submitting ? 'Adding...' : 'Add this song'}
          </button>
        </div>
      )}

      {step === 'waiting' && room.status === 'adding' && (
        <div className="flex flex-col gap-3 mt-8 text-center">
          <p className="text-green-400 font-semibold text-lg">Song added!</p>
          {(mySong ?? songs.find(s => me && s.player_id === me.id)) && (
            <div className="bg-gray-800 rounded-2xl p-4 flex gap-3 items-center text-left">
              {(mySong?.cover_url ?? songs.find(s => me && s.player_id === me.id)?.cover_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(mySong?.cover_url ?? songs.find(s => me && s.player_id === me.id)?.cover_url) as string}
                  alt="cover"
                  className="w-14 h-14 rounded-xl"
                />
              )}
              <div>
                <div className="font-semibold">{mySong?.title ?? songs.find(s => me && s.player_id === me.id)?.title}</div>
                <div className="text-sm text-gray-400">{mySong?.artist ?? songs.find(s => me && s.player_id === me.id)?.artist}</div>
              </div>
            </div>
          )}
          <p className="text-gray-400">Waiting for others...</p>
          <div className="flex flex-col gap-1 mt-2">
            {players.map(p => {
              const added = songs.some(s => s.player_id === p.id)
              return (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-gray-300">{p.name}</span>
                  <span className={added ? 'text-green-400' : 'text-gray-500'}>{added ? '✓' : '...'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {step === 'voting' && currentSong && (
        <div className="flex flex-col gap-4">
          <div className="text-center text-gray-400 text-sm">
            Song {(room.current_song_index ?? 0) + 1} of {songs.length}
          </div>
          <div className="bg-gray-800 rounded-2xl p-5 flex gap-4 items-center">
            {currentSong.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentSong.cover_url} alt="cover" className="w-20 h-20 rounded-xl" />
            )}
            <div>
              <div className="font-bold text-lg">{currentSong.title}</div>
              <div className="text-gray-400 text-sm">{currentSong.artist}</div>
            </div>
          </div>
          <h3 className="font-semibold">Who added this song?</h3>
          <div className="flex flex-col gap-2">
            {players
              .filter(p => me && p.id !== me.id)
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => castVote(p.id)}
                  disabled={!!myVote}
                  className={`w-full py-4 rounded-2xl font-semibold text-lg transition ${
                    myVote === p.id
                      ? 'bg-green-500 text-black'
                      : myVote
                      ? 'bg-gray-700 text-gray-400 opacity-50'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {p.name}
                </button>
              ))}
          </div>
          {myVote && !revealed && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="bg-gray-800 rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-gray-400 text-sm">Your vote</span>
                <span className="font-semibold text-green-400">{players.find(p => p.id === myVote)?.name}</span>
              </div>
              <p className="text-center text-gray-500 text-sm">Waiting for the host to reveal...</p>
            </div>
          )}
          {myVote && revealed && currentSong && (
            <div className="flex flex-col gap-3 mt-1">
              <div className={`rounded-2xl px-4 py-4 text-center ${myVote === currentSong.player_id ? 'bg-green-900 border border-green-500' : 'bg-red-900 border border-red-500'}`}>
                <div className="text-sm text-gray-300 mb-1">
                  {myVote === currentSong.player_id ? '✓ Correct!' : '✗ Wrong!'}
                </div>
                <div className="text-lg font-bold">
                  {players.find(p => p.id === currentSong.player_id)?.name} added this song
                </div>
                {myVote !== currentSong.player_id && (
                  <div className="text-sm text-gray-300 mt-1">You voted for {players.find(p => p.id === myVote)?.name}</div>
                )}
              </div>
              <p className="text-center text-gray-500 text-sm">Waiting for the host to continue...</p>
            </div>
          )}
        </div>
      )}

      {step === 'reveal' && currentSong && (
        <div className="flex flex-col gap-4 mt-4 text-center">
          <p className="text-yellow-400 font-semibold">This is your song!</p>
          <div className="bg-gray-800 rounded-2xl p-5 flex gap-4 items-center">
            {currentSong.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentSong.cover_url} alt="cover" className="w-20 h-20 rounded-xl" />
            )}
            <div className="text-left">
              <div className="font-bold text-lg">{currentSong.title}</div>
              <div className="text-gray-400 text-sm">{currentSong.artist}</div>
            </div>
          </div>
          {!revealed
            ? <p className="text-gray-400">Others are voting on who added it...</p>
            : <p className="text-gray-400">Waiting for the host to continue...</p>
          }
        </div>
      )}

      {step === 'results' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-center text-green-400">Final Scores</h2>
          <div className="flex flex-col gap-2">
            {[...players]
              .map(p => ({
                ...p,
                score: votes.filter(v =>
                  v.voter_id === p.id &&
                  songs.find(s => s.player_id === v.voted_for_player_id)
                ).length,
              }))
              .sort((a, b) => b.score - a.score)
              .map((p, i) => (
                <div
                  key={p.id}
                  className={`rounded-2xl px-4 py-3 flex items-center justify-between ${me && p.id === me.id ? 'bg-green-900 border border-green-600' : 'bg-gray-800'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono w-6">{i + 1}.</span>
                    <span className="font-semibold">{p.name} {me && p.id === me.id && <span className="text-xs text-green-400">(you)</span>}</span>
                  </div>
                  <span className="text-green-400 font-bold text-lg">{p.score} pts</span>
                </div>
              ))}
          </div>
          <a
            href="/"
            className="w-full py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg rounded-2xl text-center mt-2"
          >
            Back to home
          </a>
        </div>
      )}
    </main>
  )
}
