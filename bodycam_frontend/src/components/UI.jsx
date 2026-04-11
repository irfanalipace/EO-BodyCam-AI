import React from 'react'

export const SEV = {
  CRITICAL: { bg:'#FCEBEB', border:'#F09595', text:'#A32D2D', icon:'⚠' },
  WARNING:  { bg:'#FAEEDA', border:'#FAC775', text:'#633806', icon:'⚡' },
  NORMAL:   { bg:'#E1F5EE', border:'#9FE1CB', text:'#0F6E56', icon:'✓' },
}

// Category icons and colors for violation types
export const CATEGORY_STYLE = {
  RISHWAT:        { icon:'💰', color:'#A32D2D', bg:'#FCEBEB', label:'Bribery' },
  DHAMKI:         { icon:'⚠', color:'#7C2D12', bg:'#FFF0E6', label:'Threat' },
  GALI:           { icon:'🤬', color:'#633806', bg:'#FAEEDA', label:'Abuse' },
  RUDE_BEHAVIOR:  { icon:'😤', color:'#3C3489', bg:'#EEEDFE', label:'Rude' },
  HARASSMENT:     { icon:'🚨', color:'#0C447C', bg:'#E6F1FB', label:'Harassment' },
  GALAT_CHALLAN:  { icon:'📋', color:'#185FA5', bg:'#EBF4FF', label:'Wrong Challan' },
  ANGRY_TONE:     { icon:'🔊', color:'#BA7517', bg:'#FAEEDA', label:'Angry Tone' },
  POWER_ABUSE:    { icon:'👊', color:'#6B21A8', bg:'#F3E8FF', label:'Power Abuse' },
  INTIMIDATION:   { icon:'😰', color:'#0E4969', bg:'#E6F1FB', label:'Intimidation' },
  UNPROFESSIONAL: { icon:'📉', color:'#5F5E5A', bg:'#F8F7F4', label:'Unprofessional' },
}

export function SeverityBadge({ severity, showIcon = true }) {
  const s = SEV[severity] || SEV.NORMAL
  return (
    <span style={{ background:s.bg, color:s.text, border:`0.5px solid ${s.border}`,
      padding:'4px 12px', borderRadius:'20px', fontSize:'11px',
      fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase',
      display:'inline-flex', alignItems:'center', gap:'4px',
      animation: severity === 'CRITICAL' ? 'pulse 2s infinite' : 'none' }}>
      {showIcon && <span style={{ fontSize:'12px' }}>{s.icon}</span>}
      {severity}
    </span>
  )
}

export function ScoreRing({ score, severity, size = 100 }) {
  const s    = SEV[severity] || SEV.NORMAL
  const r    = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const off  = circ - (score / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E8E6DF" strokeWidth="8"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={s.text} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition:'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}/>
      <text x={size/2} y={size/2-4} textAnchor="middle"
        fill={s.text} fontSize={size > 80 ? 22 : 16} fontWeight="700">{score}</text>
      <text x={size/2} y={size/2+14} textAnchor="middle" fill="#888780" fontSize="10">/100</text>
    </svg>
  )
}

export function ScoreBar({ score, height = 6 }) {
  const color = score >= 70 ? '#E24B4A' : score >= 40 ? '#BA7517' : '#1D9E75'
  return (
    <div style={{ background:'#E8E6DF', borderRadius:'4px', overflow:'hidden', height }}>
      <div style={{ height:'100%', width:`${Math.min(score,100)}%`, background:color,
        borderRadius:'4px', transition:'width 0.7s cubic-bezier(0.4,0,0.2,1)' }}/>
    </div>
  )
}

