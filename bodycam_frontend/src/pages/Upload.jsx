import React, { useState, useRef } from 'react'
import { ScoreRing, ViolationCard, ToneBar, Spinner, SeverityBadge, ScoreBar } from '../components/UI'
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
  { type:'RISHWAT',    color:'#A32D2D', bg:'#FCEBEB', words:['paisa','paisay','rishwat','deal','chhod do','jaane do','kuch kar lete hain','sulah kar lete hain'] },
  { type:'DHAMKI',     color:'#7C2D12', bg:'#FFF0E6', words:['arrest kar','jail','thana','maar','nahi chhorra','abhi dekhta hoon'] },
  { type:'GALI',       color:'#633806', bg:'#FAEEDA', words:['gadha','bewaqoof','chup','andar kar doon','tameez nahi'] },
  { type:'RUDE',       color:'#3C3489', bg:'#EEEDFE', words:['chup raho','baat mat karo','chalte bano','nikal jao'] },
  { type:'HARASSMENT', color:'#0C447C', bg:'#E6F1FB', words:['akela pakad loon ga','teri naukri jaye gi','baad mein dekhna'] },
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

          {/* Keywords reference */}
          <div style={{ ...CARD, background:'#F8F7F4', border:'0.5px solid #E8E6DF' }}>
            <span style={LABEL}>Keywords Detected from Voice</span>
            {KW_GROUPS.map(g => (
              <div key={g.type} style={{ marginBottom:'10px' }}>
                <div style={{ fontSize:'10px', fontWeight:700, color:g.color,
                  marginBottom:'4px', letterSpacing:'0.05em', textTransform:'uppercase' }}>
                  {g.type}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {g.words.map(w => (
                    <span key={w} style={{ background:g.bg, color:g.color,
                      border:`0.5px solid ${g.color}35`, fontSize:'10px',
                      padding:'2px 7px', borderRadius:'6px', fontWeight:600 }}>{w}</span>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ fontSize:'10px', color:'#B4B2A9', marginTop:'8px', lineHeight:1.5 }}>
              These words are detected automatically from the audio — no typing needed
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
  const sevColor = { CRITICAL:'#A32D2D', WARNING:'#633806', NORMAL:'#0F6E56' }[sev]
  const sevBg    = { CRITICAL:'#FCEBEB', WARNING:'#FAEEDA', NORMAL:'#E1F5EE' }[sev]
  const sevBdr   = { CRITICAL:'#F09595', WARNING:'#FAC775', NORMAL:'#9FE1CB' }[sev]
  const CARD  = { background:'#ffffff', border:'0.5px solid #D3D1C7', borderRadius:'12px', padding:'18px', marginBottom:'12px' }
  const LABEL = { fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'10px', display:'block' }

  return (
    <div className="fade-in">

      {/* Score hero */}
      <div style={{ background:sevBg, border:`0.5px solid ${sevBdr}`, borderRadius:'14px',
        padding:'22px', display:'flex', alignItems:'center', gap:'22px', marginBottom:'12px' }}>
        <ScoreRing score={r.total_score} severity={sev} size={110}/>
        <div style={{ flex:1 }}>
          <SeverityBadge severity={sev}/>
          <div style={{ fontSize:'13px', color:'#5F5E5A', marginTop:'10px', marginBottom:'14px', lineHeight:1.5 }}>
            {sev==='CRITICAL' && 'Supervisor alerted. Clip saved automatically.'}
            {sev==='WARNING'  && 'Flagged for supervisor review.'}
            {sev==='NORMAL'   && 'No violations — normal enforcement interaction.'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            <div style={{ background:'rgba(255,255,255,0.7)', borderRadius:'8px', padding:'10px 12px', border:'0.5px solid #E8E6DF' }}>
              <div style={{ fontSize:'10px', color:'#888780', marginBottom:'3px', textTransform:'uppercase', letterSpacing:'0.06em' }}>Tone Score</div>
              <div style={{ fontSize:'18px', fontWeight:700, color:'#185FA5' }}>{r.tone_score}/50</div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.7)', borderRadius:'8px', padding:'10px 12px', border:'0.5px solid #E8E6DF' }}>
              <div style={{ fontSize:'10px', color:'#888780', marginBottom:'3px', textTransform:'uppercase', letterSpacing:'0.06em' }}>Keyword Score</div>
              <div style={{ fontSize:'18px', fontWeight:700, color:'#534AB7' }}>{r.keyword_score}/50</div>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-detected transcript — shown as evidence, not input */}
      {r.transcript && (
        <div style={CARD}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
            <span style={LABEL}>Speech Detected from Audio</span>
            <span style={{ background:'#E1F5EE', color:'#0F6E56', fontSize:'10px',
              padding:'2px 8px', borderRadius:'5px', fontWeight:700, marginBottom:'10px' }}>
              Auto-detected via {r.transcription_method === 'whisper' ? 'Whisper AI' : 'Acoustic'}
            </span>
          </div>
          <div style={{ fontSize:'13px', color:'#5F5E5A', lineHeight:1.7, fontStyle:'italic',
            background:'#F8F7F4', borderRadius:'7px', padding:'11px 14px',
            borderLeft:'3px solid #D3D1C7' }}>
            "{r.transcript}"
          </div>
        </div>
      )}

      {/* Key metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        {[
          { label:'EO Voice',    value:r.eo_detected?'Detected':'Not found', sub:`max sim ${r.max_similarity}`, color:r.eo_detected?'#1D9E75':'#E24B4A' },
          { label:'EO Speaking', value:`${r.eo_speaking_sec}s`, sub:`of ${r.total_duration_sec}s total` },
          { label:'Processed in',value:`${r.processing_time_sec}s`, sub:`${r.speech_segments} speech segs` },
        ].map(m => (
          <div key={m.label} style={{ background:'#F8F7F4', border:'0.5px solid #E8E6DF', borderRadius:'10px', padding:'14px' }}>
            <div style={{ fontSize:'10px', color:'#888780', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'8px' }}>{m.label}</div>
            <div style={{ fontSize:'18px', fontWeight:700, color:m.color||'#2C2C2A', marginBottom:'3px' }}>{m.value}</div>
            <div style={{ fontSize:'11px', color:'#888780' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* SVM Tone classifier */}
      <div style={CARD}>
        <span style={LABEL}>SVM Tone Classifier</span>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
          {['NORMAL','HARSH','BRIBE_TONE'].map(l => (
            <ToneBar key={l} label={l} prob={r.tone_proba?.[l]||0} active={r.tone_label===l}/>
          ))}
        </div>
      </div>

      {/* Acoustics */}
      {r.eo_detected && ac.avg_pitch_hz > 0 && (
        <div style={CARD}>
          <span style={LABEL}>EO Voice Acoustics</span>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            {[
              ['Pitch',        `${ac.avg_pitch_hz} Hz`,    ac.avg_pitch_hz > ep*1.55 ? '#E24B4A':'#1D9E75'],
              ['Baseline',     `${ep} Hz (enrolled)`,      '#888780'],
              ['Pitch ratio',  `${ac.pitch_ratio}x`,       ac.pitch_ratio>1.55?'#E24B4A':'#1D9E75'],
              ['Energy',       `${ac.avg_energy}`,         ac.avg_energy>0.28?'#E24B4A':'#1D9E75'],
              ['Loud duration',`${ac.loud_duration_sec}s`, ac.loud_duration_sec>4?'#BA7517':'#1D9E75'],
              ['Agitation',    `${ac.agitation}`,          ac.agitation>1.2?'#BA7517':'#1D9E75'],
            ].map(([lbl,val,col]) => (
              <div key={lbl} style={{ display:'flex', justifyContent:'space-between', background:'#F8F7F4', borderRadius:'7px', padding:'8px 11px' }}>
                <span style={{ fontSize:'11px', color:'#888780' }}>{lbl}</span>
                <span style={{ fontSize:'12px', fontWeight:700, color:col }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violations */}
      <div style={CARD}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
          <span style={LABEL}>Violations Detected from Voice</span>
          <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 9px', borderRadius:'7px',
            background:r.violations?.length>0?'#FCEBEB':'#E1F5EE',
            color:r.violations?.length>0?'#A32D2D':'#0F6E56',
            border:`0.5px solid ${r.violations?.length>0?'#F09595':'#9FE1CB'}` }}>
            {r.violations?.length||0} found
          </span>
        </div>
        {r.violations?.length > 0 ? (
          r.violations.map((v,i) => <ViolationCard key={i} v={v} index={i}/>)
        ) : (
          <div style={{ textAlign:'center', padding:'20px', color:'#1D9E75', fontSize:'13px' }}>
            <div style={{ fontSize:'22px', marginBottom:'6px' }}>✓</div>
            No violations detected — normal enforcement interaction
          </div>
        )}
      </div>

      <div style={{ fontSize:'10px', color:'#B4B2A9', textAlign:'right', letterSpacing:'0.04em' }}>
        {r.officer_name} · {r.timestamp?.slice(0,19).replace('T',' ')} · #{r.incident_id}
      </div>
    </div>
  )
}