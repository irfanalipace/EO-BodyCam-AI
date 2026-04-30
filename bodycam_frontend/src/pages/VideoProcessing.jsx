import React, { useState, useEffect, useCallback } from 'react'
import { SeverityBadge, ScoreRing, ScoreBar, Spinner, C, SEV } from '../components/UI'
import ApiService from '../services/api'

// ── Status colors (matches the dark theme palette) ─────────────────────
const STATUS_STYLE = {
  PENDING:    { bg:'rgba(100,116,139,0.12)', border:'rgba(100,116,139,0.3)', text:'#94A3B8', icon:'◷' },
  PROCESSING: { bg:'rgba(59,130,246,0.12)',  border:'rgba(59,130,246,0.3)',  text:'#3B82F6', icon:'⟳' },
  COMPLETED:  { bg:'rgba(16,185,129,0.12)',  border:'rgba(16,185,129,0.3)',  text:'#10B981', icon:'✓' },
  FAILED:     { bg:'rgba(239,68,68,0.12)',   border:'rgba(239,68,68,0.3)',   text:'#EF4444', icon:'✕' },
}

const STATUS_FILTERS   = ['ALL','PENDING','PROCESSING','COMPLETED','FAILED']
const SEVERITY_FILTERS = ['ALL','NORMAL','WARNING','CRITICAL']

const LABEL = { fontSize:'10px', color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'8px', display:'block' }

