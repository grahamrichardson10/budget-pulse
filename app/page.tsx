'use client'

import { useState, useRef } from 'react'

const SPENDABLE = 19860
const BASELINE = 662
const PAYDAY_DAY = 25

interface Results {
  balance: number
  daily: number
  daysLeft: number
  shouldHave: number
  buffer: number
}

function computeResults(balance: number): Results {
  const now = new Date()
  const dom = now.getDate()
  const daysLeft =
    dom < PAYDAY_DAY
      ? PAYDAY_DAY - dom
      : Math.round(
          (new Date(now.getFullYear(), now.getMonth() + 1, PAYDAY_DAY).getTime() -
            now.getTime()) /
            86400000
        )
  const shouldHave = SPENDABLE - (dom - 1) * BASELINE
  const buffer = balance - shouldHave
  const daily = Math.round(balance / daysLeft)
  return { balance, daily, daysLeft, shouldHave, buffer }
}

function fmt(n: number) {
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
}

export default function Home() {
  const [tab, setTab] = useState<'manual' | 'screenshot'>('manual')
  const [manualBalance, setManualBalance] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgBase64, setImgBase64] = useState<string | null>(null)
  const [imgMediaType, setImgMediaType] = useState<string>('image/png')
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleShowResults(balance: number) {
    setResults(computeResults(balance))
  }

  function handleReset() {
    setResults(null)
    setImgSrc(null)
    setImgBase64(null)
    setStatus('')
    setManualBalance('')
  }

  function loadImageFile(file: File) {
    const mt = file.type || 'image/png'
    setImgMediaType(mt)
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImgSrc(dataUrl)
      // strip data:...;base64,
      const b64 = dataUrl.split(',')[1]
      setImgBase64(b64)
      setStatus('Image loaded. Press Analyse.')
    }
    reader.readAsDataURL(file)
  }

  async function handleClipboard() {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const file = new File([blob], 'clipboard', { type: imageType })
          loadImageFile(file)
          return
        }
      }
      setStatus('No image found in clipboard.')
    } catch {
      setStatus('Clipboard access denied or no image.')
    }
  }

  async function handleSwitchToScreenshot() {
    setTab('screenshot')
    // Auto-check clipboard on tab switch
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const file = new File([blob], 'clipboard', { type: imageType })
          loadImageFile(file)
          return
        }
      }
    } catch {
      // Silently ignore — user can paste manually
    }
  }

  async function handleAnalyse() {
    if (!imgBase64) {
      setStatus('No image loaded.')
      return
    }
    setLoading(true)
    setStatus('Analysing…')
    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imgBase64, mediaType: imgMediaType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('Error: ' + (data.error ?? res.statusText))
      } else {
        handleShowResults(data.balance)
      }
    } catch (err) {
      setStatus('Network error: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const styles = {
    wrapper: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '40px 16px 80px',
      gap: '24px',
    },
    header: {
      textAlign: 'center' as const,
      paddingTop: '8px',
    },
    headerTitle: {
      fontFamily: "'Syne', sans-serif",
      fontWeight: 800,
      fontSize: '2rem',
      color: '#c8f04a',
      letterSpacing: '-0.5px',
    },
    headerSub: {
      fontSize: '0.7rem',
      color: '#6b6b80',
      letterSpacing: '0.15em',
      marginTop: '4px',
      textTransform: 'uppercase' as const,
    },
    card: {
      background: '#111118',
      border: '1px solid #1e1e2e',
      borderRadius: '16px',
      padding: '24px',
      width: '100%',
      maxWidth: '420px',
    },
    tabRow: {
      display: 'flex',
      gap: '8px',
      marginBottom: '20px',
    },
    tab: (active: boolean) => ({
      flex: 1,
      padding: '9px 0',
      borderRadius: '8px',
      border: active ? 'none' : '1px solid #1e1e2e',
      background: active ? '#c8f04a' : 'transparent',
      color: active ? '#0a0a0f' : '#6b6b80',
      fontFamily: "'DM Mono', monospace",
      fontSize: '0.78rem',
      fontWeight: active ? 500 : 400,
      cursor: 'pointer',
      transition: 'all 0.15s',
    }),
    label: {
      fontSize: '0.7rem',
      color: '#6b6b80',
      letterSpacing: '0.1em',
      textTransform: 'uppercase' as const,
      marginBottom: '8px',
      display: 'block',
    },
    input: {
      width: '100%',
      background: '#0a0a0f',
      border: '1px solid #1e1e2e',
      borderRadius: '10px',
      padding: '14px 16px',
      color: '#e8e8f0',
      fontFamily: "'DM Mono', monospace",
      fontSize: '1.1rem',
      outline: 'none',
      marginBottom: '16px',
    },
    btnAccent: {
      width: '100%',
      background: '#c8f04a',
      border: 'none',
      borderRadius: '10px',
      padding: '14px',
      color: '#0a0a0f',
      fontFamily: "'DM Mono', monospace",
      fontSize: '0.9rem',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'opacity 0.15s',
    },
    btnOutline: {
      width: '100%',
      background: 'transparent',
      border: '1px solid #1e1e2e',
      borderRadius: '10px',
      padding: '13px',
      color: '#e8e8f0',
      fontFamily: "'DM Mono', monospace",
      fontSize: '0.9rem',
      cursor: 'pointer',
      marginTop: '8px',
      transition: 'border-color 0.15s',
    },
    imgPreview: {
      width: '100%',
      borderRadius: '10px',
      border: '1px solid #1e1e2e',
      marginBottom: '16px',
      display: 'block',
    },
    statusText: {
      fontSize: '0.75rem',
      color: '#6b6b80',
      marginTop: '12px',
      textAlign: 'center' as const,
      minHeight: '18px',
    },
    // Results
    resultCard: {
      background: '#111118',
      border: '1px solid #1e1e2e',
      borderRadius: '16px',
      padding: '28px 24px',
      width: '100%',
      maxWidth: '420px',
    },
    bigLabel: {
      fontSize: '0.68rem',
      color: '#6b6b80',
      letterSpacing: '0.12em',
      textTransform: 'uppercase' as const,
      marginBottom: '4px',
    },
    bigNumber: (color: string) => ({
      fontFamily: "'Syne', sans-serif",
      fontWeight: 800,
      fontSize: '3.2rem',
      color,
      lineHeight: 1,
      letterSpacing: '-1px',
    }),
    bigUnit: {
      fontFamily: "'DM Mono', monospace",
      fontSize: '0.85rem',
      color: '#6b6b80',
      marginLeft: '6px',
      fontWeight: 400,
    },
    badge: (positive: boolean) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: positive ? 'rgba(200,240,74,0.1)' : 'rgba(255,77,109,0.1)',
      border: `1px solid ${positive ? 'rgba(200,240,74,0.25)' : 'rgba(255,77,109,0.25)'}`,
      borderRadius: '20px',
      padding: '4px 12px',
      fontSize: '0.75rem',
      color: positive ? '#c8f04a' : '#ff4d6d',
      marginTop: '12px',
    }),
    dot: (positive: boolean) => ({
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: positive ? '#c8f04a' : '#ff4d6d',
      display: 'inline-block',
      animation: 'pulse 1.5s ease-in-out infinite',
    }),
    divider: {
      borderTop: '1px solid #1e1e2e',
      margin: '20px 0',
    },
    metricRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid #1e1e2e',
    },
    metricLabel: {
      fontSize: '0.78rem',
      color: '#6b6b80',
    },
    metricValue: (color: string) => ({
      fontFamily: "'Syne', sans-serif",
      fontWeight: 700,
      fontSize: '0.95rem',
      color,
    }),
    ghostBtn: {
      background: 'transparent',
      border: '1px solid #1e1e2e',
      borderRadius: '10px',
      padding: '12px',
      color: '#6b6b80',
      fontFamily: "'DM Mono', monospace",
      fontSize: '0.85rem',
      cursor: 'pointer',
      width: '100%',
      marginTop: '20px',
      transition: 'color 0.15s, border-color 0.15s',
    },
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div style={styles.wrapper}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerTitle}>Budget Pulse</div>
          <div style={styles.headerSub}>SEK · Monthly</div>
        </header>

        {results ? (
          /* ── Results card ── */
          <div style={styles.resultCard}>
            <div style={styles.bigLabel}>Daily budget remaining</div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={styles.bigNumber(results.daily >= BASELINE ? '#c8f04a' : '#ff4d6d')}>
                {fmt(results.daily)}
              </span>
              <span style={styles.bigUnit}>SEK/day</span>
            </div>

            <div style={styles.badge(results.buffer >= 0)}>
              <span style={styles.dot(results.buffer >= 0)} />
              {results.buffer >= 0
                ? `${fmt(results.buffer)} ahead`
                : `${fmt(Math.abs(results.buffer))} behind`}
            </div>

            <div style={styles.divider} />

            {/* Metric rows */}
            {[
              { label: 'Balance', value: fmt(results.balance) + ' SEK', color: '#e8e8f0' },
              { label: 'Should have now', value: fmt(results.shouldHave) + ' SEK', color: '#e8e8f0' },
              {
                label: 'Buffer (+/−)',
                value: (results.buffer >= 0 ? '+' : '') + fmt(results.buffer) + ' SEK',
                color: results.buffer >= 0 ? '#c8f04a' : '#ff4d6d',
              },
              { label: 'Days until payday', value: String(results.daysLeft), color: '#e8e8f0' },
              { label: 'Baseline pace', value: fmt(BASELINE) + ' SEK/day', color: '#e8e8f0' },
            ].map((m) => (
              <div key={m.label} style={styles.metricRow}>
                <span style={styles.metricLabel}>{m.label}</span>
                <span style={styles.metricValue(m.color)}>{m.value}</span>
              </div>
            ))}

            <button style={styles.ghostBtn} onClick={handleReset}>
              ↩ New Check
            </button>
          </div>
        ) : (
          /* ── Input card ── */
          <div style={styles.card}>
            {/* Tabs */}
            <div style={styles.tabRow}>
              <button
                style={styles.tab(tab === 'manual')}
                onClick={() => setTab('manual')}
              >
                ✏️ Manual
              </button>
              <button
                style={styles.tab(tab === 'screenshot')}
                onClick={handleSwitchToScreenshot}
              >
                📷 Screenshot
              </button>
            </div>

            {tab === 'manual' ? (
              <>
                <label style={styles.label}>Current balance (SEK)</label>
                <input
                  type="number"
                  style={styles.input}
                  placeholder="e.g. 14 350"
                  value={manualBalance}
                  onChange={(e) => setManualBalance(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualBalance) {
                      handleShowResults(parseFloat(manualBalance))
                    }
                  }}
                />
                <button
                  style={styles.btnAccent}
                  disabled={!manualBalance}
                  onClick={() => handleShowResults(parseFloat(manualBalance))}
                >
                  Calculate
                </button>
              </>
            ) : (
              <>
                {imgSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgSrc} alt="Bank screenshot preview" style={styles.imgPreview} />
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) loadImageFile(file)
                  }}
                />

                <button
                  style={styles.btnAccent}
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 Choose from Library
                </button>

                <button style={styles.btnOutline} onClick={handleClipboard}>
                  📋 Paste from Clipboard
                </button>

                {imgBase64 && (
                  <button
                    style={{ ...styles.btnAccent, marginTop: '12px', opacity: loading ? 0.6 : 1 }}
                    disabled={loading}
                    onClick={handleAnalyse}
                  >
                    {loading ? 'Analysing…' : '🔍 Analyse'}
                  </button>
                )}

                {status && <div style={styles.statusText}>{status}</div>}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
