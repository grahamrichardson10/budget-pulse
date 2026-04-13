'use client'

import { useState, useRef, useEffect } from 'react'

interface Assumptions {
  salary: number
  rent: number
  paydayDay: number
  marketRate: number
  dob: string
  retirementAge: number
}

const DEFAULT_ASSUMPTIONS: Assumptions = {
  salary: 34860,
  rent: 15000,
  paydayDay: 25,
  marketRate: 6,
  dob: '1993-09-07',
  retirementAge: 65,
}

const STORAGE_KEY_BALANCE = 'bp_last_balance'
const STORAGE_KEY_ASSUMPTIONS = 'bp_assumptions'

interface Results {
  balance: number
  daily: number
  daysLeft: number
  daysSince: number
  shouldHave: number
  buffer: number
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
  const daysSince = Math.floor((now.getTime() - cycleStart.getTime()) / 86400000)
  const daysLeft = Math.round((cycleEnd.getTime() - now.getTime()) / 86400000)
  const baseline = spendable / cycleDays
  const shouldHave = spendable - daysSince * baseline
  const buffer = balance - shouldHave
  const daily = Math.round(balance / daysLeft)
  return { balance, daily, daysLeft, daysSince, shouldHave, buffer, cycleDays }
}

function computeRetirementValue(amount: number, a: Assumptions): number {
  if (amount <= 0) return 0
  const dob = new Date(a.dob)
  const now = new Date()
  const ageYears = (now.getTime() - dob.getTime()) / (365.25 * 86400000)
  const yearsToRetirement = a.retirementAge - ageYears
  if (yearsToRetirement <= 0) return amount
  return amount * Math.pow(1 + a.marketRate / 100, yearsToRetirement)
}

function expectedBalanceForDay(date: Date, a: Assumptions): number {
  const spendable = a.salary - a.rent
  const dom = date.getDate()
  const cycleStart = dom >= a.paydayDay
    ? new Date(date.getFullYear(), date.getMonth(), a.paydayDay)
    : new Date(date.getFullYear(), date.getMonth() - 1, a.paydayDay)
  const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, a.paydayDay)
  const cycleDays = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 86400000)
  const daysElapsed = Math.floor((date.getTime() - cycleStart.getTime()) / 86400000)
  return Math.max(0, spendable - daysElapsed * (spendable / cycleDays))
}

function fmt(n: number) {
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(Math.round(n))
}

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

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_LABELS = ['M','T','W','T','F','S','S']

