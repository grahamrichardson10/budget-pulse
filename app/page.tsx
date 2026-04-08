'use client'

import { useState, useRef, useEffect } from 'react'

interface Assumptions {
  salary: number
  rent: number
  paydayDay: number
}

const DEFAULT_ASSUMPTIONS: Assumptions = { salary: 34860, rent: 15000, paydayDay: 25 }
const STORAGE_KEY_BALANCE = 'bp_last_balance'
const STORAGE_KEY_ASSUMPTIONS = 'bp_assumptions'

interface Results {
  balance: number
  daily: number
  daysLeft: number
  shouldHave: number
  buffer: number
  projectedAtPayday: number
  cycleDays: number
}

function computeResults(balance: number, a: Assumptions): Results {
  const spendable = a.salary - a.rent
  const now = new Date()
  const dom = now.getDate()
  const cycleStart = dom >= a.paydayDay
    ? new Date(now.getFullYear(), now.getMonth(), a.paydayDay)
    : new Date(now.getFullYear(), now.getMonth() - 1, a.paydayDay)
  const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, a.paydayDay)
  const cycleDays = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 86400000)
  const daysSinceStart = Math.round((now.getTime() - cycleStart.getTime()) / 86400000)
  const daysLeft = Math.round((cycleEnd.getTime() - now.getTime()) / 86400000)
  const baseline = spendable / cycleDays
  const shouldHave = spendable - daysSinceStart * baseline
  const buffer = balance - shouldHave
  const daily = Math.round(balance / daysLeft)
  const projectedAtPayday = Math.round(balance - baseline * daysLeft)
  return { balance, daily, daysLeft, shouldHave, buffer, projectedAtPayday, cycleDays }
}

function fmt(n: number) {
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
}

// Resize image using canvas.toBlob — avoids atob/base64 string entirely (fixes iOS Safari SyntaxError)
async function resizeToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 800
      let { width, height } = img
      if (width > MAX) { height = Math.round((height * MAX) / width); width = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas unavailable'))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('toBlob failed'))
      }, 'image/jpeg', 0.82)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

