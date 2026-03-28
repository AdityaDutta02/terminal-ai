import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
export const runtime = 'edge'
export function GET(req: NextRequest): ImageResponse {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') ?? 'Terminal AI'
  const subtitle = searchParams.get('subtitle') ?? 'AI-powered apps marketplace'
  const channel = searchParams.get('channel') ?? ''
  const credits = searchParams.get('credits') ?? ''
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0f0f23 0%, #1a1035 50%, #0f0f23 100%)',
          fontFamily: 'system-ui, sans-serif',
          padding: '60px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(ellipse at 20% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 50%)',
            display: 'flex',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: '20px', height: '20px', background: 'white', borderRadius: '4px', display: 'flex' }} />
          </div>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '20px', fontWeight: 500 }}>
            Terminal AI
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
          {channel && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <span
                style={{
                  background: 'rgba(139, 92, 246, 0.2)',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  color: '#c4b5fd',
                  fontSize: '16px',
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontWeight: 500,
                }}
              >
                {channel}
              </span>
            </div>
          )}
          <h1
            style={{
              fontSize: title.length > 30 ? '52px' : '64px',
              fontWeight: 800,
              color: 'white',
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: '24px',
              color: 'rgba(255,255,255,0.55)',
              margin: '20px 0 0',
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '18px' }}>
            terminalai.app
          </span>
          {credits && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px',
                padding: '10px 18px',
              }}
            >
              <span style={{ fontSize: '20px', color: '#fbbf24' }}>◆</span>
              <span style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>
                {credits} credits/session
              </span>
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
