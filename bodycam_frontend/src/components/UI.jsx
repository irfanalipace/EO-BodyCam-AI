import React from 'react'

export const SEV = {
  CRITICAL: { bg:'#FCEBEB', border:'#F09595', text:'#A32D2D' },
  WARNING:  { bg:'#FAEEDA', border:'#FAC775', text:'#633806' },
  NORMAL:   { bg:'#E1F5EE', border:'#9FE1CB', text:'#0F6E56' },
}

export function SeverityBadge({ severity }) {
  const s = SEV[severity] || SEV.NORMAL
  return (
    <span style={{ background:s.bg, color:s.text, border:`0.5px solid ${s.border}`,
      padding:'3px 10px', borderRadius:'20px', fontSize:'11px',
      fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase',
      display:'inline-block' }}>
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
    CRITICAL: { bg:'#FCEBEB', border:'#F09595', left:'#E24B4A', badge:'#F7C1C1', text:'#791F1F' },
    HIGH:     { bg:'#FAEEDA', border:'#FAC775', left:'#BA7517', badge:'#FAC775', text:'#633806' },
    MEDIUM:   { bg:'#EBF4FF', border:'#B5D4F4', left:'#185FA5', badge:'#B5D4F4', text:'#0C447C' },
    LOW:      { bg:'#F8F7F4', border:'#D3D1C7', left:'#888780', badge:'#D3D1C7', text:'#5F5E5A' },
  }
  const s = styles[v.severity] || styles.LOW
  return (
    <div className="fade-in" style={{ background:s.bg, border:`0.5px solid ${s.border}`,
      borderLeft:`3px solid ${s.left}`, borderRadius:'8px', padding:'12px 14px',
      marginBottom:'8px', animationDelay:`${index * 0.05}s` }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px' }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px' }}>
            <span style={{ background:s.badge, color:s.text, fontSize:'10px',
              fontWeight:700, padding:'2px 7px', borderRadius:'6px',
              textTransform:'uppercase', letterSpacing:'0.04em' }}>{v.severity}</span>
            <span style={{ fontSize:'13px', fontWeight:600, color:'#2C2C2A' }}>
              {(v.label || v.type || '').replace(/_/g,' ')}
            </span>
          </div>
          <div style={{ fontSize:'12px', color:'#5F5E5A', lineHeight:1.5 }}>{v.detail}</div>
          {v.keywords_found?.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginTop:'8px' }}>
              {v.keywords_found.map((kw, i) => (
                <span key={i} style={{ background:'#F7C1C1', color:'#791F1F',
                  fontSize:'11px', padding:'2px 8px', borderRadius:'6px',
                  fontWeight:600, border:'0.5px solid #F09595' }}>{kw}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize:'14px', fontWeight:700, color:s.text, whiteSpace:'nowrap', marginTop:'2px' }}>
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
  const colors = { NORMAL:'#1D9E75', HARSH:'#E24B4A', BRIBE_TONE:'#BA7517' }
  const color  = colors[label] || '#888780'
  const bgs    = { NORMAL:'#E1F5EE', HARSH:'#FCEBEB', BRIBE_TONE:'#FAEEDA' }
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
    <div style={{ background:s.bg, border:`0.5px solid ${s.border}`,
      borderRadius:'12px', padding:'20px', display:'flex', alignItems:'center', gap:'20px' }}>
      <ScoreRing score={score} severity={severity} size={100}/>
      <div style={{ flex:1 }}>
        <SeverityBadge severity={severity}/>
        <div style={{ fontSize:'13px', color:'#5F5E5A', marginTop:'8px', marginBottom:'12px', lineHeight:1.5 }}>
          {severity === 'CRITICAL' && 'Supervisor alerted. Clip saved automatically.'}
          {severity === 'WARNING'  && 'Flagged for supervisor review.'}
          {severity === 'NORMAL'   && 'No violations — normal enforcement interaction.'}
        </div>
        <ScoreBar score={score}/>
      </div>
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