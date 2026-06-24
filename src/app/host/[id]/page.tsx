'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Room, Player, Song, Vote } from '@/types'

type Phase = 'lobby' | 'adding' | 'playing' | 'results'

export default function HostPage() {
  const { id } = useParams<{ id: string }>()
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [songs, setSongs] = useState<Song[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [showReveal, setShowReveal] = useState(false)

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
        ({ new: newRoom }) => { setRoom(newRoom as Room); setCurrentSongIndex((newRoom as Room).current_song_index) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${id}` },
        ({ new: p }) => setPlayers(prev => [...prev, p as Player]))
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

  const updateRoomStatus = useCallback(async (status: Phase, extra: object = {}) => {
    await fetch(`/api/rooms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extra }),
    })
  }, [id])

  async function broadcastReveal() {
    await supabase.channel(`player-room-${id}`).send({
      type: 'broadcast',
      event: 'reveal',
      payload: {},
    })
  }

  const currentSong = songs[currentSongIndex]
  const currentVotes = votes.filter(v => v.song_id === currentSong?.id)
  const allVoted = currentSong
    ? players.filter(p => p.id !== currentSong.player_id).every(p => currentVotes.some(v => v.voter_id === p.id))
    : false

  async function nextSong() {
    setShowReveal(false)
    const next = currentSongIndex + 1
    if (next >= songs.length) {
      await updateRoomStatus('results')
    } else {
      await updateRoomStatus('playing', { current_song_index: next })
      setCurrentSongIndex(next)
    }
  }

  if (!room) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Loading...</div>

  const roomUrl = `${window.location.origin}/room/${room.code}`

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-green-400">Host Screen</h1>
        <div className="text-right">
          <div className="text-3xl font-mono font-bold tracking-widest text-white">{room.code}</div>
          <div className="text-xs text-gray-400">{roomUrl}</div>
        </div>
      </div>

      {room.status === 'lobby' && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-800 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-3">Players joined ({players.length})</h2>
            {players.length === 0
              ? <p className="text-gray-400">Waiting for players...</p>
              : <div className="flex flex-wrap gap-2">
                  {players.map(p => (
                    <span key={p.id} className="bg-gray-700 px-3 py-1 rounded-full text-sm">{p.name}</span>
                  ))}
                </div>
            }
          </div>
          <button
            onClick={() => updateRoomStatus('adding')}
            disabled={players.length < 2}
            className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl disabled:opacity-40"
          >
            Start — everyone adds their song
          </button>
          {players.length < 2 && <p className="text-gray-400 text-sm text-center">Need at least 2 players</p>}
        </div>
      )}

      {room.status === 'adding' && (
        <div className="flex flex-col gap-4">
          <div className="bg-gray-800 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-1">Players are adding their songs</h2>
            <p className="text-gray-400 text-sm mb-3">Each player picks one song on their phone</p>
            <div className="flex flex-col gap-2">
              {players.map(p => {
                const added = songs.some(s => s.player_id === p.id)
                return (
                  <div key={p.id} className="flex items-center justify-between">
                    <span>{p.name}</span>
                    <span className={added ? 'text-green-400' : 'text-gray-500'}>{added ? '✓ Added' : 'Pending...'}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <button
            onClick={async () => {
              const shuffled = [...songs].sort(() => Math.random() - 0.5).map((s, i) => ({ ...s, position: i }))
              await Promise.all(shuffled.map((s, i) =>
                supabase.from('songs').update({ position: i }).eq('id', s.id)
              ))
              setSongs(shuffled)
              await updateRoomStatus('playing', { current_song_index: 0 })
            }}
            disabled={songs.length < players.length}
            className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl disabled:opacity-40"
          >
            Everyone&apos;s ready — start playing!
          </button>
          {songs.length < players.length && (
            <p className="text-gray-400 text-sm text-center">
              {songs.length}/{players.length} songs added
            </p>
          )}
        </div>
      )}

      {room.status === 'playing' && currentSong && (
        <div className="flex flex-col gap-4">
          <div className="text-center text-gray-400 text-sm">
            Song {currentSongIndex + 1} of {songs.length}
          </div>
          <div className="bg-gray-800 rounded-2xl p-6 flex gap-4 items-center">
            {currentSong.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentSong.cover_url} alt="cover" className="w-20 h-20 rounded-xl object-cover" />
            )}
            <div>
              <div className="font-bold text-xl">{currentSong.title}</div>
              <div className="text-gray-400">{currentSong.artist}</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Votes</h3>
              <span className="text-sm text-gray-400">{currentVotes.length}/{players.filter(p => p.id !== currentSong.player_id).length}</span>
            </div>
            {players.filter(p => p.id !== currentSong.player_id).map(p => {
              const voted = currentVotes.some(v => v.voter_id === p.id)
              return (
                <div key={p.id} className="flex items-center justify-between py-1">
                  <span>{p.name}</span>
                  <span className={voted ? 'text-green-400 text-sm' : 'text-gray-500 text-sm'}>{voted ? 'Voted' : 'Waiting...'}</span>
                </div>
              )
            })}
          </div>

          {!showReveal ? (
            <button
              onClick={async () => { setShowReveal(true); await broadcastReveal() }}
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
                <div className="mt-3 text-sm text-gray-300">
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
      )}

      {room.status === 'results' && (
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
                <div key={p.id} className="bg-gray-800 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono w-6">{i + 1}.</span>
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  <span className="text-green-400 font-bold text-lg">{p.score} pts</span>
                </div>
              ))}
          </div>
          <a
            href="/"
            className="w-full py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg rounded-2xl text-center mt-2 block"
          >
            Back to home
          </a>
        </div>
      )}
    </main>
  )
}
