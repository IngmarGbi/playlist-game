'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hosting, setHosting] = useState(false)

  async function createRoom(provider: 'spotify' | 'youtube') {
    setLoading(true)
    setError('')
    const res = await fetch('/api/rooms', { method: 'POST' })
    const room = await res.json()
    if (!res.ok || !room.id) {
      setError('Failed to create room. Check your connection and try again.')
      setLoading(false)
      return
    }
    if (provider === 'spotify') {
      window.location.href = `/api/spotify/auth?roomId=${room.id}`
    } else {
      router.push(`/host/${room.id}?provider=youtube`)
    }
  }

  async function joinRoom() {
    if (!joinCode.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch(`/api/rooms?code=${joinCode.trim().toUpperCase()}`)
    if (!res.ok) {
      setError('Room not found. Check the code and try again.')
      setLoading(false)
      return
    }
    const room = await res.json()
    router.push(`/room/${room.code}`)
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 gap-12">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-green-400 mb-2">🎵 Playlist Game</h1>
        <p className="text-gray-400 text-lg">Guess who added which song</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {!hosting ? (
          <button
            onClick={() => setHosting(true)}
            disabled={loading}
            className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-2xl transition disabled:opacity-50"
          >
            Create a room (host)
          </button>
        ) : (
          <div className="flex flex-col gap-3 bg-gray-900 rounded-2xl p-5">
            <p className="font-semibold text-center">Choose your music source</p>
            <button
              onClick={() => createRoom('spotify')}
              disabled={loading}
              className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold rounded-2xl disabled:opacity-50"
            >
              Connect Spotify
            </button>
            <button
              onClick={() => createRoom('youtube')}
              disabled={loading}
              className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl disabled:opacity-50"
            >
              Use YouTube
            </button>
            <button onClick={() => setHosting(false)} className="text-gray-500 text-sm hover:text-gray-300">
              Cancel
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Room code (e.g. AB3K)"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
            maxLength={4}
            className="w-full py-4 px-4 bg-gray-800 text-white text-center text-xl tracking-widest font-mono rounded-2xl outline-none focus:ring-2 focus:ring-green-500"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            onClick={joinRoom}
            disabled={loading || !joinCode.trim()}
            className="w-full py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg rounded-2xl transition disabled:opacity-50"
          >
            Join room
          </button>
        </div>
      </div>
    </main>
  )
}
