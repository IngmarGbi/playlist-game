import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateRoomCode } from '@/lib/rooms'

export async function POST() {
  let code = generateRoomCode()
  // Ensure unique code
  while (true) {
    const { data } = await supabase.from('rooms').select('id').eq('code', code).single()
    if (!data) break
    code = generateRoomCode()
  }

  const { data, error } = await supabase.from('rooms').insert({ code }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (error || !data) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  return NextResponse.json(data)
}