export function ViolationCard({ v, index = 0 }) {
  const styles = {
    CRITICAL: { bg:'#FCEBEB', border:'#F09595', left:'#E24B4A', badge:'#E24B4A', badgeText:'#fff', text:'#791F1F' },
    HIGH:     { bg:'#FAEEDA', border:'#FAC775', left:'#BA7517', badge:'#BA7517', badgeText:'#fff', text:'#633806' },
    MEDIUM:   { bg:'#EBF4FF', border:'#B5D4F4', left:'#185FA5', badge:'#185FA5', badgeText:'#fff', text:'#0C447C' },
    LOW:      { bg:'#F8F7F4', border:'#D3D1C7', left:'#888780', badge:'#888780', badgeText:'#fff', text:'#5F5E5A' },
  }
  const s = styles[v.severity] || styles.LOW
  const cat = CATEGORY_STYLE[v.type] || {}
  const catIcon = cat.icon || '●'
  return (
    <div className="fade-in" style={{ background:s.bg, border:`0.5px solid ${s.border}`,
      borderLeft:`4px solid ${s.left}`, borderRadius:'10px', padding:'14px 16px',
      marginBottom:'10px', animationDelay:`${index * 0.06}s`,
      boxShadow: v.severity === 'CRITICAL' ? '0 2px 8px rgba(226,75,74,0.15)' : 'none' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px' }}>
        <div style={{ flex:1 }}>
          {/* Header: severity + category icon + label */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px', flexWrap:'wrap' }}>
            <span style={{ background:s.badge, color:s.badgeText, fontSize:'9px',
              fontWeight:700, padding:'3px 8px', borderRadius:'4px',
              textTransform:'uppercase', letterSpacing:'0.05em' }}>{v.severity}</span>
            <span style={{ fontSize:'15px' }}>{catIcon}</span>
            <span style={{ fontSize:'13px', fontWeight:700, color:'#2C2C2A' }}>
              {(v.label || v.type || '').replace(/_/g,' ')}
            </span>
          </div>
          {/* Description */}
          <div style={{ fontSize:'12px', color:'#5F5E5A', lineHeight:1.6, marginBottom:'6px' }}>{v.detail}</div>
          {/* Keywords */}
          {v.keywords_found?.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginTop:'8px' }}>
              {v.keywords_found.map((kw, i) => (
                <span key={i} style={{ background:cat.bg || '#F7C1C1', color:cat.color || '#791F1F',
                  fontSize:'11px', padding:'3px 9px', borderRadius:'6px',
                  fontWeight:600, border:`0.5px solid ${(cat.color || '#F09595')}30`,
                  letterSpacing:'0.02em' }}>
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Score badge */}
        <div style={{ background:s.left, color:'#fff', fontSize:'13px', fontWeight:700,
          padding:'6px 10px', borderRadius:'8px', whiteSpace:'nowrap',
          minWidth:'44px', textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' }}>
          +{v.score}
        </div>
      </div>
    </div>
  )
}

export function MetricTile({ label, value, sub, color = '#2C2C2A' }) {
  return (
    <div style={{ background:'#F8F7F4', border:'0.5px solid #E8E6DF', borderRadius:'10px', padding:'16px' }}>
      <div style={{ fontSize:'10px', color:'#888780', textTransform:'uppercase',
        letterSpacing:'0.07em', fontWeight:700, marginBottom:'8px' }}>{label}</div>
      <div style={{ fontSize:'26px', fontWeight:700, color, marginBottom:'4px' }}>{value}</div>
      {sub && <div style={{ fontSize:'11px', color:'#888780' }}>{sub}</div>}
    </div>
  )
}

export function ToneBar({ label, prob, active }) {
  const colors = { NORMAL:'#1D9E75', HARSH:'#E24B4A', ANGRY:'#DC2626', BRIBE_TONE:'#BA7517' }
  const color  = colors[label] || '#888780'
  const bgs    = { NORMAL:'#E1F5EE', HARSH:'#FCEBEB', ANGRY:'#FEE2E2', BRIBE_TONE:'#FAEEDA' }
  const bg     = active ? bgs[label] || '#F8F7F4' : '#F8F7F4'
  return (
    <div style={{ background:bg, border:`0.5px solid ${active ? color + '60' : '#D3D1C7'}`,
      borderRadius:'8px', padding:'10px 12px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
        <span style={{ fontSize:'11px', fontWeight:600,
          color:active ? color : '#888780', textTransform:'uppercase', letterSpacing:'0.04em' }}>
          {label.replace(/_/g,' ')}
        </span>
        <span style={{ fontSize:'14px', fontWeight:700, color:active ? color : '#B4B2A9' }}>
          {Math.round(prob * 100)}%
        </span>
      </div>
      <div style={{ background:'#E8E6DF', borderRadius:'3px', overflow:'hidden', height:'4px' }}>
        <div style={{ height:'100%', width:`${prob * 100}%`, background:color,
          borderRadius:'3px', transition:'width 0.6s ease' }}/>
      </div>
    </div>
  )
}

export function Spinner({ size = 18, color = '#185FA5' }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%',
      border:`2px solid #D3D1C7`, borderTopColor:color,
      animation:'spin 0.7s linear infinite', flexShrink:0 }}/>
  )
}

export function ScoreDisplay({ score, severity }) {
  const s = SEV[severity] || SEV.NORMAL
  return (
    <div style={{ background:s.bg, border:`1px solid ${s.border}`,
      borderRadius:'14px', padding:'22px', display:'flex', alignItems:'center', gap:'22px',
      boxShadow: severity === 'CRITICAL' ? '0 4px 16px rgba(226,75,74,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
      animation: severity === 'CRITICAL' ? 'pulse 3s infinite' : 'none' }}>
      <ScoreRing score={score} severity={severity} size={110}/>
      <div style={{ flex:1 }}>
        <SeverityBadge severity={severity}/>
        <div style={{ fontSize:'13px', color:'#5F5E5A', marginTop:'10px', marginBottom:'14px', lineHeight:1.6 }}>
          {severity === 'CRITICAL' && 'Immediate action required — supervisor alerted automatically.'}
          {severity === 'WARNING'  && 'Flagged for supervisor review — potential misconduct detected.'}
          {severity === 'NORMAL'   && 'No violations detected — normal enforcement interaction.'}
        </div>
        <ScoreBar score={score}/>
      </div>
    </div>
  )
}

export function ViolationSummary({ violations = [] }) {
  if (!violations.length) return null
  const cats = {}
  violations.forEach(v => {
    const key = v.type || v.label || 'OTHER'
    if (!cats[key]) cats[key] = { count:0, score:0, severity:v.severity, keywords:[] }
    cats[key].count++
    cats[key].score += v.score || 0
    if (v.keywords_found) cats[key].keywords.push(...v.keywords_found)
  })
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:'8px' }}>
      {Object.entries(cats).map(([key, val]) => {
        const cat = CATEGORY_STYLE[key] || { icon:'●', color:'#5F5E5A', bg:'#F8F7F4' }
        return (
          <div key={key} style={{ background:cat.bg, border:`0.5px solid ${cat.color}25`,
            borderRadius:'10px', padding:'12px', textAlign:'center' }}>
            <div style={{ fontSize:'20px', marginBottom:'4px' }}>{cat.icon}</div>
            <div style={{ fontSize:'10px', fontWeight:700, color:cat.color,
              textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'4px' }}>
              {cat.label || key.replace(/_/g,' ')}
            </div>
            <div style={{ fontSize:'18px', fontWeight:700, color:cat.color }}>+{val.score}</div>
            <div style={{ fontSize:'10px', color:'#888780', marginTop:'2px' }}>
              {val.keywords.length} keyword{val.keywords.length !== 1 ? 's' : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const MetricCard    = MetricTile
export const ViolationItem = ViolationCard
export const ToneCard      = ToneBar
export const C = {
  card:    { background:'#ffffff', border:'0.5px solid #D3D1C7', borderRadius:'12px', padding:'20px' },
  card_sm: { background:'#ffffff', border:'0.5px solid #D3D1C7', borderRadius:'10px', padding:'14px' },
  surface: { background:'#F8F7F4', border:'0.5px solid #E8E6DF', borderRadius:'8px',  padding:'12px' },
}