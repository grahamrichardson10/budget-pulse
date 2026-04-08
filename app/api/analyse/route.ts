import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('image') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Missing image' }, { status: 400 })
  }

  const mediaType = file.type || 'image/jpeg'
  const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  const safeType = validTypes.includes(mediaType) ? mediaType : 'image/jpeg'

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')

  let msg
  try {
    msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: safeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Find the PERSONKONTO balance in this Nordea screenshot. Reply with ONLY this JSON and nothing else: {"balance": 15645.79}',
          },
        ],
      }],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Anthropic API error: ' + message }, { status: 500 })
  }

  const raw = msg.content.find(b => b.type === 'text')?.text ?? ''
  const match = raw.match(/-?\d+(\.\d+)?/)
  if (!match) {
    return NextResponse.json({ error: 'Could not parse balance from: ' + raw }, { status: 422 })
  }

  return NextResponse.json({ balance: parseFloat(match[0]) })
}
