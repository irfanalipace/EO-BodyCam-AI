import React, { useState, useRef } from 'react'
import { ScoreRing, ViolationCard, ViolationSummary, ToneBar, Spinner, SeverityBadge, ScoreBar, CATEGORY_STYLE } from '../components/UI'
import ApiService from '../services/api'

const CARD  = { background:'#ffffff', border:'0.5px solid #D3D1C7', borderRadius:'12px', padding:'20px', marginBottom:'14px' }
const LABEL = { fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'8px', display:'block' }

const OFFICERS = [
  { id:'EO_001', name:'Ali Hassan — PK-LHR-001' },
  { id:'EO_002', name:'Umar Farooq — PK-LHR-002' },
  { id:'EO_003', name:'Fatima Malik — PK-KHI-001' },
]

const PROGRESS_STEPS = [
  'Removing background noise...',
  'Identifying EO voice...',
  'Transcribing Urdu speech...',
  'Scanning for violation keywords...',
  'Calculating violation score...',
]

const KW_GROUPS = [
  { type:'RISHWAT',        icon:'💰', color:'#A32D2D', bg:'#FCEBEB', words:['rishwat','paisa','paisay','deal','chhod do','chai paani','haath garam'] },
  { type:'DHAMKI',         icon:'⚠',  color:'#7C2D12', bg:'#FFF0E6', words:['arrest kar','jail','thana','maar doon ga','barbaad','FIR','challan'] },
  { type:'GALI',           icon:'🤬', color:'#633806', bg:'#FAEEDA', words:['gadha','bewaqoof','kamina','harami','kutta','saala','kanjar'] },
  { type:'RUDE_BEHAVIOR',  icon:'😤', color:'#3C3489', bg:'#EEEDFE', words:['chup raho','bakwas','attitude','nikal jao','auqat','tameez'] },
  { type:'HARASSMENT',     icon:'🚨', color:'#0C447C', bg:'#E6F1FB', words:['naukri jayegi','dukaan band','badnaam','izzat','tang karunga'] },
  { type:'ANGRY_TONE',     icon:'🔊', color:'#BA7517', bg:'#FAEEDA', words:['gussa','chillao','cheekh','daant','shor','taiz awaaz'] },
  { type:'POWER_ABUSE',    icon:'👊', color:'#6B21A8', bg:'#F3E8FF', words:['officer hoon','meri marzi','mera hukum','seal laga','raid'] },
  { type:'INTIMIDATION',   icon:'😰', color:'#0E4969', bg:'#E6F1FB', words:['dar gaya','anjaam bura','aakhri warning','sabaq sikhaoon'] },
  { type:'GALAT_CHALLAN',  icon:'📋', color:'#185FA5', bg:'#EBF4FF', words:['galat challan','galat amount','receipt nahi','jhooth likha'] },
  { type:'UNPROFESSIONAL', icon:'📉', color:'#5F5E5A', bg:'#F8F7F4', words:['mujhe kya','mera kaam nahi','bore','faltu kaam'] },
]