export default function Home() {
  const [tab, setTab] = useState<'manual' | 'screenshot'>('screenshot')
  const [manualBalance, setManualBalance] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS)
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)
  const [progressTooltipOpen, setProgressTooltipOpen] = useState(false)
  const [progressDetailOpen, setProgressDetailOpen] = useState(false)
  const [paceOpen, setPaceOpen] = useState(false)
  const [paceInvestOpen, setPaceInvestOpen] = useState(false)
  const [rateInputValue, setRateInputValue] = useState(String(DEFAULT_ASSUMPTIONS.marketRate))
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const spendable = assumptions.salary - assumptions.rent
  const cycleDays = results?.cycleDays ?? 30
  const baseline = Math.round(spendable / cycleDays)

  // Progress bar: bar = piggy bank, left=payday right=next payday
  // Dim marker = where spending should be; bright marker = where it actually is
  const amountSpent = results ? Math.max(0, spendable - results.balance) : 0
  const spentPct = results && spendable > 0 ? Math.min(100, (amountSpent / spendable) * 100) : 0
  const targetPct = results ? Math.min(100, (results.daysSince / results.cycleDays) * 100) : 0
  const isUnderBudget = results ? results.buffer >= 0 : true
  const accentColor = isUnderBudget ? '#c8f04a' : '#ff4d6d'

  // Pace disclosure calculations
  const avgSpend = results && results.daysSince > 0
    ? Math.max(0, (spendable - results.balance) / results.daysSince)
    : baseline
  const projectedEnd = results ? Math.round(results.balance - avgSpend * results.daysLeft) : 0
  const retirementValueFromBuffer = results ? computeRetirementValue(Math.max(0, results.buffer), assumptions) : 0
  const retirementValueFromEnd = projectedEnd > 0 ? computeRetirementValue(projectedEnd, assumptions) : 0

  // Calendar
  const now = new Date()
  const calYear = now.getFullYear()
  const calMonth = now.getMonth()
  const todayDate = now.getDate()
  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const calCells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (calCells.length % 7 !== 0) calCells.push(null)

  // DOB parsing
  const dobParts = assumptions.dob.split('-').map(Number)
  const dobYear = dobParts[0], dobMonth = dobParts[1], dobDay = dobParts[2]

  useEffect(() => {
    try {
      const savedBalance = localStorage.getItem(STORAGE_KEY_BALANCE)
      if (savedBalance) setManualBalance(savedBalance)
      const savedAssumptions = localStorage.getItem(STORAGE_KEY_ASSUMPTIONS)
      if (savedAssumptions) {
        const parsed = JSON.parse(savedAssumptions)
        setAssumptions(parsed)
        if (parsed.marketRate != null) setRateInputValue(String(parsed.marketRate))
      }
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

  function handleAssumptionChange(key: keyof Omit<Assumptions, 'dob'>, value: string) {
    const n = parseFloat(value)
    if (isNaN(n)) return
    const next = { ...assumptions, [key]: n }
    setAssumptions(next)
    if (key === 'marketRate') setRateInputValue(String(n))
    try { localStorage.setItem(STORAGE_KEY_ASSUMPTIONS, JSON.stringify(next)) } catch { /* ignore */ }
    if (results) setResults(computeResults(results.balance, next))
  }

  function handleDobChange(part: 'day' | 'month' | 'year', value: string) {
    let y = dobYear, m = dobMonth, d = dobDay
    if (part === 'year') y = parseInt(value)
    if (part === 'month') m = parseInt(value)
    if (part === 'day') d = parseInt(value)
    const newDob = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const next = { ...assumptions, dob: newDob }
    setAssumptions(next)
    try { localStorage.setItem(STORAGE_KEY_ASSUMPTIONS, JSON.stringify(next)) } catch { /* ignore */ }
    if (results) setResults(computeResults(results.balance, next))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (results) handleReset()
    setTab('screenshot')
    loadAndAnalyze(file)
  }

  function handleReset() {
    setResults(null)
    setImgSrc(null)
    setStatus('')
    setProgressTooltipOpen(false)
    setProgressDetailOpen(false)
    setPaceOpen(false)
    setPaceInvestOpen(false)
    setCalendarOpen(false)
  }

  async function loadAndAnalyze(file: File) {
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
    tabBtn: (active: boolean) => ({ flex: 1, padding: '9px 0', borderRadius: '8px', border: active ? 'none' : '1px solid #1e1e2e', background: active ? '#c8f04a' : 'transparent', color: active ? '#0a0a0f' : '#6b6b80', fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', fontWeight: active ? 500 : 400, cursor: 'pointer' }),
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
    dobSelect: { background: '#0a0a0f', border: '1px solid #1e1e2e', borderRadius: '6px', padding: '5px 4px', color: '#e8e8f0', fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', outline: 'none', cursor: 'pointer' },
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
          <div
            style={{ ...S.resultCard, border: dragOver ? '1px solid #c8f04a' : S.resultCard.border }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >

            {/* ── Big number ── */}
            <div style={S.bigLabel}>Daily budget remaining</div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={S.bigNumber(results.daily >= baseline ? '#c8f04a' : '#ff4d6d')}>
                {fmt(results.daily)}
              </span>
              <span style={S.bigUnit}>SEK/day</span>
            </div>
            <div style={S.badge(isUnderBudget)}>
              <span style={S.dot(isUnderBudget)} />
              {isUnderBudget ? `${fmt(results.buffer)} ahead` : `${fmt(Math.abs(results.buffer))} behind`}
            </div>

            {/* ── Progress bar ── */}
            <div style={{ margin: '18px 0 4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '0.6rem', color: '#6b6b80' }}>payday</span>
                <span style={{ fontSize: '0.6rem', color: '#6b6b80' }}>next payday</span>
              </div>
              <div
                style={{ position: 'relative', height: '32px', background: '#0a0a0f', border: '1px solid #1e1e2e', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer' }}
                onClick={() => setProgressTooltipOpen(o => !o)}
              >
                {/* Shading behind target marker */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${targetPct}%`, background: 'rgba(100,100,130,0.12)' }} />
                {/* Dim marker: target spend position */}
                <div style={{ position: 'absolute', top: '4px', bottom: '4px', left: `calc(${targetPct}% - 1px)`, width: '2px', borderRadius: '1px', background: '#3a3a5c' }} />
                {/* Bright marker: actual spend position */}
                <div style={{ position: 'absolute', top: '2px', bottom: '2px', left: `calc(${spentPct}% - 1px)`, width: '3px', borderRadius: '2px', background: accentColor }} />
              </div>

              {progressTooltipOpen && (
                <div style={{ background: '#0a0a0f', border: `1px solid ${isUnderBudget ? 'rgba(200,240,74,0.2)' : 'rgba(255,77,109,0.2)'}`, borderRadius: '8px', padding: '10px 12px', marginTop: '6px' }}>
                  <div style={{ fontSize: '0.78rem', color: accentColor, fontFamily: "'DM Mono', monospace" }}>
                    {isUnderBudget
                      ? `In the green by ${fmt(results.buffer)} SEK`
                      : `In the red by ${fmt(Math.abs(results.buffer))} SEK`}
                  </div>
                  <button
                    style={{ background: 'none', border: 'none', color: '#6b6b80', fontSize: '0.65rem', fontFamily: "'DM Mono', monospace", cursor: 'pointer', padding: '6px 0 2px', display: 'block' }}
                    onClick={e => { e.stopPropagation(); setProgressDetailOpen(o => !o) }}
                  >
                    {progressDetailOpen ? '▲ hide' : '▼ how does this work?'}
                  </button>
                  {progressDetailOpen && (
                    <p style={{ fontSize: '0.7rem', color: '#9090a0', margin: '4px 0 0', lineHeight: 1.55 }}>
                      {isUnderBudget
                        ? `Your target is to spend ${fmt(baseline)} SEK/day so your balance reaches zero by payday. You've spent less than planned — your money is lasting longer than expected. The bright green line is to the left of the dim target marker.`
                        : `Your target is to spend ${fmt(baseline)} SEK/day so your balance reaches zero by payday. You've spent more than planned — your money is running out faster than expected. The red line is to the right of the dim target marker.`}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div style={S.divider} />

            {/* ── Today's target balance + calendar toggle ── */}
            <div style={S.metricRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={S.metricLabel}>Today&apos;s target balance</span>
                <button
                  onClick={() => setCalendarOpen(o => !o)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.85rem', lineHeight: 1, opacity: calendarOpen ? 1 : 0.45, transition: 'opacity 0.15s' }}
                >
                  📅
                </button>
              </div>
              <span style={S.metricValue('#e8e8f0')}>{fmt(results.shouldHave)} SEK</span>
            </div>

            {/* ── Calendar (hidden by default) ── */}
            {calendarOpen && (
              <div style={{ marginBottom: '4px' }}>
                <div style={{ fontSize: '0.65rem', color: '#6b6b80', letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: '8px 0' }}>
                  {MONTH_FULL[calMonth]} {calYear}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                  {DOW_LABELS.map((d, i) => (
                    <div key={i} style={{ textAlign: 'center' as const, fontSize: '0.58rem', color: '#6b6b80', paddingBottom: '3px', fontFamily: "'DM Mono', monospace" }}>{d}</div>
                  ))}
                  {calCells.map((day, i) => {
                    if (!day) return <div key={i} />
                    const isToday = day === todayDate
                    const isPayday = day === assumptions.paydayDay
                    const isPast = day < todayDate
                    const bal = expectedBalanceForDay(new Date(calYear, calMonth, day), assumptions)
                    return (
                      <div key={i} style={{
                        background: isToday ? '#c8f04a' : '#0a0a0f',
                        border: isPayday && !isToday ? '2px solid #c8f04a' : '1px solid #1e1e2e',
                        borderRadius: '6px',
                        padding: '4px 2px',
                        textAlign: 'center' as const,
                        opacity: isPast && !isToday ? 0.4 : 1,
                        minHeight: '44px',
                        display: 'flex',
                        flexDirection: 'column' as const,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                      }}>
                        <span style={{ fontSize: '0.65rem', color: isToday ? '#0a0a0f' : '#e8e8f0', fontFamily: "'DM Mono', monospace", fontWeight: isToday ? 700 : 400 }}>{day}</span>
                        <span style={{ fontSize: '0.55rem', color: isToday ? '#1a1a2e' : '#6b6b80', fontFamily: "'DM Mono', monospace" }}>{fmtK(bal)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Actual balance ── */}
            <div style={S.metricRow}>
              <span style={S.metricLabel}>Actual balance</span>
              <span style={S.metricValue(results.balance >= results.shouldHave ? '#c8f04a' : '#ff4d6d')}>{fmt(results.balance)} SEK</span>
            </div>

            {/* ── Pace row — expandable ── */}
            <div>
              <div
                style={{ ...S.metricRow, cursor: 'pointer' }}
                onClick={() => setPaceOpen(o => !o)}
              >
                <span style={S.metricLabel}>Pace</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '0.82rem', color: accentColor }}>
                    {isUnderBudget
                      ? `Under budget · ${fmt(results.buffer)} SEK`
                      : `Over budget · ${fmt(Math.abs(results.buffer))} SEK`}
                  </span>
                  <span style={{ color: '#6b6b80', fontSize: '0.6rem', display: 'inline-block', transition: 'transform 0.2s', transform: paceOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </div>
              </div>

              {paceOpen && (
                <div style={{ background: '#0a0a0f', border: '1px solid #1e1e2e', borderRadius: '8px', padding: '12px 14px', margin: '4px 0 4px' }}>

                  {/* Investment of buffer */}
                  <div style={{ fontSize: '0.72rem', color: '#9090a0', lineHeight: 1.7, paddingBottom: '10px', borderBottom: '1px solid #1e1e2e', marginBottom: '10px' }}>
                    If you invested{' '}
                    <span style={{ color: '#e8e8f0' }}>{fmt(Math.max(0, results.buffer))} SEK</span>
                    {' '}today at{' '}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rateInputValue}
                      onChange={e => {
                        setRateInputValue(e.target.value)
                        const n = parseFloat(e.target.value)
                        if (!isNaN(n)) handleAssumptionChange('marketRate', e.target.value)
                      }}
                      onBlur={() => {
                        const n = parseFloat(rateInputValue)
                        if (isNaN(n)) setRateInputValue(String(assumptions.marketRate))
                      }}
                      onClick={e => e.stopPropagation()}
                      onTouchStart={e => e.stopPropagation()}
                      onTouchEnd={e => e.stopPropagation()}
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #c8f04a', color: '#c8f04a', fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', width: '28px', outline: 'none', textAlign: 'center' as const, padding: '0 1px' }}
                    />
                    {'% return → '}
                    <span style={{ color: '#c8f04a', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '0.8rem' }}>
                      {fmt(retirementValueFromBuffer)} SEK
                    </span>
                    {' at retirement (age '}{assumptions.retirementAge}{')'}
                  </div>

                  {/* Average spend + end-of-cycle projection */}
                  {results.daysSince > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: '0.7rem', color: '#6b6b80' }}>Avg spend/day (excl. rent)</span>
                        <span style={{ fontSize: '0.7rem', color: '#e8e8f0', fontFamily: "'DM Mono', monospace" }}>{fmt(avgSpend)} SEK</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: '0.7rem', color: '#6b6b80' }}>At this rate, end of cycle</span>
                        <span style={{ fontSize: '0.7rem', color: projectedEnd >= 0 ? '#c8f04a' : '#ff4d6d', fontFamily: "'DM Mono', monospace" }}>{fmt(projectedEnd)} SEK</span>
                      </div>

                      {projectedEnd > 0 && (
                        <>
                          <button
                            style={{ background: 'none', border: 'none', color: '#6b6b80', fontSize: '0.62rem', fontFamily: "'DM Mono', monospace", cursor: 'pointer', padding: '6px 0 0', display: 'block' }}
                            onClick={e => { e.stopPropagation(); setPaceInvestOpen(o => !o) }}
                          >
                            {paceInvestOpen ? '▲ hide' : `▼ if invested until age ${assumptions.retirementAge}`}
                          </button>
                          {paceInvestOpen && (
                            <div style={{ fontSize: '0.72rem', color: '#9090a0', lineHeight: 1.7, paddingTop: '6px' }}>
                              {fmt(projectedEnd)} SEK at {assumptions.marketRate}% →{' '}
                              <span style={{ color: '#c8f04a', fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>
                                {fmt(retirementValueFromEnd)} SEK
                              </span>
                              {' at age '}{assumptions.retirementAge}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Days since / until payday ── */}
            <div style={S.metricRow}>
              <span style={S.metricLabel}>Days since / until payday</span>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '0.95rem' }}>
                <span style={{ color: '#e8e8f0' }}>{results.daysSince}</span>
                <span style={{ color: '#6b6b80', fontWeight: 400, fontFamily: "'DM Mono', monospace", fontSize: '0.85rem' }}> / </span>
                <span style={{ color: '#c8f04a' }}>{results.daysLeft}</span>
              </div>
            </div>

            {/* ── Assumptions disclosure ── */}
            <button style={S.disclosureBtn} onClick={() => setAssumptionsOpen(o => !o)}>
              <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: assumptionsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              Assumptions
            </button>

            {assumptionsOpen && (
              <div style={{ paddingTop: '4px' }}>
                {([
                  { label: 'Salary (SEK)', key: 'salary' as const },
                  { label: 'Rent (SEK)', key: 'rent' as const },
                  { label: 'Payday (day of month)', key: 'paydayDay' as const },
                  { label: 'Market rate (%)', key: 'marketRate' as const },
                  { label: 'Retirement age', key: 'retirementAge' as const },
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
                  <span style={S.assumptionLabel}>Date of birth</span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <select value={dobDay} onChange={e => handleDobChange('day', e.target.value)} style={S.dobSelect}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <select value={dobMonth} onChange={e => handleDobChange('month', e.target.value)} style={S.dobSelect}>
                      {MONTH_NAMES.map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                    <select value={dobYear} onChange={e => handleDobChange('year', e.target.value)} style={S.dobSelect}>
                      {Array.from({ length: 80 }, (_, i) => 2005 - i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

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
          <div
            style={{ ...S.card, border: dragOver ? '1px solid #c8f04a' : S.card.border }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div style={S.tabRow}>
              <button style={S.tabBtn(tab === 'manual')} onClick={() => setTab('manual')}>✏️ Manual</button>
              <button style={S.tabBtn(tab === 'screenshot')} onClick={handleSwitchToScreenshot}>📷 Screenshot</button>
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
                <button style={S.btnAccent} disabled={loading} onClick={handleClipboard}>
                  📋 Paste from Clipboard
                </button>
                <button style={S.btnOutline} disabled={loading} onClick={() => fileInputRef.current?.click()}>
                  📁 Choose from Library
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
