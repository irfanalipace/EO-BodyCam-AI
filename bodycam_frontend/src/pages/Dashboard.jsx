import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { SeverityBadge, ScoreBar } from '../components/UI'
import ApiService from '../services/api'

const CARD  = { background:'#ffffff', border:'0.5px solid #D3D1C7', borderRadius:'12px', padding:'22px', marginBottom:'16px' }
const LABEL = { fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'12px', display:'block' }
const TT    = { background:'#ffffff', border:'0.5px solid #D3D1C7', borderRadius:'8px', color:'#2C2C2A', fontSize:12 }

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ background:'#ffffff', border:'0.5px solid #D3D1C7', borderRadius:'12px', padding:'20px' }}>
      <div style={{ fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'10px' }}>{label}</div>
      <div style={{ fontSize:'28px', fontWeight:700, color:color||'#2C2C2A', marginBottom:'4px' }}>{value}</div>
      <div style={{ fontSize:'11px', color:'#888780' }}>{sub}</div>
    </div>
  )
}

function Step({ id, color, title, desc }) {
  return (
    <div style={{ display:'flex', gap:'10px', alignItems:'flex-start', marginBottom:'13px' }}>
      <div style={{ width:22, height:22, borderRadius:'6px', background:`${color}18`, color,
        fontSize:'11px', fontWeight:800, display:'flex', alignItems:'center',
        justifyContent:'center', flexShrink:0, marginTop:'2px' }}>{id}</div>
      <div>
        <div style={{ fontSize:'13px', fontWeight:600, color:'#2C2C2A', marginBottom:'2px' }}>{title}</div>
        <div style={{ fontSize:'11px', color:'#888780', lineHeight:1.5 }}>{desc}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = async () => {
    try {
      const [s, h] = await Promise.all([ApiService.getDashboard(), ApiService.health()])
      setStats({ ...s.data, health: h.data })
    } catch(e) { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t) }, [])

  if (loading) return (
    <div style={{ padding:'80px', textAlign:'center' }}>
      <div style={{ width:32, height:32, borderRadius:'50%', border:'2px solid #D3D1C7',
        borderTopColor:'#185FA5', animation:'spin .7s linear infinite', margin:'0 auto 16px' }}/>
      <div style={{ color:'#888780', fontSize:'13px' }}>Loading dashboard...</div>
    </div>
  )

  if (error) return (
    <div style={{ padding:'40px' }}>
      <div style={{ background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:'12px', padding:'24px' }}>
        <div style={{ fontWeight:700, color:'#A32D2D', marginBottom:'8px' }}>Server offline</div>
        <code style={{ fontSize:'12px', background:'#F8F7F4', padding:'6px 10px', borderRadius:'6px', color:'#5F5E5A' }}>
          cd backend &amp;&amp; python server.py
        </code>
      </div>
    </div>
  )

  const total   = stats?.total_analyzed || 0
  const pieData = [
    { name:'Critical', value:stats?.critical||0, color:'#E24B4A' },
    { name:'Warning',  value:stats?.warning||0,  color:'#BA7517' },
    { name:'Normal',   value:stats?.normal||0,   color:'#1D9E75' },
  ].filter(d => d.value > 0)

  const vtData = (stats?.violation_types||[]).slice(0,6).map(([name,count]) => ({
    name: name.replace(/_/g,' ').slice(0,12), count
  }))

  const recent = stats?.recent_incidents || []

  return (
    <div style={{ padding:'28px', maxWidth:'1200px' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'22px', fontWeight:700, color:'#2C2C2A', marginBottom:'4px' }}>Dashboard</h1>
          <p style={{ fontSize:'13px', color:'#888780' }}>Real-time EO monitoring · Violation detection overview</p>
        </div>
        {stats?.health && (
          <div style={{ textAlign:'right', fontSize:'11px', color:'#B4B2A9', lineHeight:1.8 }}>
            <div style={{ color:'#1D9E75', fontWeight:600 }}>● System active</div>
            <div>Whisper: {stats.health.whisper_available ? '✓ Auto-transcription' : '○ Install on Windows'}</div>
            <div>SVM: {stats.health.tone_cv_acc}% · {stats.health.total_keywords} keywords</div>
          </div>
        )}
      </div>

      {/* Metric tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px', marginBottom:'20px' }}>
        <Tile label="Total Analyzed"  value={total}                       sub="all recordings"  color="#185FA5"/>
        <Tile label="Critical Alerts" value={stats?.critical||0}          sub="action required" color="#E24B4A"/>
        <Tile label="Warnings"        value={stats?.warning||0}           sub="review needed"   color="#BA7517"/>
        <Tile label="Avg Score"       value={`${stats?.avg_score||0}/100`} sub="all recordings"
          color={(stats?.avg_score||0)>=70?'#E24B4A':(stats?.avg_score||0)>=40?'#BA7517':'#1D9E75'}/>
      </div>

      {/* Charts */}
      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:'16px', marginBottom:'16px' }}>
        <div style={CARD}>
          <span style={LABEL}>Severity Breakdown</span>
          {total === 0 ? (
            <div style={{ textAlign:'center', padding:'30px 0', color:'#B4B2A9', fontSize:'13px' }}>No recordings yet</div>
          ) : (
            <>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:'16px' }}>
                <PieChart width={160} height={160}>
                  <Pie data={pieData} cx={75} cy={75} innerRadius={42} outerRadius={72} dataKey="value" paddingAngle={3}>
                    {pieData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={TT}/>
                </PieChart>
              </div>
              {pieData.map(d => (
                <div key={d.name} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', borderBottom:'0.5px solid #F1EFE8', fontSize:'13px' }}>
                  <div style={{ width:10, height:10, borderRadius:'3px', background:d.color, flexShrink:0 }}/>
                  <span style={{ color:'#5F5E5A', flex:1 }}>{d.name}</span>
                  <span style={{ fontWeight:700, color:'#2C2C2A' }}>{d.value}</span>
                  <span style={{ color:'#888780', fontSize:'11px' }}>({total>0?Math.round(d.value/total*100):0}%)</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={CARD}>
          <span style={LABEL}>Top Violation Types</span>
          {vtData.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'#B4B2A9', fontSize:'13px' }}>Analyze recordings to see violation distribution</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={vtData} margin={{ left:-20 }}>
                <XAxis dataKey="name" tick={{ fill:'#888780', fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:'#888780', fontSize:10 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={TT}/>
                <Bar dataKey="count" fill="#185FA5" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

{/* Pipeline */}
<div style={{ ...CARD, marginBottom:'16px' }}>
  <span style={LABEL}>AI Detection Pipeline</span>
  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' }}>
    {[
      { id:'A', color:'#185FA5', title:'Voice Activity Detection', desc:'Energy + ZCR filtering removes traffic, animals, silence from body cam audio' },
      { id:'B', color:'#534AB7', title:'EO Voice Identification',  desc:'106-dim MFCC voiceprint matches EO voice among all crowd speakers' },
      { id:'C', color:'#0F6E56', title:'Whisper Transcription',    desc:'Auto-converts Urdu/Punjabi speech to text — no manual input needed' },
      { id:'D', color:'#BA7517', title:'Tone SVM Classifier',      desc:'NORMAL / HARSH / BRIBE_TONE — 87.8% cross-validation accuracy' },
      { id:'E', color:'#A32D2D', title:'Urdu Keyword Detection',   desc:'89 words: paisa, rishwat, jail, maar, gadha, bewaqoof, chhod do...' },
      { id:'F', color:'#1D9E75', title:'Score + Alert',            desc:'Score 0–100 → NORMAL / WARNING / CRITICAL → supervisor alerted instantly' },
    ].map(s => (
      <div key={s.id} style={{ background:'#F8F7F4', border:'0.5px solid #E8E6DF',
        borderRadius:'10px', padding:'14px', display:'flex', gap:'10px', alignItems:'flex-start' }}>
        <div style={{ width:24, height:24, borderRadius:'7px', background:`${s.color}15`,
          color:s.color, fontSize:'12px', fontWeight:800, display:'flex',
          alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:'1px' }}>
          {s.id}
        </div>
        <div>
          <div style={{ fontSize:'12px', fontWeight:700, color:'#2C2C2A', marginBottom:'4px' }}>
            {s.title}
          </div>
          <div style={{ fontSize:'11px', color:'#888780', lineHeight:1.5 }}>
            {s.desc}
          </div>
        </div>
      </div>
    ))}
  </div>
</div>

      {/* Recent incidents */}
      <div style={CARD}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <span style={{ ...LABEL, marginBottom:0 }}>Recent Incidents</span>
          <button style={{ fontSize:'12px', color:'#185FA5', background:'transparent', border:'none', cursor:'pointer' }}>View all →</button>
        </div>
        {recent.length === 0 ? (
          <div style={{ textAlign:'center', padding:'36px 0' }}>
            <div style={{ fontSize:'28px', color:'#D3D1C7', marginBottom:'10px' }}>⬡</div>
            <div style={{ fontSize:'13px', color:'#B4B2A9', fontWeight:500 }}>No incidents yet</div>
            <div style={{ fontSize:'11px', color:'#D3D1C7', marginTop:'4px' }}>Upload audio to start detection</div>
          </div>
        ) : (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'90px 140px 1fr 120px 100px 80px', gap:'8px', paddingBottom:'10px', borderBottom:'0.5px solid #E8E6DF' }}>
              {['ID','Officer','File','Severity','Score','Time'].map(h => (
                <div key={h} style={{ fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700 }}>{h}</div>
              ))}
            </div>
            {recent.map(inc => {
              const sc  = inc.total_score
              const col = sc>=70?'#E24B4A':sc>=40?'#BA7517':'#1D9E75'
              return (
                <div key={inc.incident_id} style={{ display:'grid', gridTemplateColumns:'90px 140px 1fr 120px 100px 80px', gap:'8px', padding:'11px 0', borderBottom:'0.5px solid #F1EFE8', alignItems:'center' }}>
                  <div style={{ fontFamily:'monospace', fontSize:'11px', color:'#888780' }}>{inc.incident_id}</div>
                  <div style={{ fontSize:'12px', color:'#2C2C2A', fontWeight:600 }}>{inc.officer_name}</div>
                  <div style={{ fontSize:'11px', color:'#888780', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inc.filename}</div>
                  <div><SeverityBadge severity={inc.severity}/></div>
                  <div>
                    <div style={{ fontSize:'15px', fontWeight:700, color:col, marginBottom:'4px' }}>{sc}</div>
                    <ScoreBar score={sc} height={3}/>
                  </div>
                  <div style={{ fontSize:'11px', color:'#888780' }}>{inc.timestamp?.slice(11,19)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}