export default function Upload() {
  const [file,     setFile]     = useState(null)
  const [officer,  setOfficer]  = useState('EO_001')
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [drag,     setDrag]     = useState(false)
  const [progress, setProgress] = useState('')
  const inputRef = useRef()

  const handleFile = f => {
    if (!f) return
    setFile(f); setResult(null); setError(null)
  }
  const onDrop = e => {
    e.preventDefault(); setDrag(false)
    handleFile(e.dataTransfer.files[0])
  }

  const analyze = async () => {
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    let si = 0
    const timer = setInterval(() => setProgress(PROGRESS_STEPS[si++ % PROGRESS_STEPS.length]), 2000)
    try {
      const r = await ApiService.analyzeUpload(file, officer)
      setResult(r.data)
    } catch(e) {
      setError(e.response?.data?.error || 'Server error. Start backend: python server.py')
    } finally {
      clearInterval(timer); setLoading(false); setProgress('')
    }
  }

  return (
    <div style={{ padding:'28px', maxWidth:'1140px' }}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontSize:'22px', fontWeight:700, color:'#2C2C2A', marginBottom:'4px' }}>
          Upload Body Cam Recording
        </h1>
        <p style={{ fontSize:'13px', color:'#888780', lineHeight:1.6 }}>
          Upload audio or video · AI automatically detects EO voice ·
          transcribes Urdu speech · finds all violations · no typing needed
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'400px 1fr', gap:'24px', alignItems:'start' }}>

        {/* LEFT */}
        <div>
          {/* Drop zone */}
          <div style={CARD}>
            <span style={LABEL}>Audio / Video File</span>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current.click()}
              style={{ border:`2px dashed ${drag ? '#185FA5' : '#D3D1C7'}`,
                borderRadius:'10px', padding:'32px 20px', textAlign:'center',
                cursor:'pointer', background:drag ? '#EEF5FB' : '#F8F7F4',
                transition:'all .2s' }}>
              <input ref={inputRef} type="file"
                accept=".wav,.mp3,.mp4,.webm,.ogg,.m4a,.flac"
                style={{ display:'none' }}
                onChange={e => handleFile(e.target.files[0])}/>
              {file ? (
                <div>
                  <div style={{ fontSize:'28px', marginBottom:'8px', color:'#1D9E75' }}>✓</div>
                  <div style={{ fontSize:'14px', fontWeight:600, color:'#2C2C2A', marginBottom:'4px', wordBreak:'break-all' }}>{file.name}</div>
                  <div style={{ fontSize:'12px', color:'#888780' }}>{(file.size/1024/1024).toFixed(2)} MB · Click to change</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize:'28px', color:'#D3D1C7', marginBottom:'8px' }}>↑</div>
                  <div style={{ fontSize:'14px', fontWeight:600, color:'#5F5E5A', marginBottom:'4px' }}>Drop body cam recording here</div>
                  <div style={{ fontSize:'12px', color:'#B4B2A9' }}>WAV · MP3 · MP4 · WebM · OGG · M4A</div>
                </div>
              )}
            </div>
          </div>

          {/* Officer */}
          <div style={CARD}>
            <label style={LABEL}>Select Officer</label>
            <select value={officer} onChange={e => setOfficer(e.target.value)}>
              {OFFICERS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {/* How it works */}
          <div style={{ ...CARD, background:'#F8F7F4', border:'0.5px solid #E8E6DF' }}>
            <span style={LABEL}>AI Detects Everything Automatically</span>
            {[
              { id:'A', color:'#185FA5', title:'Noise Removal',       desc:'Strips traffic, animals, crowd noise' },
              { id:'B', color:'#534AB7', title:'EO Voice Detection',  desc:'Finds officer voice among all speakers' },
              { id:'C', color:'#0F6E56', title:'Urdu Transcription',  desc:'Whisper converts speech to text automatically' },
              { id:'D', color:'#BA7517', title:'Tone Analysis',       desc:'Detects shouting, pitch, agitation (SVM)' },
              { id:'E', color:'#A32D2D', title:'Keyword Detection',   desc:'Scans transcribed text for violation words' },
            ].map(s => (
              <div key={s.id} style={{ display:'flex', gap:'10px', alignItems:'flex-start', marginBottom:'10px' }}>
                <div style={{ width:20, height:20, borderRadius:'5px', background:`${s.color}15`,
                  color:s.color, fontSize:'11px', fontWeight:800, display:'flex',
                  alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:'2px' }}>{s.id}</div>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:700, color:'#2C2C2A', marginBottom:'1px' }}>{s.title}</div>
                  <div style={{ fontSize:'11px', color:'#888780' }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Keywords reference — all 10 categories */}
          <div style={{ ...CARD, background:'#F8F7F4', border:'0.5px solid #E8E6DF' }}>
            <span style={LABEL}>588 Keywords · 10 Categories · Auto-Detected</span>
            {KW_GROUPS.map(g => (
              <div key={g.type} style={{ marginBottom:'10px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
                  <span style={{ fontSize:'13px' }}>{g.icon}</span>
                  <span style={{ fontSize:'10px', fontWeight:700, color:g.color,
                    letterSpacing:'0.05em', textTransform:'uppercase' }}>
                    {g.type.replace(/_/g,' ')}
                  </span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {g.words.map(w => (
                    <span key={w} style={{ background:g.bg, color:g.color,
                      border:`0.5px solid ${g.color}25`, fontSize:'10px',
                      padding:'2px 7px', borderRadius:'6px', fontWeight:600 }}>{w}</span>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ fontSize:'10px', color:'#B4B2A9', marginTop:'10px', lineHeight:1.5,
              background:'#fff', padding:'8px 10px', borderRadius:'6px', border:'0.5px solid #E8E6DF' }}>
              All keywords detected automatically from Urdu/English/Punjabi voice — no manual input
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={analyze} disabled={!file || loading}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
                gap:'8px', padding:'12px',
                background:(!file||loading)?'#F8F7F4':'#185FA5',
                color:(!file||loading)?'#B4B2A9':'#fff',
                border:`0.5px solid ${(!file||loading)?'#D3D1C7':'#185FA5'}`,
                borderRadius:'10px', fontSize:'14px', fontWeight:600,
                cursor:(!file||loading)?'not-allowed':'pointer', transition:'all .2s' }}>
              {loading ? <><Spinner size={16}/>{progress||'Analyzing...'}</> : '◎  Analyze Recording'}
            </button>
            <button onClick={() => { setFile(null); setResult(null); setError(null) }}
              style={{ padding:'12px 18px', background:'#ffffff', border:'0.5px solid #D3D1C7',
                borderRadius:'10px', fontSize:'13px', cursor:'pointer', color:'#5F5E5A' }}>
              Clear
            </button>
          </div>

          {error && (
            <div style={{ marginTop:'12px', background:'#FCEBEB', border:'0.5px solid #F09595',
              borderRadius:'8px', padding:'12px 14px', fontSize:'12px', color:'#A32D2D' }}>
              {error}
            </div>
          )}
        </div>

        {/* RIGHT: Results */}
        <div>
          {loading && (
            <div style={{ ...CARD, textAlign:'center', padding:'60px 40px' }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:'20px' }}>
                <Spinner size={36}/>
              </div>
              <div style={{ fontSize:'15px', fontWeight:600, color:'#2C2C2A', marginBottom:'8px' }}>
                AI Analyzing Audio
              </div>
              <div style={{ fontSize:'13px', color:'#185FA5', minHeight:'20px' }}>
                {progress || 'Processing...'}
              </div>
              <div style={{ fontSize:'11px', color:'#B4B2A9', marginTop:'10px' }}>
                Detecting voice · Transcribing Urdu · Finding violations
              </div>
            </div>
          )}

          {!loading && !result && !error && (
            <div style={{ ...CARD, textAlign:'center', padding:'60px 40px' }}>
              <div style={{ fontSize:'36px', color:'#D3D1C7', marginBottom:'14px' }}>◎</div>
              <div style={{ fontSize:'14px', fontWeight:600, color:'#B4B2A9', marginBottom:'8px' }}>
                Upload a recording to begin
              </div>
              <div style={{ fontSize:'12px', color:'#D3D1C7', lineHeight:1.7 }}>
                AI auto-detects violations from voice<br/>
                No typing or manual input needed
              </div>
            </div>
          )}

          {result && !loading && <ResultPanel result={result}/>}
        </div>
      </div>
    </div>
  )
}

function ResultPanel({ result: r }) {
  const ac  = r.acoustics || {}
  const ep  = ac.enrolled_pitch_hz || 143
  const sev = r.severity
  const sevBg    = { CRITICAL:'#FCEBEB', WARNING:'#FAEEDA', NORMAL:'#E1F5EE' }[sev]
  const sevBdr   = { CRITICAL:'#F09595', WARNING:'#FAC775', NORMAL:'#9FE1CB' }[sev]
  const CARD  = { background:'#ffffff', border:'0.5px solid #D3D1C7', borderRadius:'12px', padding:'18px', marginBottom:'12px' }
  const LABEL = { fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'10px', display:'block' }

  const toneScore = r.tone_score || 0
  const kwScore = r.keyword_score || 0
  const totalViols = r.violations?.length || 0
  const transcriptMethod = (r.transcription_method || '').includes('groq') ? 'Groq Whisper Large-v3'
    : (r.transcription_method || '').includes('whisper') ? 'Whisper AI' : r.transcription_method || 'Auto'

  return (
    <div className="fade-in">

      {/* Score hero */}
      <div style={{ background:sevBg, border:`1px solid ${sevBdr}`, borderRadius:'16px',
        padding:'24px', display:'flex', alignItems:'center', gap:'24px', marginBottom:'14px',
        boxShadow: sev === 'CRITICAL' ? '0 4px 20px rgba(226,75,74,0.2)' : '0 2px 8px rgba(0,0,0,0.04)' }}>
        <ScoreRing score={r.total_score} severity={sev} size={120}/>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
            <SeverityBadge severity={sev}/>
            {totalViols > 0 && (
              <span style={{ fontSize:'11px', fontWeight:700, color:'#A32D2D',
                background:'#fff', padding:'3px 10px', borderRadius:'6px',
                border:'0.5px solid #F09595' }}>
                {totalViols} violation{totalViols > 1 ? 's' : ''} found
              </span>
            )}
          </div>
          <div style={{ fontSize:'13px', color:'#5F5E5A', marginTop:'6px', marginBottom:'14px', lineHeight:1.6 }}>
            {sev==='CRITICAL' && 'Immediate action required — supervisor alerted automatically.'}
            {sev==='WARNING'  && 'Flagged for supervisor review — potential misconduct detected.'}
            {sev==='NORMAL'   && 'No significant violations — normal enforcement interaction.'}
          </div>
          {/* Score breakdown bars */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            <div style={{ background:'rgba(255,255,255,0.8)', borderRadius:'10px', padding:'12px 14px', border:'0.5px solid #E8E6DF' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                <span style={{ fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700 }}>
                  🎙 Tone & Voice
                </span>
                <span style={{ fontSize:'16px', fontWeight:700, color:'#185FA5' }}>{toneScore}</span>
              </div>
              <div style={{ background:'#E8E6DF', borderRadius:'3px', overflow:'hidden', height:'5px' }}>
                <div style={{ height:'100%', width:`${Math.min(toneScore * 2, 100)}%`, background:'#185FA5',
                  borderRadius:'3px', transition:'width 0.7s ease' }}/>
              </div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.8)', borderRadius:'10px', padding:'12px 14px', border:'0.5px solid #E8E6DF' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                <span style={{ fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700 }}>
                  🔍 Keywords
                </span>
                <span style={{ fontSize:'16px', fontWeight:700, color:'#534AB7' }}>{kwScore}</span>
              </div>
              <div style={{ background:'#E8E6DF', borderRadius:'3px', overflow:'hidden', height:'5px' }}>
                <div style={{ height:'100%', width:`${Math.min(kwScore * 2, 100)}%`, background:'#534AB7',
                  borderRadius:'3px', transition:'width 0.7s ease' }}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Violation Category Summary — visual overview */}
      {totalViols > 0 && (
        <div style={CARD}>
          <span style={LABEL}>Violation Categories Detected</span>
          <ViolationSummary violations={r.violations}/>
        </div>
      )}

      {/* Transcript */}
      {r.transcript && (
        <div style={CARD}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
            <span style={LABEL}>🎙 Speech Detected from Audio</span>
            <span style={{ background:'#E1F5EE', color:'#0F6E56', fontSize:'10px',
              padding:'3px 10px', borderRadius:'6px', fontWeight:700, marginBottom:'10px',
              border:'0.5px solid #9FE1CB' }}>
              {transcriptMethod}
            </span>
          </div>
          <div style={{ fontSize:'14px', color:'#2C2C2A', lineHeight:1.8,
            background:'#F8F7F4', borderRadius:'8px', padding:'14px 16px',
            borderLeft:'4px solid #185FA5', fontFamily:'Georgia, serif' }}>
            "{r.transcript}"
          </div>
        </div>
      )}

      {/* Key metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        {[
          { label:'EO Voice', icon:'👤', value:r.eo_detected?'Detected':'Not found', sub:`similarity: ${r.max_similarity}`, color:r.eo_detected?'#1D9E75':'#E24B4A' },
          { label:'Duration', icon:'⏱', value:`${r.eo_speaking_sec}s`, sub:`of ${r.total_duration_sec}s total` },
          { label:'Processed', icon:'⚡', value:`${r.processing_time_sec}s`, sub:`${r.speech_segments} speech segments` },
        ].map(m => (
          <div key={m.label} style={{ background:'#F8F7F4', border:'0.5px solid #E8E6DF', borderRadius:'10px', padding:'14px' }}>
            <div style={{ fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'8px' }}>
              {m.icon} {m.label}
            </div>
            <div style={{ fontSize:'18px', fontWeight:700, color:m.color||'#2C2C2A', marginBottom:'3px' }}>{m.value}</div>
            <div style={{ fontSize:'11px', color:'#888780' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* SVM Tone + ANGRY classifier */}
      <div style={CARD}>
        <span style={LABEL}>🧠 AI Tone Classifier</span>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'8px' }}>
          {['NORMAL','HARSH','ANGRY','BRIBE_TONE'].map(l => (
            <ToneBar key={l} label={l} prob={r.tone_proba?.[l]||0} active={r.tone_label===l}/>
          ))}
        </div>
      </div>

      {/* Voice Acoustics */}
      {r.eo_detected && ac.avg_pitch_hz > 0 && (
        <div style={CARD}>
          <span style={LABEL}>📊 EO Voice Acoustics</span>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
            {[
              ['Pitch',  `${ac.avg_pitch_hz} Hz`,    ac.avg_pitch_hz > ep*1.55 ? '#E24B4A':'#1D9E75', 'Current pitch'],
              ['Baseline', `${ep} Hz`,                '#888780', 'Enrolled pitch'],
              ['Ratio',  `${ac.pitch_ratio}x`,        ac.pitch_ratio>1.55?'#E24B4A':'#1D9E75', 'Pitch vs normal'],
              ['Energy', `${ac.avg_energy}`,           ac.avg_energy>0.28?'#E24B4A':'#1D9E75', 'Voice loudness'],
              ['Loud',   `${ac.loud_duration_sec}s`,   ac.loud_duration_sec>4?'#BA7517':'#1D9E75', 'Shouting duration'],
              ['Agitation', `${ac.agitation}`,         ac.agitation>1.2?'#BA7517':'#1D9E75', 'Voice instability'],
            ].map(([lbl,val,col,desc]) => (
              <div key={lbl} style={{ background:'#F8F7F4', borderRadius:'8px', padding:'10px 12px', border:'0.5px solid #E8E6DF' }}>
                <div style={{ fontSize:'10px', color:'#888780', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{lbl}</div>
                <div style={{ fontSize:'16px', fontWeight:700, color:col }}>{val}</div>
                <div style={{ fontSize:'10px', color:'#B4B2A9', marginTop:'2px' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violations Detail */}
      <div style={CARD}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
          <span style={LABEL}>🚨 Violations Detected from Voice</span>
          <span style={{ fontSize:'12px', fontWeight:700, padding:'4px 12px', borderRadius:'8px',
            background:totalViols > 0 ? '#E24B4A' : '#1D9E75',
            color:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' }}>
            {totalViols} found
          </span>
        </div>
        {totalViols > 0 ? (
          r.violations.map((v,i) => <ViolationCard key={i} v={v} index={i}/>)
        ) : (
          <div style={{ textAlign:'center', padding:'24px', color:'#1D9E75', fontSize:'14px' }}>
            <div style={{ fontSize:'28px', marginBottom:'8px' }}>✓</div>
            <div style={{ fontWeight:600 }}>No violations detected</div>
            <div style={{ fontSize:'12px', color:'#888780', marginTop:'4px' }}>Normal enforcement interaction</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        fontSize:'10px', color:'#B4B2A9', letterSpacing:'0.04em', padding:'4px 0' }}>
        <span>{r.officer_name} · {r.timestamp?.slice(0,19).replace('T',' ')}</span>
        <span>ID: {r.incident_id}</span>
      </div>
    </div>
  )
}