export default function Home() {
  const [tab, setTab] = useState<'manual' | 'screenshot'>('screenshot')
  const [manualBalance, setManualBalance] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS)
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const spendable = assumptions.salary - assumptions.rent
  const cycleDays = results?.cycleDays ?? 30
  const baseline = Math.round(spendable / cycleDays)

  // Load persisted data on mount
  useEffect(() => {
    try {
      const savedBalance = localStorage.getItem(STORAGE_KEY_BALANCE)
      if (savedBalance) setManualBalance(savedBalance)
      const savedAssumptions = localStorage.getItem(STORAGE_KEY_ASSUMPTIONS)
      if (savedAssumptions) setAssumptions(JSON.parse(savedAssumptions))
    } catch { /* ignore */ }
    tryClipboardSilent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function tryClipboardSilent() {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          loadAndAnalyze(new File([blob], 'clipboard', { type: imageType }))
          return
        }
      }
    } catch { /* silently ignore */ }
  }

  function handleShowResults(balance: number) {
    try { localStorage.setItem(STORAGE_KEY_BALANCE, String(balance)) } catch { /* ignore */ }
    setResults(computeResults(balance, assumptions))
  }

  function handleAssumptionChange(key: keyof Assumptions, value: string) {
    const n = parseFloat(value)
    if (isNaN(n)) return
    const next = { ...assumptions, [key]: n }
    setAssumptions(next)
    try { localStorage.setItem(STORAGE_KEY_ASSUMPTIONS, JSON.stringify(next)) } catch { /* ignore */ }
    if (results) setResults(computeResults(results.balance, next))
  }

  function handleReset() {
    setResults(null)
    setImgSrc(null)
    setStatus('')
  }

  async function loadAndAnalyze(file: File) {
    // Show preview immediately
    const previewUrl = URL.createObjectURL(file)
    setImgSrc(previewUrl)
    setStatus('Analyzing…')
    setLoading(true)

    try {
      const blob = await resizeToBlob(file)
      const fd = new FormData()
      fd.append('image', blob, 'image.jpg')
      const res = await fetch('/api/analyse', { method: 'POST', body: fd })
      const text = await res.text()
      let data: { balance?: number; error?: string }
      try { data = JSON.parse(text) } catch { throw new Error('Server error ' + res.status + ': ' + text.slice(0, 120)) }
      if (!res.ok) {
        setStatus('Error: ' + (data.error ?? res.statusText))
      } else {
        handleShowResults(data.balance!)
      }
    } catch (err) {
      setStatus('Error: ' + String(err))
    } finally {
      setLoading(false)
      URL.revokeObjectURL(previewUrl)
    }
  }

  async function handleClipboard() {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          loadAndAnalyze(new File([blob], 'clipboard', { type: imageType }))
          return
        }
      }
      setStatus('No image in clipboard.')
    } catch {
      setStatus('Clipboard unavailable — use Choose from Library.')
    }
  }

  function handleSwitchToScreenshot() {
    setTab('screenshot')
    tryClipboardSilent()
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const S = {
    wrapper: { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '40px 16px 80px', gap: '24px' },
    header: { textAlign: 'center' as const, paddingTop: '8px' },
    title: { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '2rem', color: '#c8f04a', letterSpacing: '-0.5px' },
    sub: { fontSize: '0.7rem', color: '#6b6b80', letterSpacing: '0.15em', marginTop: '4px', textTransform: 'uppercase' as const },
    card: { background: '#111118', border: '1px solid #1e1e2e', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px' },
    tabRow: { display: 'flex', gap: '8px', marginBottom: '20px' },
    tab: (active: boolean) => ({ flex: 1, padding: '9px 0', borderRadius: '8px', border: active ? 'none' : '1px solid #1e1e2e', background: active ? '#c8f04a' : 'transparent', color: active ? '#0a0a0f' : '#6b6b80', fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', fontWeight: active ? 500 : 400, cursor: 'pointer' }),
    label: { fontSize: '0.7rem', color: '#6b6b80', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '8px', display: 'block' },
    input: { width: '100%', background: '#0a0a0f', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '14px 16px', color: '#e8e8f0', fontFamily: "'DM Mono', monospace", fontSize: '1.1rem', outline: 'none', marginBottom: '16px' },
    btnAccent: { width: '100%', background: '#c8f04a', border: 'none', borderRadius: '10px', padding: '14px', color: '#0a0a0f', fontFamily: "'DM Mono', monospace", fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer' },
    btnOutline: { width: '100%', background: 'transparent', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '13px', color: '#e8e8f0', fontFamily: "'DM Mono', monospace", fontSize: '0.9rem', cursor: 'pointer', marginTop: '8px' },
    imgPreview: { width: '100%', borderRadius: '10px', border: '1px solid #1e1e2e', marginBottom: '16px', display: 'block', opacity: loading ? 0.5 : 1 },
    statusText: (isError: boolean) => ({ fontSize: '0.75rem', color: isError ? '#ff4d6d' : '#6b6b80', marginTop: '12px', textAlign: 'center' as const, minHeight: '18px' }),
    resultCard: { background: '#111118', border: '1px solid #1e1e2e', borderRadius: '16px', padding: '28px 24px', width: '100%', maxWidth: '420px' },
    bigLabel: { fontSize: '0.68rem', color: '#6b6b80', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: '4px' },
    bigNumber: (color: string) => ({ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '3.2rem', color, lineHeight: 1, letterSpacing: '-1px' }),
    bigUnit: { fontFamily: "'DM Mono', monospace", fontSize: '0.85rem', color: '#6b6b80', marginLeft: '6px' },
    badge: (pos: boolean) => ({ display: 'inline-flex', alignItems: 'center', gap: '6px', background: pos ? 'rgba(200,240,74,0.1)' : 'rgba(255,77,109,0.1)', border: `1px solid ${pos ? 'rgba(200,240,74,0.25)' : 'rgba(255,77,109,0.25)'}`, borderRadius: '20px', padding: '4px 12px', fontSize: '0.75rem', color: pos ? '#c8f04a' : '#ff4d6d', marginTop: '12px' }),
    dot: (pos: boolean) => ({ width: '7px', height: '7px', borderRadius: '50%', background: pos ? '#c8f04a' : '#ff4d6d', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }),
    divider: { borderTop: '1px solid #1e1e2e', margin: '20px 0' },
    metricRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #1e1e2e' },
    metricLabel: { fontSize: '0.78rem', color: '#6b6b80' },
    metricValue: (color: string) => ({ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '0.95rem', color }),
    ghostBtn: { background: 'transparent', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '12px', color: '#6b6b80', fontFamily: "'DM Mono', monospace", fontSize: '0.85rem', cursor: 'pointer', width: '100%', marginTop: '20px' },
    disclosureBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0 0', color: '#6b6b80', fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', width: '100%', marginTop: '4px' },
    assumptionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e1e2e' },
    assumptionLabel: { fontSize: '0.75rem', color: '#6b6b80' },
    assumptionInput: { background: '#0a0a0f', border: '1px solid #1e1e2e', borderRadius: '6px', padding: '5px 8px', color: '#e8e8f0', fontFamily: "'DM Mono', monospace", fontSize: '0.85rem', width: '110px', textAlign: 'right' as const, outline: 'none' },
    assumptionReadonly: { fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '0.85rem', color: '#6b6b80' },
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>

      <div style={S.wrapper}>
        <header style={S.header}>
          <div style={S.title}>Budget Pulse</div>
          <div style={S.sub}>SEK · Monthly</div>
        </header>

        {results ? (
          <div style={S.resultCard}>
            {/* Big number */}
            <div style={S.bigLabel}>Daily budget remaining</div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={S.bigNumber(results.daily >= baseline ? '#c8f04a' : '#ff4d6d')}>
                {fmt(results.daily)}
              </span>
              <span style={S.bigUnit}>SEK/day</span>
            </div>
            <div style={S.badge(results.buffer >= 0)}>
              <span style={S.dot(results.buffer >= 0)} />
              {results.buffer >= 0
                ? `${fmt(results.buffer)} ahead`
                : `${fmt(Math.abs(results.buffer))} behind`}
            </div>

            <div style={S.divider} />

            {/* Metrics */}
            {[
              {
                label: "Today's target balance",
                value: fmt(results.shouldHave) + ' SEK',
                color: '#e8e8f0',
              },
              {
                label: 'Actual balance',
                value: fmt(results.balance) + ' SEK',
                color: results.balance >= results.shouldHave ? '#c8f04a' : '#ff4d6d',
              },
              {
                label: 'Pace',
                value: results.buffer >= 0 ? 'Ahead' : 'Behind',
                color: results.buffer >= 0 ? '#c8f04a' : '#ff4d6d',
              },
              {
                label: 'Days until payday',
                value: String(results.daysLeft),
                color: '#e8e8f0',
              },
              {
                label: 'Projected at payday',
                value: (results.projectedAtPayday >= 0 ? '+' : '') + fmt(results.projectedAtPayday) + ' SEK',
                color: results.projectedAtPayday >= 0 ? '#c8f04a' : '#ff4d6d',
              },
            ].map((m) => (
              <div key={m.label} style={S.metricRow}>
                <span style={S.metricLabel}>{m.label}</span>
                <span style={S.metricValue(m.color)}>{m.value}</span>
              </div>
            ))}

            {/* Assumptions disclosure */}
            <button style={S.disclosureBtn} onClick={() => setAssumptionsOpen(o => !o)}>
              <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: assumptionsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              Assumptions
            </button>

            {assumptionsOpen && (
              <div style={{ paddingTop: '4px' }}>
                {([
                  { label: 'Salary (SEK)', key: 'salary' as const },
                  { label: 'Rent (SEK)', key: 'rent' as const },
                  { label: 'Payday (day)', key: 'paydayDay' as const },
                ]).map(({ label, key }) => (
                  <div key={key} style={S.assumptionRow}>
                    <span style={S.assumptionLabel}>{label}</span>
                    <input
                      type="number"
                      style={S.assumptionInput}
                      value={assumptions[key]}
                      onChange={(e) => handleAssumptionChange(key, e.target.value)}
                    />
                  </div>
                ))}
                <div style={S.assumptionRow}>
                  <span style={S.assumptionLabel}>Spendable (auto)</span>
                  <span style={S.assumptionReadonly}>{fmt(spendable)} SEK</span>
                </div>
                <div style={{ ...S.assumptionRow, borderBottom: 'none' }}>
                  <span style={S.assumptionLabel}>Baseline (auto)</span>
                  <span style={S.assumptionReadonly}>{fmt(baseline)} SEK/day · {cycleDays}d cycle</span>
                </div>
              </div>
            )}

            <button style={S.ghostBtn} onClick={handleReset}>↩ New Check</button>
          </div>
        ) : (
          <div style={S.card}>
            <div style={S.tabRow}>
              <button style={S.tab(tab === 'manual')} onClick={() => setTab('manual')}>✏️ Manual</button>
              <button style={S.tab(tab === 'screenshot')} onClick={handleSwitchToScreenshot}>📷 Screenshot</button>
            </div>

            {tab === 'manual' ? (
              <>
                <label style={S.label}>Current balance (SEK)</label>
                <input
                  type="number"
                  style={S.input}
                  placeholder={localStorage.getItem(STORAGE_KEY_BALANCE) ?? 'e.g. 14 350'}
                  value={manualBalance}
                  onChange={(e) => setManualBalance(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && manualBalance) handleShowResults(parseFloat(manualBalance)) }}
                />
                <button
                  style={{ ...S.btnAccent, opacity: !manualBalance ? 0.4 : 1 }}
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
                  <img src={imgSrc} alt="preview" style={S.imgPreview} />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) loadAndAnalyze(f) }}
                />
                <button style={S.btnAccent} disabled={loading} onClick={() => fileInputRef.current?.click()}>
                  📁 Choose from Library
                </button>
                <button style={S.btnOutline} disabled={loading} onClick={handleClipboard}>
                  📋 Paste from Clipboard
                </button>
                {status && (
                  <div style={S.statusText(status.startsWith('Error'))}>
                    {loading ? '⏳ ' : ''}{status}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
