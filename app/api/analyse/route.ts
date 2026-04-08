import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { image, mediaType } = await req.json()

  if (!image || !mediaType) {
    return NextResponse.json({ error: 'Missing image or mediaType' }, { status: 400 })
  }

  const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  if (!validTypes.includes(mediaType)) {
    return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
  }

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
            data: image,
          },
        },
        {
          type: 'text',
          text: 'Find the PERSONKONTO balance in this Nordea screenshot. Reply with ONLY this JSON and nothing else: {"balance": 15645.79}',
        },
      ],
    }],
  })

  const raw = msg.content.find(b => b.type === 'text')?.text ?? ''
  const match = raw.match(/-?\d+(\.\d+)?/)
  if (!match) {
    return NextResponse.json({ error: 'Could not parse balance from: ' + raw }, { status: 422 })
  }

  return NextResponse.json({ balance: parseFloat(match[0]) })
}