// ── Small formatting helpers ───────────────────────────────────────────
const fmtBytes = b => {
  if (!b && b !== 0) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`
  if (b < 1024*1024*1024) return `${(b/1024/1024).toFixed(1)} MB`
  return `${(b/1024/1024/1024).toFixed(2)} GB`
}
const fmtSec = s => {
  if (s == null) return '—'
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s/60), r = (s%60).toFixed(0)
  return `${m}m ${r}s`
}
const fmtTime = t => t ? new Date(t).toLocaleString() : '—'
const fmtRel = t => {
  if (!t) return '—'
  const d = (Date.now() - new Date(t).getTime()) / 1000
  if (d < 60)        return `${Math.floor(d)}s ago`
  if (d < 3600)      return `${Math.floor(d/60)}m ago`
  if (d < 86400)     return `${Math.floor(d/3600)}h ago`
  return `${Math.floor(d/86400)}d ago`
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.PENDING
  const animated = status === 'PROCESSING'
  return (
    <span style={{ background:s.bg, color:s.text, border:`1px solid ${s.border}`,
      padding:'4px 10px', borderRadius:'14px', fontSize:'10px',
      fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase',
      display:'inline-flex', alignItems:'center', gap:'5px' }}>
      <span style={{ animation: animated ? 'spin 1.4s linear infinite' : 'none', display:'inline-block' }}>
        {s.icon}
      </span>
      {status}
    </span>
  )
}

// Convert KeywordsFound (comma-separated string) into an array.
const parseKeywords = kw => {
  if (!kw) return []
  if (Array.isArray(kw)) return kw
  return String(kw).split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Force the transcribed text to drop to a NEW LINE right after each
 * [mm:ss] / [hh:mm:ss] timestamp marker, so a "[00:15] السلام علیکم"
 * utterance renders as:
 *   [00:15]
 *   السلام علیکم
 * Defensive: if the model produced timestamps with no text after them,
 * or no timestamps at all, the original string is returned untouched.
 */
const formatTranscript = t => {
  if (!t) return ''
  return String(t)
    // Newline immediately after the closing bracket if followed by
    // (zero or more) horizontal whitespace then a non-newline character.
    .replace(/(\[\d{1,2}:\d{2}(?::\d{2})?\])[ \t]+(?=\S)/g, '$1\n')
    // Tidy any accidental double newlines.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── One item in the queue list ─────────────────────────────────────────
function QueueRow({ item, selected, onClick }) {
  const score = item.totalScore ?? null
  const sev   = item.severity || (item.status === 'COMPLETED' ? 'NORMAL' : null)
  const col   = score == null ? '#475569'
                : score >= 70 ? '#EF4444'
                : score >= 40 ? '#F59E0B' : '#10B981'

  return (
    <div onClick={onClick} className="fade-in"
      style={{ background:'#111827',
        border:`1px solid ${selected ? '#3B82F6' : '#1F2937'}`,
        borderRadius:'12px', padding:'14px 16px', cursor:'pointer',
        marginBottom:'8px', transition:'all .15s',
        boxShadow: selected ? '0 0 0 2px rgba(59,130,246,0.2)' : 'none' }}>

      <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px', flexWrap:'wrap' }}>
            <StatusBadge status={item.status}/>
            {sev && <SeverityBadge severity={sev} showIcon={false}/>}
            <span style={{ fontFamily:'monospace', fontSize:'10px', color:'#475569' }}>#{item.id}</span>
          </div>
          <div style={{ fontSize:'13px', fontWeight:700, color:'#F1F5F9',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:'4px' }}
            title={item.fileName}>
            {item.fileName}
          </div>
          <div style={{ fontSize:'11px', color:'#64748B', display:'flex', gap:'10px', flexWrap:'wrap' }}>
            <span>{item.officerId || 'EO_UNKNOWN'}</span>
            <span>·</span>
            <span>{fmtBytes(item.fileSizeBytes)}</span>
            {item.processingTimeSec != null && (
              <><span>·</span><span>⏱ {fmtSec(item.processingTimeSec)}</span></>
            )}
            {item.totalTokenCount > 0 && (
              <><span>·</span><span>{item.totalTokenCount.toLocaleString()} tok</span></>
            )}
            <span>·</span>
            <span title={fmtTime(item.discoveredAt)}>{fmtRel(item.discoveredAt)}</span>
          </div>
          {item.errorMessage && (
            <div style={{ marginTop:'6px', fontSize:'11px', color:'#FCA5A5',
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
              borderRadius:'6px', padding:'5px 8px',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
              title={item.errorMessage}>
              ⚠ {item.errorMessage}
            </div>
          )}
        </div>

        {score != null && (
          <div style={{ textAlign:'right', flexShrink:0, minWidth:'60px' }}>
            <div style={{ fontSize:'22px', fontWeight:800, color:col, lineHeight:1 }}>{score}</div>
            <div style={{ width:'52px', marginTop:'4px' }}><ScoreBar score={score} height={3}/></div>
            <div style={{ fontSize:'10px', color:'#64748B', marginTop:'4px' }}>
              {item.violationCount ?? 0} viol.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Detail panel for the selected row ──────────────────────────────────
function DetailPanel({ data }) {
  const [showRaw, setShowRaw] = useState(false)
  const a = data.analysis
  const sev = a?.severity || 'NORMAL'
  const score = a?.totalScore ?? 0

  const emotions = a ? [
    ['Anger',        a.emotionAnger,       '#EF4444'],
    ['Frustration',  a.emotionFrustration, '#F97316'],
    ['Contempt',     a.emotionContempt,    '#A855F7'],
    ['Intimidation', a.emotionIntimidation,'#8B5CF6'],
    ['Fear',         a.emotionFear,        '#06B6D4'],
    ['Calm',         a.emotionCalm,        '#10B981'],
    ['Neutral',      a.emotionNeutral,     '#64748B'],
    ['Agitation',    a.emotionAgitation,   '#EAB308'],
  ] : []

  return (
    <div className="slide-in" style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

      {/* Header card: score + severity + officer */}
      <div style={{ ...C.card, display:'flex', gap:'18px', alignItems:'center' }}>
        {a
          ? <ScoreRing score={score} severity={sev} size={100}/>
          : <div style={{ width:100, height:100, borderRadius:'50%',
              background:'#0B0F1A', border:'2px dashed #334155',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#475569', fontSize:'11px', textAlign:'center' }}>
              No analysis<br/>yet
            </div>}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center', flexWrap:'wrap' }}>
            <StatusBadge status={data.status}/>
            {a && <SeverityBadge severity={sev}/>}
            {a && <span style={{ fontSize:'11px', color:'#94A3B8' }}>
              tone <strong style={{ color:'#F1F5F9' }}>{a.toneLabel}</strong>
            </span>}
          </div>
          <div style={{ fontSize:'15px', fontWeight:800, color:'#F1F5F9',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:'4px' }}
            title={data.fileName}>
            {data.fileName}
          </div>
          <div style={{ fontSize:'12px', color:'#64748B' }}>
            {data.officerName || data.officerId || 'EO_UNKNOWN'}
            {data.officerBadge ? ` · #${data.officerBadge}` : ''}
            {data.mediaType ? ` · ${data.mediaType}` : ''}
            {data.durationSeconds != null && data.durationSeconds > 0 ? ` · ${fmtSec(data.durationSeconds)}` : ''}
          </div>
        </div>
      </div>

      {/* Error banner if failed */}
      {data.status === 'FAILED' && data.errorMessage && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)',
          borderRadius:'12px', padding:'14px 16px' }}>
          <div style={{ ...LABEL, color:'#EF4444', marginBottom:'6px' }}>Error</div>
          <div style={{ fontSize:'12px', color:'#FCA5A5', lineHeight:1.6, fontFamily:'monospace' }}>
            {data.errorMessage}
          </div>
          <div style={{ fontSize:'11px', color:'#64748B', marginTop:'8px' }}>
            Attempt {data.attemptCount}
          </div>
        </div>
      )}

      {/* Processing timeline + tokens */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
        <div style={C.card_sm}>
          <span style={LABEL}>Timeline</span>
          <Row k="Discovered"  v={fmtTime(data.discoveredAt)}/>
          <Row k="Started"     v={fmtTime(data.startedAt)}/>
          <Row k="Finished"    v={fmtTime(data.finishedAt)}/>
          <Row k="Duration"    v={fmtSec(data.processingTimeSec)} bold/>
          <Row k="Attempts"    v={data.attemptCount}/>
        </div>
        <div style={C.card_sm}>
          <span style={LABEL}>Token Usage (Gemini)</span>
          <Row k="Prompt"      v={data.promptTokenCount?.toLocaleString() ?? 0}/>
          <Row k="Candidates"  v={data.candidatesTokenCount?.toLocaleString() ?? 0}/>
          <Row k="Total"       v={data.totalTokenCount?.toLocaleString() ?? 0} bold highlight/>
          <div style={{ marginTop:'10px', paddingTop:'8px', borderTop:'1px solid #1F2937' }}>
            <span style={LABEL}>File</span>
            <Row k="Size"      v={fmtBytes(data.fileSizeBytes)}/>
            <Row k="Folder"    v={data.sourceFolder} mono/>
          </div>
        </div>
      </div>

      {/* Sub-scores */}
      {a && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }}>
          {[
            ['Tone score',     a.toneScore,    '#3B82F6'],
            ['Keyword score',  a.kwScore,      '#A855F7'],
            ['Critical / High / Med', `${a.criticalCount} / ${a.highCount} / ${a.mediumCount}`, '#F59E0B'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ ...C.card_sm }}>
              <div style={LABEL}>{l}</div>
              <div style={{ fontSize:'18px', fontWeight:800, color:c }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Transcript — Urdu only, with the spoken text on a new line after each [mm:ss] */}
      {a && a.transcriptUrdu && (
        <div style={C.card}>
          <span style={LABEL}>Transcript (Urdu)</span>
          <div style={{ fontSize:'13px', color:'#E2E8F0', lineHeight:1.85, direction:'rtl',
            background:'#0B0F1A', borderRadius:'8px', padding:'14px 16px',
            borderRight:'3px solid #3B82F6', fontFamily:'system-ui, sans-serif',
            // pre-wrap so the \n we inject after each [mm:ss] timestamp renders as a real
            // line break, while normal word-wrapping still applies to long lines.
            whiteSpace:'pre-wrap' }}>
            {formatTranscript(a.transcriptUrdu)}
          </div>
          {a.transcriptionMethod && (
            <div style={{ marginTop:'10px', fontSize:'10px', color:'#64748B' }}>
              Method: <strong style={{ color:'#94A3B8' }}>{a.transcriptionMethod}</strong>
            </div>
          )}
        </div>
      )}

      {/* AI assessment + recommended action */}
      {a && (a.aiAssessment || a.recommendedAction) && (
        <div style={C.card}>
          <span style={LABEL}>AI Assessment</span>
          {a.aiAssessment && (
            <div style={{ fontSize:'13px', color:'#E2E8F0', lineHeight:1.7, marginBottom:'12px' }}>
              {a.aiAssessment}
            </div>
          )}
          {a.recommendedAction && (
            <div style={{ background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.3)',
              borderRadius:'10px', padding:'12px 14px' }}>
              <div style={{ ...LABEL, color:'#3B82F6', marginBottom:'4px' }}>Recommended action</div>
              <div style={{ fontSize:'13px', color:'#E2E8F0', fontWeight:600 }}>
                {a.recommendedAction}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Emotion breakdown */}
      {a && emotions.some(([,v]) => v > 0) && (
        <div style={C.card}>
          <span style={LABEL}>Emotion breakdown · dominant: {a.dominantEmotion || '—'}</span>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            {emotions.map(([name, val, color]) => (
              <div key={name} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:'90px', fontSize:'11px', color:'#94A3B8' }}>{name}</div>
                <div style={{ flex:1, background:'#1F2937', borderRadius:'4px', overflow:'hidden', height:'8px' }}>
                  <div style={{ height:'100%', width:`${Math.min(val||0,100)}%`,
                    background:color, borderRadius:'4px', transition:'width .6s ease' }}/>
                </div>
                <div style={{ width:'34px', textAlign:'right', fontSize:'11px',
                  fontWeight:700, color:val > 0 ? color : '#475569' }}>{val||0}%</div>
              </div>
            ))}
          </div>
          {a.emotionNarrative && (
            <div style={{ marginTop:'12px', fontSize:'12px', color:'#94A3B8',
              fontStyle:'italic', lineHeight:1.6 }}>
              {a.emotionNarrative}
            </div>
          )}
        </div>
      )}

      {/* Violations */}
      <div style={C.card}>
        <span style={LABEL}>Violations ({data.violations?.length || 0})</span>
        {!data.violations || data.violations.length === 0 ? (
          <div style={{ textAlign:'center', padding:'20px', color:'#10B981',
            fontSize:'13px', fontWeight:600 }}>
            ✓ No violations detected
          </div>
        ) : (
          data.violations.map((v, i) => <ViolationRow key={v.id || i} v={v} index={i}/>)
        )}
      </div>

      {/* Raw JSON viewer (collapsed by default) */}
      {a?.rawJson && (
        <div style={C.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={LABEL}>Raw Gemini Response</span>
            <button onClick={() => setShowRaw(s => !s)}
              style={{ background:'transparent', border:'1px solid #334155', borderRadius:'6px',
                color:'#94A3B8', fontSize:'11px', padding:'4px 10px', cursor:'pointer' }}>
              {showRaw ? 'Hide' : 'Show'}
            </button>
          </div>
          {showRaw && (
            <pre style={{ marginTop:'10px', maxHeight:'320px', overflow:'auto',
              background:'#0B0F1A', borderRadius:'8px', padding:'12px',
              fontSize:'10px', color:'#94A3B8', lineHeight:1.5 }}>
              {(() => { try { return JSON.stringify(JSON.parse(a.rawJson), null, 2) }
                       catch { return a.rawJson } })()}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ k, v, bold = false, mono = false, highlight = false }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:'8px',
      padding:'4px 0', fontSize:'12px' }}>
      <span style={{ color:'#64748B' }}>{k}</span>
      <span style={{
        color: highlight ? '#3B82F6' : '#E2E8F0',
        fontWeight: bold ? 700 : 500,
        fontFamily: mono ? 'monospace' : 'inherit',
        fontSize: mono ? '11px' : '12px',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        maxWidth:'60%', textAlign:'right' }} title={String(v)}>
        {v}
      </span>
    </div>
  )
}

function ViolationRow({ v, index }) {
  const palette = {
    CRITICAL: { bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.25)',  edge:'#EF4444', text:'#FCA5A5' },
    HIGH:     { bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.25)', edge:'#F59E0B', text:'#FCD34D' },
    MEDIUM:   { bg:'rgba(59,130,246,0.08)', border:'rgba(59,130,246,0.25)', edge:'#3B82F6', text:'#93C5FD' },
    LOW:      { bg:'rgba(100,116,139,0.08)',border:'rgba(100,116,139,0.25)',edge:'#64748B', text:'#94A3B8' },
  }
  const p = palette[v.severity] || palette.LOW
  const kws = parseKeywords(v.keywordsFound)
  return (
    <div className="fade-in" style={{ background:p.bg, border:`1px solid ${p.border}`,
      borderLeft:`4px solid ${p.edge}`, borderRadius:'12px', padding:'14px 16px',
      marginBottom:'8px', animationDelay:`${index * 0.05}s` }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:'12px' }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', gap:'6px', alignItems:'center', marginBottom:'6px', flexWrap:'wrap' }}>
            <span style={{ background:p.edge, color:'#fff', fontSize:'10px',
              fontWeight:800, padding:'2px 8px', borderRadius:'4px',
              letterSpacing:'0.06em' }}>{v.severity || v.severityLabel || 'LOW'}</span>
            <span style={{ fontSize:'13px', fontWeight:700, color:'#F1F5F9' }}>
              {(v.label || v.type || '').replace(/_/g,' ')}
            </span>
            {v.type && (
              <span style={{ fontSize:'10px', color:'#64748B',
                fontFamily:'monospace' }}>{v.type}</span>
            )}
          </div>
          {v.description && (
            <div style={{ fontSize:'12px', color:'#94A3B8', lineHeight:1.6 }}>
              {v.description}
            </div>
          )}
          {kws.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginTop:'8px' }}>
              {kws.map((k,i) => (
                <span key={i} style={{ background:`${p.edge}20`, color:p.text,
                  fontSize:'11px', padding:'3px 9px', borderRadius:'5px',
                  fontWeight:600, border:`1px solid ${p.edge}40` }}>{k}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ background:`linear-gradient(135deg, ${p.edge}, ${p.edge}CC)`,
          color:'#fff', fontSize:'13px', fontWeight:800, padding:'6px 12px',
          borderRadius:'10px', whiteSpace:'nowrap', minWidth:'52px', textAlign:'center',
          height:'28px' }}>
          +{v.score || 0}
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function VideoProcessing() {
  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoad]  = useState(true)
  const [autoRefresh, setAR]= useState(true)
  const [statusF, setStatusF] = useState('ALL')
  const [sevF,    setSevF]    = useState('ALL')
  const [page,    setPage]    = useState(1)
  const pageSize = 25
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDL] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoad(true); setError(null)
    try {
      const params = { page, pageSize }
      if (statusF !== 'ALL') params.status   = statusF
      if (sevF    !== 'ALL') params.severity = sevF
      const r = await ApiService.getVideoProcessing(params)
      setItems(r.data.items || [])
      setTotal(r.data.total || 0)
    } catch (e) {
      setError(e?.message || 'Failed to load video processing queue')
    } finally {
      setLoad(false)
    }
  }, [statusF, sevF, page])

  useEffect(() => { load() }, [load])

  // Poll every 8s while auto-refresh is on — so PENDING → PROCESSING → COMPLETED is visible.
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => { load() }, 8000)
    return () => clearInterval(t)
  }, [autoRefresh, load])

  // Detail loader
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setDL(true)
    ApiService.getVideoProcessingDetail(selectedId)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setDL(false))
  }, [selectedId])

  // When auto-refreshing, also refresh the open detail panel.
  useEffect(() => {
    if (!autoRefresh || !selectedId) return
    const t = setInterval(() => {
      ApiService.getVideoProcessingDetail(selectedId)
        .then(r => setDetail(r.data))
        .catch(() => {})
    }, 8000)
    return () => clearInterval(t)
  }, [autoRefresh, selectedId])

  // ── Counters for the header ────────────────────────────────────────
  const counts = items.reduce((acc, it) => {
    acc[it.status] = (acc[it.status] || 0) + 1
    return acc
  }, {})

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const totalTokens = items.reduce((s, x) => s + (x.totalTokenCount || 0), 0)

  return (
    <div style={{ padding:'28px', maxWidth:'1500px' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
        marginBottom:'20px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:800, color:'#F1F5F9', marginBottom:'6px',
            letterSpacing:'-0.01em' }}>
            Video Processing
          </h1>
          <p style={{ fontSize:'13px', color:'#64748B' }}>
            Background folder watcher · {total.toLocaleString()} files · {totalTokens.toLocaleString()} tokens (this page)
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'6px',
            fontSize:'12px', color:'#94A3B8', cursor:'pointer' }}>
            <input type="checkbox" checked={autoRefresh}
              onChange={e => setAR(e.target.checked)}
              style={{ accentColor:'#3B82F6' }}/>
            Auto-refresh (8s)
          </label>
          <button onClick={load} disabled={loading}
            style={{ padding:'7px 14px', background:'#1F2937', border:'1px solid #334155',
              borderRadius:'8px', color:'#E2E8F0', fontSize:'12px', cursor:'pointer',
              opacity: loading ? 0.6 : 1 }}>
            {loading ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Status counters strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'10px', marginBottom:'16px' }}>
        {STATUS_FILTERS.slice(1).map(s => {
          const sty = STATUS_STYLE[s]
          return (
            <div key={s} onClick={() => { setStatusF(s); setPage(1) }}
              style={{ background: statusF === s ? sty.bg : '#111827',
                border:`1px solid ${statusF === s ? sty.border : '#1F2937'}`,
                borderRadius:'12px', padding:'14px 16px', cursor:'pointer',
                transition:'all .15s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                <span style={{ color:sty.text, fontSize:'14px',
                  animation: s === 'PROCESSING' ? 'spin 1.4s linear infinite' : 'none' }}>{sty.icon}</span>
                <span style={{ fontSize:'10px', fontWeight:700,
                  color:sty.text, textTransform:'uppercase', letterSpacing:'0.06em' }}>{s}</span>
              </div>
              <div style={{ fontSize:'22px', fontWeight:800, color:'#F1F5F9' }}>
                {(counts[s] || 0).toLocaleString()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Filter chips */}
      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px',
        alignItems:'center' }}>
        <span style={{ fontSize:'10px', color:'#64748B',
          letterSpacing:'0.08em', fontWeight:700, marginRight:'4px' }}>STATUS</span>
        {STATUS_FILTERS.map(f => (
          <button key={f} onClick={() => { setStatusF(f); setPage(1); setSelectedId(null) }}
            style={{ padding:'5px 12px', borderRadius:'18px',
              fontSize:'11px', fontWeight:700, cursor:'pointer',
              background: statusF === f ? '#3B82F6' : '#1F2937',
              color:     statusF === f ? '#fff'    : '#94A3B8',
              border:`1px solid ${statusF === f ? '#3B82F6' : '#334155'}` }}>
            {f}
          </button>
        ))}
        <span style={{ marginLeft:'14px', fontSize:'10px', color:'#64748B',
          letterSpacing:'0.08em', fontWeight:700 }}>SEVERITY</span>
        {SEVERITY_FILTERS.map(f => {
          const sev = SEV[f]
          const active = sevF === f
          return (
            <button key={f} onClick={() => { setSevF(f); setPage(1); setSelectedId(null) }}
              style={{ padding:'5px 12px', borderRadius:'18px',
                fontSize:'11px', fontWeight:700, cursor:'pointer',
                background: active ? (sev?.text || '#3B82F6') : '#1F2937',
                color:     active ? '#fff' : '#94A3B8',
                border:`1px solid ${active ? (sev?.text || '#3B82F6') : '#334155'}` }}>
              {f}
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
          borderRadius:'10px', padding:'12px 14px', color:'#FCA5A5', fontSize:'13px',
          marginBottom:'14px' }}>
          ⚠ {error}
        </div>
      )}

      {/* Two-pane: list + detail */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(420px, 1fr) minmax(540px, 1.4fr)', gap:'18px' }}>

        {/* LIST */}
        <div>
          {loading && items.length === 0 ? (
            <div style={{ ...C.card, textAlign:'center', padding:'60px 20px' }}>
              <Spinner size={32}/>
              <div style={{ marginTop:'14px', color:'#64748B', fontSize:'12px' }}>
                Loading queue…
              </div>
            </div>
          ) : items.length === 0 ? (
            <div style={{ ...C.card, textAlign:'center', padding:'60px 20px', color:'#64748B' }}>
              <div style={{ fontSize:'32px', marginBottom:'10px' }}>📭</div>
              <div style={{ fontSize:'13px', marginBottom:'6px', color:'#94A3B8', fontWeight:600 }}>
                Queue is empty
              </div>
              <div style={{ fontSize:'11px' }}>
                Drop video files into a watch folder configured under <code>VideoFolderWatcher.WatchFolders</code> in <code>appsettings.json</code>.
              </div>
            </div>
          ) : (
            <>
              {items.map(it => (
                <QueueRow key={it.id} item={it}
                  selected={selectedId === it.id}
                  onClick={() => setSelectedId(it.id)}/>
              ))}

              {totalPages > 1 && (
                <div style={{ display:'flex', justifyContent:'center', alignItems:'center',
                  gap:'8px', paddingTop:'8px' }}>
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                    style={{ padding:'6px 14px', background:'#1F2937', border:'1px solid #334155',
                      borderRadius:'7px', color:'#94A3B8', cursor:'pointer', fontSize:'12px',
                      opacity: page === 1 ? 0.5 : 1 }}>← Prev</button>
                  <span style={{ fontSize:'12px', color:'#64748B', padding:'6px 10px' }}>
                    Page {page} / {totalPages}
                  </span>
                  <button onClick={() => setPage(p => p+1)} disabled={page >= totalPages}
                    style={{ padding:'6px 14px', background:'#1F2937', border:'1px solid #334155',
                      borderRadius:'7px', color:'#94A3B8', cursor:'pointer', fontSize:'12px',
                      opacity: page >= totalPages ? 0.5 : 1 }}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* DETAIL */}
        <div>
          {!selectedId ? (
            <div style={{ ...C.card, textAlign:'center', padding:'80px 20px', color:'#64748B' }}>
              <div style={{ fontSize:'40px', marginBottom:'12px', opacity:0.5 }}>🎬</div>
              <div style={{ fontSize:'14px', color:'#94A3B8', fontWeight:600, marginBottom:'4px' }}>
                Select a file to see details
              </div>
              <div style={{ fontSize:'11px' }}>
                Transcripts, emotions, AI assessment, and violations will appear here.
              </div>
            </div>
          ) : detailLoading && !detail ? (
            <div style={{ ...C.card, textAlign:'center', padding:'80px 20px' }}>
              <Spinner size={28}/>
            </div>
          ) : detail ? (
            <DetailPanel data={detail}/>
          ) : (
            <div style={{ ...C.card, textAlign:'center', padding:'40px 20px',
              color:'#FCA5A5', fontSize:'13px' }}>
              Failed to load detail
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
