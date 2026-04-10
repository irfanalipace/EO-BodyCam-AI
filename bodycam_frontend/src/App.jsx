import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useSocket } from './hooks/useSocket'
import Dashboard  from './pages/Dashboard'
import Upload     from './pages/Upload'
import LiveStream from './pages/LiveStream'
import Incidents  from './pages/Incidents'
import Samples    from './pages/Samples'
import Officers   from './pages/Officers'
import ApiService from './services/api'

const NAV = [
  { to:'/',          label:'Dashboard',   icon:'◧' },
  { to:'/upload',    label:'Upload Audio', icon:'↑' },
  { to:'/live',      label:'Live Stream',  icon:'●', live:true },
  { to:'/samples',   label:'Test Samples', icon:'▦' },
  { to:'/incidents', label:'Incidents',    icon:'⚑' },
  { to:'/officers',  label:'Officers',     icon:'◎' },
]

export default function App() {
  const { connected, alerts, markRead, clearAlerts, liveStatus } = useSocket()
  const [info, setInfo] = useState(null)
  const unread = alerts.filter(a => !a.read).length
  const latest = alerts[0]

  useEffect(() => {
    ApiService.health().then(r => setInfo(r.data)).catch(() => {})
  }, [])

  return (
    <BrowserRouter>
      <div style={{ display:'flex', minHeight:'100vh', background:'#F1EFE8' }}>

        {/* Sidebar */}
        <aside style={{ width:224, flexShrink:0, background:'#ffffff',
          borderRight:'0.5px solid #D3D1C7', display:'flex',
          flexDirection:'column', height:'100vh', position:'sticky', top:0 }}>

          {/* Logo */}
          <div style={{ padding:'20px 18px 16px', borderBottom:'0.5px solid #D3D1C7' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
              <div style={{ width:36, height:36, background:'#185FA5',
                borderRadius:'10px', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:'13px', fontWeight:800, color:'#fff' }}>
                EO
              </div>
              <div>
                <div style={{ fontSize:'14px', fontWeight:700, color:'#2C2C2A' }}>Bodycam AI</div>
                <div style={{ fontSize:'10px', color:'#888780', letterSpacing:'0.05em', textTransform:'uppercase' }}>
                  Violation Detection
                </div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', marginBottom:'4px' }}>
              <div style={{ width:7, height:7, borderRadius:'50%',
                background: connected ? '#1D9E75' : '#D3D1C7',
                animation: connected ? 'none' : 'pulse 1s infinite' }}/>
              <span style={{ color: connected ? '#1D9E75' : '#888780', fontWeight:600 }}>
                {connected ? 'Server connected' : 'Server offline'}
              </span>
            </div>
            {info && (
              <div style={{ fontSize:'10px', color:'#B4B2A9', lineHeight:1.6 }}>
                Whisper: {info.whisper_available ? '✓ Active' : 'install on Windows'} · SVM {info.tone_cv_acc}%
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex:1, padding:'10px', overflowY:'auto' }}>
            {NAV.map(item => (
              <NavLink key={item.to} to={item.to}
                style={({ isActive }) => ({
                  display:'flex', alignItems:'center', gap:'10px',
                  padding:'9px 12px', borderRadius:'8px', marginBottom:'2px',
                  textDecoration:'none', fontSize:'13px',
                  fontWeight: isActive ? 600 : 500,
                  background: isActive ? '#EEF5FB' : 'transparent',
                  color: isActive ? '#185FA5' : '#5F5E5A',
                  borderLeft: isActive ? '2px solid #185FA5' : '2px solid transparent',
                  transition:'all .15s',
                })}>
                <span style={{ color: item.live ? '#E24B4A' : 'inherit',
                  animation: item.live ? 'pulse 1.5s infinite' : 'none', fontSize:'14px' }}>
                  {item.icon}
                </span>
                <span style={{ flex:1 }}>{item.label}</span>
                {item.label === 'Incidents' && unread > 0 && (
                  <span style={{ background:'#E24B4A', color:'#fff', fontSize:'10px',
                    fontWeight:700, padding:'1px 6px', borderRadius:'10px' }}>{unread}</span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Latest alert */}
          {latest && (
            <div style={{ margin:'10px', padding:'10px 12px', borderRadius:'8px', fontSize:'11px',
              background: latest.severity === 'CRITICAL' ? '#FCEBEB' : '#FAEEDA',
              border: `0.5px solid ${latest.severity === 'CRITICAL' ? '#F09595' : '#FAC775'}` }}>
              <div style={{ fontWeight:700, fontSize:'10px', letterSpacing:'0.05em',
                color: latest.severity === 'CRITICAL' ? '#A32D2D' : '#633806',
                marginBottom:'3px', textTransform:'uppercase' }}>Latest Alert</div>
              <div style={{ color:'#2C2C2A', fontWeight:600 }}>{latest.officer_id} — {latest.total_score}/100</div>
              <div style={{ color:'#888780', fontSize:'10px', marginTop:'2px' }}>
                {latest.violations?.length} violations · {latest.severity}
              </div>
            </div>
          )}

          <div style={{ padding:'12px 18px', borderTop:'0.5px solid #D3D1C7',
            fontSize:'10px', color:'#B4B2A9', letterSpacing:'0.04em' }}>
            v3.1 · 89 URDU KEYWORDS · SVM 81%
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex:1, overflow:'auto', background:'#F1EFE8' }}>
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/upload"    element={<Upload />} />
            <Route path="/live"      element={<LiveStream liveStatus={liveStatus} />} />
            <Route path="/samples"   element={<Samples />} />
            <Route path="/incidents" element={<Incidents alerts={alerts} markRead={markRead} clearAlerts={clearAlerts} />} />
            <Route path="/officers"  element={<Officers />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}