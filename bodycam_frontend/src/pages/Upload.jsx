import React, { useState, useRef } from 'react'
import { ScoreRing, ViolationCard, ViolationSummary, ToneBar, Spinner, SeverityBadge, ScoreBar, SeverityScale, SEV } from '../components/UI'
import ApiService from '../services/api'

const CARD  = { background:'#111827', border:'1px solid #1F2937', borderRadius:'16px', padding:'22px', marginBottom:'14px' }
const LABEL = { fontSize:'10px', color:'#64748B', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700, marginBottom:'10px', display:'block' }

const OFFICERS = [
  { id:'EO_001', name:'Irfan Ali — PK-LHR-001' },
  { id:'EO_002', name:'Umar Farooq — PK-LHR-002' },
  { id:'EO_003', name:'Fatima Malik — PK-KHI-001' },
]

const PROGRESS_STEPS = [
  'Removing background noise...',
  'Identifying EO voice...',
  'Detecting officer greeting...',
  'Transcribing Urdu speech...',
  'Scanning for violation keywords...',
  'Calculating violation score...',
]

const GREETING_EXAMPLE = "Assalam Alaikum, mera naam [Name] hai, mein [Station] enforcement station se aaya hoon"

const KW_GROUPS = [
  { type:'RISHWAT',        icon:'💰', color:'#EF4444', words:['rishwat','paisa','deal','chhod do','chai paani','haath garam'] },
  { type:'DHAMKI',         icon:'⚠',  color:'#F97316', words:['arrest kar','jail','thana','maar doon ga','barbaad','FIR'] },
  { type:'GALI',           icon:'🤬', color:'#EAB308', words:['gadha','bewaqoof','kamina','harami','kutta','saala'] },
  { type:'RUDE_BEHAVIOR',  icon:'😤', color:'#8B5CF6', words:['chup raho','bakwas','attitude','nikal jao','auqat'] },
  { type:'HARASSMENT',     icon:'🚨', color:'#3B82F6', words:['naukri jayegi','dukaan band','badnaam','izzat'] },
  { type:'ANGRY_TONE',     icon:'🔊', color:'#F59E0B', words:['gussa','chillao','cheekh','daant','shor'] },
  { type:'POWER_ABUSE',    icon:'👊', color:'#A855F7', words:['officer hoon','meri marzi','mera hukum','seal laga'] },
  { type:'INTIMIDATION',   icon:'😰', color:'#6366F1', words:['dar gaya','anjaam bura','aakhri warning'] },
  { type:'GALAT_CHALLAN',  icon:'📋', color:'#06B6D4', words:['galat challan','galat amount','receipt nahi'] },
  { type:'UNPROFESSIONAL', icon:'📉', color:'#64748B', words:['mujhe kya','mera kaam nahi','bore'] },
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
    <div style={{ padding:'30px', maxWidth:'1200px' }}>
      <div style={{ marginBottom:'28px' }}>
        <h1 style={{ fontSize:'24px', fontWeight:800, color:'#F1F5F9', marginBottom:'6px',
          letterSpacing:'-0.02em' }}>
          Upload Body Cam Recording
        </h1>
        <p style={{ fontSize:'13px', color:'#64748B', lineHeight:1.6 }}>
          Upload audio or video · AI automatically detects EO voice ·
          transcribes Urdu speech · finds all violations · no typing needed
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'420px 1fr', gap:'24px', alignItems:'start' }}>

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
              style={{ border:`2px dashed ${drag ? '#3B82F6' : '#2D3348'}`,
                borderRadius:'14px', padding:'36px 20px', textAlign:'center',
                cursor:'pointer', background:drag ? 'rgba(59,130,246,0.08)' : '#0B0F1A',
                transition:'all .25s' }}>
              <input ref={inputRef} type="file"
                accept=".wav,.mp3,.mp4,.webm,.ogg,.m4a,.flac,.mov,.avi,.mkv,.aac,.3gp,.wma,.opus,audio/*,video/*"
                style={{ display:'none' }}
                onChange={e => handleFile(e.target.files[0])}/>
              {file ? (
                <div>
                  <div style={{ fontSize:'32px', marginBottom:'10px', color:'#10B981' }}>✓</div>
                  <div style={{ fontSize:'14px', fontWeight:700, color:'#F1F5F9', marginBottom:'6px', wordBreak:'break-all' }}>{file.name}</div>
                  <div style={{ fontSize:'12px', color:'#64748B' }}>
                    {(file.size/1024/1024).toFixed(2)} MB · {file.type.startsWith('video') ? '🎬 Video' : '🎙 Audio'} · Click to change
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize:'32px', color:'#3B82F6', marginBottom:'10px' }}>↑</div>
                  <div style={{ fontSize:'14px', fontWeight:700, color:'#94A3B8', marginBottom:'6px' }}>Drop Audio or Video here</div>
                  <div style={{ fontSize:'11px', color:'#10B981', fontWeight:600, marginBottom:'4px' }}>🎙 Audio: WAV · MP3 · OGG · M4A · FLAC · AAC</div>
                  <div style={{ fontSize:'11px', color:'#3B82F6', fontWeight:600 }}>🎬 Video: MP4 · WebM · MOV · AVI · MKV · 3GP</div>
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

          {/* Greeting Protocol */}
          <div style={{ ...CARD, background:'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(59,130,246,0.06))',
            border:'1px solid rgba(16,185,129,0.2)' }}>
            <span style={LABEL}>EO Greeting Protocol (Required)</span>
            <div style={{ background:'#0B0F1A', borderRadius:'10px', padding:'14px 16px',
              border:'1px solid #1F2937', marginBottom:'12px' }}>
              <div style={{ fontSize:'11px', color:'#10B981', fontWeight:700, marginBottom:'8px',
                letterSpacing:'0.06em', textTransform:'uppercase' }}>
                Suggested Greeting
              </div>
              <div style={{ fontSize:'13px', color:'#F1F5F9', lineHeight:1.8,
                fontStyle:'italic', direction:'ltr' }}>
                "{GREETING_EXAMPLE}"
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
              {[
                { icon:'🤝', label:'Salam', pts:'25 pts', desc:'Assalam Alaikum', color:'#10B981' },
                { icon:'👤', label:'Name', pts:'30 pts', desc:'Mera naam [Name] hai', color:'#3B82F6' },
                { icon:'🏢', label:'Station', pts:'25 pts', desc:'[Station] se aaya hoon', color:'#8B5CF6' },
                { icon:'🪪', label:'Role', pts:'20 pts', desc:'Enforcement Officer', color:'#F59E0B' },
              ].map(g => (
                <div key={g.label} style={{ background:'#111827', borderRadius:'8px', padding:'10px',
                  border:'1px solid #1F2937' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' }}>
                    <span style={{ fontSize:'11px', fontWeight:700, color:g.color }}>
                      {g.icon} {g.label}
                    </span>
                    <span style={{ fontSize:'9px', color:'#475569', fontWeight:600 }}>{g.pts}</span>
                  </div>
                  <div style={{ fontSize:'10px', color:'#64748B' }}>{g.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div style={{ ...CARD, background:'#0B0F1A', border:'1px solid #1F2937' }}>
            <span style={LABEL}>AI Detection Pipeline</span>
            {[
              { icon:'🎙', color:'#3B82F6', title:'Noise Removal',       desc:'Strips traffic, animals, crowd noise' },
              { icon:'👤', color:'#8B5CF6', title:'EO Voice Detection',  desc:'Finds officer voice among all speakers' },
              { icon:'🤝', color:'#10B981', title:'Greeting Detection',  desc:'Detects officer self-introduction (Salam + Name + Station)' },
              { icon:'🌐', color:'#10B981', title:'Urdu Transcription',  desc:'Gemini / Whisper converts speech to text' },
              { icon:'🧠', color:'#F59E0B', title:'Tone Analysis',       desc:'Detects shouting, pitch, agitation (SVM)' },
              { icon:'🔍', color:'#EF4444', title:'Keyword Detection',   desc:'588 keywords in 10 violation categories' },
            ].map(s => (
              <div key={s.title} style={{ display:'flex', gap:'12px', alignItems:'flex-start', marginBottom:'12px' }}>
                <div style={{ fontSize:'16px', flexShrink:0, marginTop:'1px' }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:700, color:s.color, marginBottom:'2px' }}>{s.title}</div>
                  <div style={{ fontSize:'11px', color:'#64748B' }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Keywords reference */}
          <div style={{ ...CARD, background:'#0B0F1A', border:'1px solid #1F2937' }}>
            <span style={LABEL}>588 Keywords · 10 Categories</span>
            {KW_GROUPS.map(g => (
              <div key={g.type} style={{ marginBottom:'12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
                  <span style={{ fontSize:'14px' }}>{g.icon}</span>
                  <span style={{ fontSize:'10px', fontWeight:700, color:g.color,
                    letterSpacing:'0.06em', textTransform:'uppercase' }}>
                    {g.type.replace(/_/g,' ')}
                  </span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {g.words.map(w => (
                    <span key={w} style={{ background:`${g.color}15`, color:g.color,
                      border:`1px solid ${g.color}25`, fontSize:'10px',
                      padding:'3px 8px', borderRadius:'6px', fontWeight:600 }}>{w}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={analyze} disabled={!file || loading}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
                gap:'8px', padding:'13px',
                background:(!file||loading)?'#1F2937':'linear-gradient(135deg, #3B82F6, #6366F1)',
                color:(!file||loading)?'#475569':'#fff',
                border:'none',
                borderRadius:'12px', fontSize:'14px', fontWeight:700,
                cursor:(!file||loading)?'not-allowed':'pointer', transition:'all .2s',
                boxShadow:(!file||loading)?'none':'0 4px 16px rgba(59,130,246,0.3)' }}>
              {loading ? <><Spinner size={16} color="#fff"/>{progress||'Analyzing...'}</> : '◎  Analyze Recording'}
            </button>
            <button onClick={() => { setFile(null); setResult(null); setError(null) }}
              style={{ padding:'13px 20px', background:'#1F2937', border:'1px solid #2D3348',
                borderRadius:'12px', fontSize:'13px', cursor:'pointer', color:'#94A3B8',
                fontWeight:600 }}>
              Clear
            </button>
          </div>

          {error && (
            <div style={{ marginTop:'12px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)',
              borderRadius:'10px', padding:'14px 16px', fontSize:'12px', color:'#EF4444' }}>
              {error}
            </div>
          )}
        </div>

        {/* RIGHT: Results */}
        <div>
          {loading && (
            <div style={{ ...CARD, textAlign:'center', padding:'70px 40px' }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:'22px' }}>
                <Spinner size={40} color="#3B82F6"/>
              </div>
              <div style={{ fontSize:'16px', fontWeight:700, color:'#F1F5F9', marginBottom:'10px' }}>
                AI Analyzing {file?.type?.startsWith('video') ? 'Video' : 'Audio'}
              </div>
              <div style={{ fontSize:'13px', color:'#3B82F6', minHeight:'20px', fontWeight:600 }}>
                {progress || 'Processing...'}
              </div>
              <div style={{ fontSize:'11px', color:'#475569', marginTop:'12px' }}>
                {file?.type?.startsWith('video') ? 'Extracting audio from video · ' : ''}Detecting voice · Transcribing Urdu · Finding violations
              </div>
            </div>
          )}

          {!loading && !result && !error && (
            <div style={{ ...CARD, textAlign:'center', padding:'70px 40px' }}>
              <div style={{ fontSize:'40px', color:'#2D3348', marginBottom:'16px' }}>◎</div>
              <div style={{ fontSize:'15px', fontWeight:700, color:'#475569', marginBottom:'10px' }}>
                Upload a recording to begin
              </div>
              <div style={{ fontSize:'12px', color:'#374151', lineHeight:1.8 }}>
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
  const s   = SEV[sev] || SEV.NORMAL
  const totalViols = r.violations?.length || 0
  const toneScore = r.tone_score || 0
  const kwScore = r.keyword_score || 0
  const transcriptMethod = (r.transcription_method || '').includes('gemini') ? 'Gemini 2.5 Flash'
    : (r.transcription_method || '').includes('google') ? 'Google Speech AI'
    : (r.transcription_method || '').includes('whisper') ? 'Whisper AI' : r.transcription_method || 'Auto'
  const mediaType = r.media_type || 'audio'

  return (
    <div className="fade-in">

      {/* Score hero */}
      <div style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:'20px',
        padding:'28px', display:'flex', alignItems:'center', gap:'28px', marginBottom:'14px',
        boxShadow:`0 4px 30px ${s.glow}`,
        animation: sev === 'CRITICAL' ? 'criticalPulse 3s infinite' : 'none' }}>
        <ScoreRing score={r.total_score} severity={sev} size={130}/>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px', flexWrap:'wrap' }}>
            <SeverityBadge severity={sev}/>
            <span style={{ fontSize:'11px', fontWeight:700, color:'#3B82F6',
              background:'rgba(59,130,246,0.12)', padding:'4px 12px', borderRadius:'8px',
              border:'1px solid rgba(59,130,246,0.25)' }}>
              {mediaType === 'video' ? '🎬 Video' : '🎙 Audio'}
            </span>
            {totalViols > 0 && (
              <span style={{ fontSize:'11px', fontWeight:700, color:'#EF4444',
                background:'rgba(239,68,68,0.12)', padding:'4px 12px', borderRadius:'8px',
                border:'1px solid rgba(239,68,68,0.25)' }}>
                {totalViols} violation{totalViols > 1 ? 's' : ''} found
              </span>
            )}
          </div>
          <div style={{ fontSize:'13px', color:'#94A3B8', marginBottom:'16px', lineHeight:1.6 }}>
            {sev==='CRITICAL' && 'Immediate action required — supervisor alerted automatically.'}
            {sev==='WARNING'  && 'Flagged for supervisor review — potential misconduct detected.'}
            {sev==='NORMAL'   && 'No significant violations — normal enforcement interaction.'}
          </div>
          {/* <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            <div style={{ background:'rgba(15,23,42,0.6)', borderRadius:'12px', padding:'14px', border:'1px solid #1F2937' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <span style={{ fontSize:'10px', color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>
                  🎙 Tone & Voice
                </span>
                <span style={{ fontSize:'18px', fontWeight:800, color:'#3B82F6' }}>{toneScore}</span>
              </div>
              <ScoreBar score={toneScore * 2} height={5}/>
            </div>
            <div style={{ background:'rgba(15,23,42,0.6)', borderRadius:'12px', padding:'14px', border:'1px solid #1F2937' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <span style={{ fontSize:'10px', color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>
                  🔍 Keywords
                </span>
                <span style={{ fontSize:'18px', fontWeight:800, color:'#8B5CF6' }}>{kwScore}</span>
              </div>
              <ScoreBar score={kwScore * 2} height={5}/>
            </div>
          </div> */}
        </div>
      </div>



   {/* Severity scale — shows the 0-29 / 30-69 / 70-100 bands */}
      <SeverityScale totalScore={r.total_score} severity={sev} counts={r.severity_counts || {}}/>

  {/* EO Greeting Detection */}
      {<GreetingPanel greeting={r.greeting}/>}

  {/* SVM Tone */}
      <div style={CARD}>
        <span style={LABEL}>🧠 AI Tone Classifier</span>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'8px' }}>
          {['NORMAL','HARSH','ANGRY','BRIBE_TONE'].map(l => (
            <ToneBar key={l} label={l}
              prob={r.tone_proba?.[l]||0}
              percent={r.tone_percents?.[l]}
              active={r.tone_label===l}/>
          ))}
        </div>
      </div>

   {/* Transcript */}
      {r.transcript && (
        <div style={CARD}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
            <span style={LABEL}>{mediaType === 'video' ? '🎬' : '🎙'} Speech Detected from {mediaType === 'video' ? 'Video' : 'Audio'}</span>
            <span style={{ background:'rgba(16,185,129,0.12)', color:'#10B981', fontSize:'10px',
              padding:'4px 12px', borderRadius:'8px', fontWeight:700, marginBottom:'10px',
              border:'1px solid rgba(16,185,129,0.25)' }}>
              {transcriptMethod}
            </span>
          </div>
          {(() => {
            const parts = (r.transcript || '').split(' | ')
            const urdu = parts[0] || ''
            const english = parts[1] || ''
            return (
              <div style={{ display:'grid', gridTemplateColumns: english ? '1fr 1fr' : '1fr', gap:'10px' }}>
                {/* Urdu */}
                <div style={{ background:'#0B0F1A', borderRadius:'12px', padding:'16px 18px',
                  borderLeft:'4px solid #3B82F6' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                    <span style={{ fontSize:'16px' }}>🇵🇰</span>
                    <span style={{ fontSize:'10px', fontWeight:700, color:'#3B82F6',
                      textTransform:'uppercase', letterSpacing:'0.08em' }}>Urdu / Original</span>
                  </div>
                  <div style={{ fontSize:'14px', color:'#F1F5F9', lineHeight:2,
                    fontFamily:'Georgia, serif', direction:'rtl', textAlign:'right' }}>
                    "{urdu}"
                  </div>
                </div>
                {/* English */}
                {english && (
                  <div style={{ background:'#0B0F1A', borderRadius:'12px', padding:'16px 18px',
                    borderLeft:'4px solid #10B981' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                      <span style={{ fontSize:'16px' }}>🇬🇧</span>
                      <span style={{ fontSize:'10px', fontWeight:700, color:'#10B981',
                        textTransform:'uppercase', letterSpacing:'0.08em' }}>English / Roman Urdu</span>
                    </div>
                    <div style={{ fontSize:'14px', color:'#F1F5F9', lineHeight:1.8,
                      fontFamily:'Georgia, serif' }}>
                      "{english}"
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* 🤖 GEMINI AI ASSESSMENT — Always shown */}
      <GeminiAssessment
        assessment={r.ai_assessment}
        analysis={r.gemini_analysis}
        greeting={r.greeting}
        behavior={r.behavior_assessment}
        severity={sev}
        totalScore={r.total_score}
        toneLabel={r.tone_label}
        violations={r.violations}
      />

      {/* Violations Detail */}
      <div style={CARD}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
          <span style={LABEL}>🚨 Violations Detected from Voice</span>
          <span style={{ fontSize:'12px', fontWeight:700, padding:'5px 14px', borderRadius:'10px',
            background: totalViols > 0 ? 'linear-gradient(135deg, #EF4444, #DC2626)' : 'linear-gradient(135deg, #10B981, #059669)',
            color:'#fff', boxShadow: totalViols > 0 ? '0 2px 8px rgba(239,68,68,0.3)' : '0 2px 8px rgba(16,185,129,0.3)' }}>
            {totalViols} found
          </span>
        </div>

        {totalViols > 0 && (
          <div style={{ fontSize:'12px', color:'#94A3B8', marginBottom:'14px', lineHeight:1.6 }}>
            Found <strong style={{ color:'#F1F5F9' }}>{totalViols} violation{totalViols === 1 ? '' : 's'}</strong>,
            numbered below in order of severity (Violation 1 is the most severe).
            Each card shows the violation name, what it means, a short description, its impact percentage,
            and any keywords detected from the transcript.
          </div>
        )}
        {totalViols > 0 ? (
          r.violations.map((v,i) => <ViolationCard key={i} v={v} index={i}/>)
        ) : (
          <div style={{ textAlign:'center', padding:'28px', color:'#10B981', fontSize:'14px' }}>
            <div style={{ fontSize:'32px', marginBottom:'10px' }}>✓</div>
            <div style={{ fontWeight:700 }}>No violations detected</div>
            <div style={{ fontSize:'12px', color:'#475569', marginTop:'6px' }}>Normal enforcement interaction</div>
          </div>
        )}
      </div>   {/* Key metrics */}
     

    
 <div style={{ display:'grid',   gridTemplateColumns: 'repeat(3, 1fr)', gap:'10px', marginBottom:'14px' }}>
        {[
          { label:'EO Voice', icon:'👤', value:r.eo_detected?'Detected':'Not found', sub:`similarity: ${r.max_similarity}`, color:r.eo_detected?'#10B981':'#EF4444' },
          { label:'Media Type', icon: mediaType==='video'?'🎬':'🎙', value: mediaType==='video'?'Video':'Audio', sub:`duration: ${r.total_duration_sec}s`, color:'#3B82F6' },
          { label:'Processed', icon:'⚡', value:`${r.processing_time_sec}s`, sub:`${r.speech_segments} speech segments` },
        ].map(m => (
          <div key={m.label} style={{ background:'#111827', border:'1px solid #1F2937', borderRadius:'14px', padding:'16px' }}>
            <div style={{ fontSize:'10px', color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, marginBottom:'10px' }}>
              {m.icon} {m.label}
            </div>
            <div style={{ fontSize:'20px', fontWeight:800, color:m.color||'#F1F5F9', marginBottom:'4px' }}>{m.value}</div>
            <div style={{ fontSize:'11px', color:'#475569' }}>{m.sub}</div>
          </div>
        ))}
      </div>
      {/* Voice Acoustics */}
      {r.eo_detected && ac.avg_pitch_hz > 0 && (
        <div style={CARD}>
          <span style={LABEL}>📊 EO Voice Acoustics</span>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
            {[
              ['Pitch',  `${ac.avg_pitch_hz} Hz`,    ac.avg_pitch_hz > ep*1.55 ? '#EF4444':'#10B981', 'Current pitch'],
              ['Baseline', `${ep} Hz`,                '#64748B', 'Enrolled pitch'],
              ['Ratio',  `${ac.pitch_ratio}x`,        ac.pitch_ratio>1.55?'#EF4444':'#10B981', 'Pitch vs normal'],
              ['Energy', `${ac.avg_energy}`,           ac.avg_energy>0.28?'#EF4444':'#10B981', 'Voice loudness'],
              ['Loud',   `${ac.loud_duration_sec}s`,   ac.loud_duration_sec>4?'#F59E0B':'#10B981', 'Shouting duration'],
              ['Agitation', `${ac.agitation}`,         ac.agitation>1.2?'#F59E0B':'#10B981', 'Voice instability'],
            ].map(([lbl,val,col,desc]) => (
              <div key={lbl} style={{ background:'#0B0F1A', borderRadius:'10px', padding:'12px', border:'1px solid #1F2937' }}>
                <div style={{ fontSize:'10px', color:'#475569', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700 }}>{lbl}</div>
                <div style={{ fontSize:'18px', fontWeight:800, color:col }}>{val}</div>
                <div style={{ fontSize:'10px', color:'#374151', marginTop:'3px' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

   

      {/* Violation Summary */}
      {totalViols > 0 && (
        <div style={CARD}>
          <span style={LABEL}>Violation Categories Detected</span>
          <ViolationSummary violations={r.violations}/>
        </div>
      )}

 

   
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        fontSize:'10px', color:'#374151', letterSpacing:'0.04em', padding:'6px 0' }}>
        <span>{r.officer_name} · {r.timestamp?.slice(0,19).replace('T',' ')}</span>
        <span>ID: {r.incident_id}</span>
      </div>
    </div>
  )
}

const CLASS_COLOR = {
  normal:         { fg:'#10B981', label:'NORMAL' },
  concerning:     { fg:'#EAB308', label:'CONCERNING' },
  unprofessional: { fg:'#F97316', label:'UNPROFESSIONAL' },
  critical:       { fg:'#EF4444', label:'CRITICAL' },
}

const SEV_COLOR = {
  none:     { fg:'#10B981', bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.3)' },
  low:      { fg:'#EAB308', bg:'rgba(234,179,8,0.12)',  border:'rgba(234,179,8,0.3)' },
  medium:   { fg:'#F97316', bg:'rgba(249,115,22,0.12)', border:'rgba(249,115,22,0.3)' },
  high:     { fg:'#EF4444', bg:'rgba(239,68,68,0.12)',  border:'rgba(239,68,68,0.3)' },
  critical: { fg:'#DC2626', bg:'rgba(220,38,38,0.15)',  border:'rgba(220,38,38,0.4)' },
}

function SevBadge({ severity }) {
  const s = SEV_COLOR[severity] || SEV_COLOR.none
  return (
    <span style={{ fontSize:'10px', fontWeight:700, letterSpacing:'0.06em',
      textTransform:'uppercase', color:s.fg, background:s.bg,
      border:`1px solid ${s.border}`, padding:'3px 10px', borderRadius:'8px' }}>
      {severity || 'none'}
    </span>
  )
}

function CategoryTile({ icon, title, data }) {
  const detected = !!data?.detected
  const severity = data?.severity || 'none'
  const instances = data?.instances || []
  const count = instances.length
  return (
    <div style={{ background:'#0B0F1A', borderRadius:'12px', padding:'14px 16px',
      border:`1px solid ${detected ? (SEV_COLOR[severity]?.border || '#1F2937') : '#1F2937'}` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'16px' }}>{icon}</span>
          <span style={{ fontSize:'12px', fontWeight:700, color:'#F1F5F9' }}>{title}</span>
        </div>
        {detected && <SevBadge severity={severity}/>}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'11px', fontWeight:700,
          color: detected ? '#EF4444' : '#10B981', letterSpacing:'0.04em' }}>
          {detected ? '● DETECTED' : '○ NOT DETECTED'}
        </span>
        {detected && count > 0 && (
          <span style={{ fontSize:'10px', color:'#64748B', fontWeight:600 }}>
            {count} instance{count > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {detected && instances.length > 0 && (
        <div style={{ marginTop:'10px', borderTop:'1px solid #1F2937', paddingTop:'10px',
          display:'flex', flexDirection:'column', gap:'8px', maxHeight:'160px', overflowY:'auto' }}>
          {instances.slice(0,4).map((inst, i) => (
            <div key={i} style={{ fontSize:'11px', color:'#94A3B8', lineHeight:1.5 }}>
              <div style={{ color:'#E2E8F0', fontWeight:600 }}>
                "{inst.text || inst.statement || inst.description || '—'}"
              </div>
              {(inst.translation || inst.reason || inst.type || inst.timestamp_approx) && (
                <div style={{ color:'#64748B', marginTop:'3px' }}>
                  {inst.translation || inst.reason || inst.type}
                  {inst.timestamp_approx ? ` · ${inst.timestamp_approx}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function GeminiAssessment({ assessment, analysis, greeting, behavior, severity, totalScore, toneLabel, violations }) {
  const g = analysis || {}
  const oa = g.overall_assessment || {}

  // Build fallback summary from available local data when Gemini is unavailable
  const buildFallbackSummary = () => {
    const parts = []
    const viols = violations || []
    const totalViols = viols.length
    const sev = severity || 'NORMAL'
    const rating = behavior?.overall_rating || (sev === 'CRITICAL' ? 'SEVERE_MISCONDUCT' : sev === 'WARNING' ? 'UNPROFESSIONAL' : 'PROFESSIONAL')

    if (sev === 'CRITICAL') {
      parts.push(`The officer's conduct in this recording is rated ${rating}, with a total violation score of ${totalScore}/100.`)
    } else if (sev === 'WARNING') {
      parts.push(`The officer's conduct in this recording is rated ${rating}, with a total violation score of ${totalScore}/100.`)
    } else {
      parts.push(`The officer's conduct in this recording is rated ${rating}, with a total violation score of ${totalScore}/100.`)
    }

    if (toneLabel && toneLabel !== 'NORMAL') {
      parts.push(`Voice tone was classified as ${toneLabel}.`)
    }

    if (totalViols > 0) {
      const catSet = new Set(viols.map(v => v.type))
      parts.push(`${totalViols} violation${totalViols === 1 ? '' : 's'} detected across categor${catSet.size === 1 ? 'y' : 'ies'}: ${[...catSet].join(', ')}.`)
    } else {
      parts.push('No behavioural violations were detected in the officer\'s voice.')
    }

    if (greeting) {
      if (greeting.greeting_compliance === 'FULL') {
        parts.push(`Officer followed the greeting protocol correctly (${greeting.greeting_score}/100).`)
      } else if (greeting.greeting_compliance === 'PARTIAL') {
        parts.push(`Officer only partially followed the greeting protocol (${greeting.greeting_score}/100).`)
      } else {
        parts.push(`Officer did not introduce themselves per EO protocol (${greeting.greeting_score}/100).`)
      }
    }

    return parts.join(' ')
  }

  const buildFallbackAction = () => {
    const sev = severity || 'NORMAL'
    if (sev === 'CRITICAL') {
      return 'Suspend officer pending investigation. Forward recording to Internal Affairs for disciplinary review. Schedule mandatory retraining on professional conduct, de-escalation, and anti-corruption protocols.'
    }
    if (sev === 'WARNING') {
      return 'Issue a formal warning to the officer. Schedule retraining on professional communication, de-escalation techniques, and respectful public interaction. Review additional body-camera footage for similar patterns.'
    }
    return 'No disciplinary action required. Continue routine monitoring and encourage the officer to maintain professional standards.'
  }

  const summary = oa.summary || assessment || buildFallbackSummary()
  const action = oa.recommended_action || buildFallbackAction()
  const classification = (oa.classification || (severity === 'CRITICAL' ? 'critical' : severity === 'WARNING' ? 'unprofessional' : 'normal')).toLowerCase()
  const cls = CLASS_COLOR[classification] || { fg:'#8B5CF6', label:(oa.classification || classification || 'ANALYZED').toUpperCase() }
  const risk = typeof oa.risk_score === 'number' ? oa.risk_score : (typeof totalScore === 'number' ? totalScore : null)

  const detectedList = [
    { key:'vulgar_language',       label:'Vulgar / Abusive Language' },
    { key:'false_statements',      label:'False or Misleading Statements' },
    { key:'loud_aggressive_voice', label:'Loud / Aggressive Voice' },
    { key:'bribery_indicators',    label:'Bribery Indicators' },
  ]
    .map(c => ({ ...c, data: g[c.key] }))
    .filter(c => c.data && c.data.detected)

  const greetingMissing = greeting && greeting.greeting_compliance === 'MISSING'
  const greetingPartial = greeting && greeting.greeting_compliance === 'PARTIAL'
  const isFlagged = oa.is_flagged !== undefined ? oa.is_flagged : (severity === 'CRITICAL' || severity === 'WARNING')
  const usingFallback = !oa.summary && !assessment

  return (
    <div style={{ background:'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.08))',
      border:'1px solid rgba(139,92,246,0.25)', borderRadius:'16px',
      padding:'22px', marginBottom:'14px' }}>

      {/* Purple header with Officer Behavior Assessment title + risk score */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
        <div style={{ width:40, height:40, borderRadius:'10px',
          background:'linear-gradient(135deg, #8B5CF6, #3B82F6)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 2px 8px rgba(139,92,246,0.3)' }}>
          <span style={{ fontSize:'20px' }}>🤖</span>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'15px', fontWeight:800, color:'#10B981', letterSpacing:'-0.01em' }}>
            Officer Behavior Assessment
          </div>
          <div style={{ fontSize:'10px', color:'#64748B', fontWeight:600,
            letterSpacing:'0.07em', textTransform:'uppercase' }}>
            {usingFallback ? 'Local Analysis — Gemini Unavailable' : 'Gemini Multimodal Audio Analysis'}
          </div>
        </div>
        {risk !== null && (
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'26px', fontWeight:900, color:cls.fg, lineHeight:1 }}>
              {risk}<span style={{ fontSize:'12px', color:'#64748B', fontWeight:600 }}>/100</span>
            </div>
            <div style={{ fontSize:'10px', fontWeight:800, color:cls.fg,
              letterSpacing:'0.08em', marginTop:'2px' }}>
              {cls.label}
            </div>
          </div>
        )}
      </div>

      {/* Inner light Gemini Assessment card */}
      <div style={{ background:'#F8FAF7', borderRadius:'12px', padding:'18px 20px',
        border:'1px solid #E5EFE3' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
          <span style={{ fontSize:'18px' }}>🤖</span>
          <span style={{ fontSize:'14px', fontWeight:800, color:'#0F7A3E',
            letterSpacing:'-0.01em' }}>
             Assessment
          </span>
        </div>

        {summary && (
          <div style={{ fontSize:'14px', color:'#1F2937', lineHeight:1.7, marginBottom:'14px' }}>
            {summary}
          </div>
        )}

        {detectedList.length > 0 && (
          <div style={{ fontSize:'13px', color:'#1F2937', lineHeight:1.7,
            marginBottom:'14px', background:'#FFF5F5', borderRadius:'8px',
            padding:'10px 14px', borderLeft:'3px solid #DC2626' }}>
            <span style={{ color:'#DC2626', fontWeight:800 }}>Violations Detected: </span>
            The following misconduct categories were identified in this recording —{' '}
            {detectedList.map((c, i) => (
              <span key={c.key}>
                <strong>{c.label}</strong>
                <span style={{ color:'#64748B', fontWeight:600 }}>
                  {' '}({c.data.severity}, {(c.data.instances || []).length} instance
                  {(c.data.instances || []).length === 1 ? '' : 's'})
                </span>
                {i < detectedList.length - 1 ? '; ' : '.'}
              </span>
            ))}
          </div>
        )}

        {detectedList.length === 0 && (violations || []).length > 0 && (
          <div style={{ fontSize:'13px', color:'#1F2937', lineHeight:1.7,
            marginBottom:'14px', background:'#FFF5F5', borderRadius:'8px',
            padding:'10px 14px', borderLeft:'3px solid #DC2626' }}>
            <span style={{ color:'#DC2626', fontWeight:800 }}>Violations Detected: </span>
            {(violations || []).length} violation{(violations || []).length === 1 ? '' : 's'} found in the officer's voice —{' '}
            {[...new Set((violations || []).map(v => v.type))].map((t, i, arr) => (
              <span key={t}>
                <strong>{t}</strong>{i < arr.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </div>
        )}

        {detectedList.length === 0 && (violations || []).length === 0 && !greetingMissing && !greetingPartial && (
          <div style={{ fontSize:'13px', color:'#1F2937', lineHeight:1.7,
            marginBottom:'14px', background:'#F0FDF4', borderRadius:'8px',
            padding:'10px 14px', borderLeft:'3px solid #10B981' }}>
            <span style={{ color:'#047857', fontWeight:800 }}>No Violations: </span>
            The officer's voice showed no signs of abusive language, aggressive tone, threats, or bribery indicators during this interaction.
          </div>
        )}

        {(greetingMissing || greetingPartial) && (
          <div style={{ fontSize:'13px', color:'#1F2937', lineHeight:1.7,
            marginBottom:'14px',
            background: greetingMissing ? '#FFF5F5' : '#FFFBEB',
            borderRadius:'8px', padding:'10px 14px',
            borderLeft:`3px solid ${greetingMissing ? '#DC2626' : '#F59E0B'}` }}>
            <span style={{ color: greetingMissing ? '#DC2626' : '#B45309', fontWeight:800 }}>
              EO Greeting Protocol: {greetingMissing ? 'MISSING (Officer Violation)' : 'PARTIAL'} —{' '}
            </span>
            The officer {greetingMissing ? 'did not' : 'only partially'} introduce themselves before the interaction
            (score: {greeting.greeting_score}/100).{' '}
            {!greeting.salam_found && 'No Salam greeting. '}
            {!greeting.name_introduced && 'Name not stated. '}
            {!greeting.station_mentioned && 'Station not mentioned. '}
            {!greeting.role_mentioned && 'Role/designation not stated. '}
            This is an <strong>Officer violation</strong> per EO self-identification protocol.
          </div>
        )}

        {action && (
          <div style={{ fontSize:'13px', color:'#374151', lineHeight:1.7 }}>
            <span style={{ color:'#0F7A3E', fontWeight:800 }}>Recommended Action: </span>
            {action}
          </div>
        )}

        {isFlagged && (
          <div style={{ marginTop:'12px', display:'inline-block',
            background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)',
            color:'#DC2626', fontSize:'10px', fontWeight:700, letterSpacing:'0.08em',
            padding:'4px 12px', borderRadius:'8px' }}>
            ⚑ FLAGGED FOR REVIEW
          </div>
        )}
      </div>

      {/* 4 misconduct category tiles — Vulgar / False / Aggressive / Bribery */}
      {analysis && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginTop:'14px' }}>
          <CategoryTile icon="🤬" title="Vulgar Language"    data={g.vulgar_language}/>
          <CategoryTile icon="🚫" title="False Statements"   data={g.false_statements}/>
          <CategoryTile icon="📢" title="Aggressive Voice"   data={g.loud_aggressive_voice}/>
          <CategoryTile icon="💰" title="Bribery Indicators" data={g.bribery_indicators}/>
        </div>
      )}
    </div>
  )
}


function GreetingPanel({ greeting }) {
  if (!greeting) return null
  const g = greeting
  const complianceColor = g.greeting_compliance === 'FULL' ? '#10B981'
    : g.greeting_compliance === 'PARTIAL' ? '#F59E0B' : '#EF4444'
  const complianceBg = g.greeting_compliance === 'FULL' ? 'rgba(16,185,129,0.08)'
    : g.greeting_compliance === 'PARTIAL' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'
  const complianceBorder = g.greeting_compliance === 'FULL' ? 'rgba(16,185,129,0.25)'
    : g.greeting_compliance === 'PARTIAL' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'

  const checkItems = [
    { key:'salam_found',       label:'Salam (Greeting)',       icon:'🤝', pts: g.greeting_score_breakdown?.salam || 0 },
    { key:'name_introduced',   label:'Officer Name',           icon:'👤', pts: g.greeting_score_breakdown?.name || 0 },
    { key:'station_mentioned', label:'Station / Area',         icon:'🏢', pts: g.greeting_score_breakdown?.station || 0 },
    { key:'role_mentioned',    label:'Role / Designation',     icon:'🪪', pts: g.greeting_score_breakdown?.role || 0 },
  ]

  return (
    <div style={{ background: complianceBg, border:`1px solid ${complianceBorder}`,
      borderRadius:'16px', padding:'22px', marginBottom:'14px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ width:40, height:40, borderRadius:'10px',
            background:`linear-gradient(135deg, ${complianceColor}, ${complianceColor}88)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 2px 8px ${complianceColor}40` }}>
            <span style={{ fontSize:'20px' }}>🤝</span>
          </div>
          <div>
            <div style={{ fontSize:'15px', fontWeight:800, color:complianceColor, letterSpacing:'-0.01em' }}>
              EO Greeting Detection
            </div>
            <div style={{ fontSize:'10px', color:'#64748B', fontWeight:600,
              letterSpacing:'0.07em', textTransform:'uppercase' }}>
              Officer Self-Identification Protocol
            </div>
          </div>
        </div>

        {/* Compliance Badge */}
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:'24px', fontWeight:900, color:complianceColor, lineHeight:1 }}>
            {g.greeting_score}<span style={{ fontSize:'12px', color:'#64748B', fontWeight:600 }}>/100</span>
          </div>
          <div style={{ fontSize:'10px', fontWeight:800, color:complianceColor,
            letterSpacing:'0.08em', marginTop:'2px', textTransform:'uppercase' }}>
            {g.greeting_compliance === 'FULL' ? 'Full Compliance' :
             g.greeting_compliance === 'PARTIAL' ? 'Partial' : 'No Greeting'}
          </div>
        </div>
      </div>

      {/* Checklist — 4 components */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'14px' }}>
        {checkItems.map(item => {
          const found = g[item.key]
          return (
            <div key={item.key} style={{ background:'#111827', borderRadius:'10px', padding:'12px 14px',
              border:`1px solid ${found ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}` }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'14px' }}>{item.icon}</span>
                  <span style={{ fontSize:'11px', fontWeight:700, color:'#E2E8F0' }}>{item.label}</span>
                </div>
                <span style={{ fontSize:'16px', fontWeight:800, color: found ? '#10B981' : '#EF4444' }}>
                  {found ? '✓' : '✗'}
                </span>
              </div>
              <div style={{ fontSize:'10px', color: found ? '#10B981' : '#EF4444', fontWeight:600, marginTop:'4px' }}>
                {found ? `+${item.pts} points` : '0 points — missing'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Extracted Info */}
      {(g.extracted_name || g.extracted_station || g.matched_officer_name) && (
        <div style={{ background:'#0B0F1A', borderRadius:'12px', padding:'14px 16px',
          border:'1px solid #1F2937', marginBottom:'14px' }}>
          <div style={{ fontSize:'10px', color:'#64748B', fontWeight:700, textTransform:'uppercase',
            letterSpacing:'0.08em', marginBottom:'10px' }}>Extracted from Voice</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }}>
            {g.extracted_name && (
              <div>
                <div style={{ fontSize:'10px', color:'#475569', marginBottom:'2px' }}>Officer Name</div>
                <div style={{ fontSize:'14px', fontWeight:800, color:'#3B82F6' }}>{g.extracted_name}</div>
              </div>
            )}
            {g.extracted_station && (
              <div>
                <div style={{ fontSize:'10px', color:'#475569', marginBottom:'2px' }}>Station / Area</div>
                <div style={{ fontSize:'14px', fontWeight:800, color:'#8B5CF6' }}>{g.extracted_station}</div>
              </div>
            )}
            {g.matched_officer_name && (
              <div>
                <div style={{ fontSize:'10px', color:'#475569', marginBottom:'2px' }}>Matched Officer</div>
                <div style={{ fontSize:'14px', fontWeight:800, color:'#10B981' }}>
                  {g.matched_officer_name}
                  {g.matched_officer_id && <span style={{ fontSize:'10px', color:'#64748B' }}> ({g.matched_officer_id})</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Identification Method */}
      {g.identification_method && (
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px' }}>
          <span style={{ fontSize:'10px', color:'#64748B', fontWeight:700, textTransform:'uppercase',
            letterSpacing:'0.06em' }}>ID Method:</span>
          <span style={{ fontSize:'11px', fontWeight:700, color:'#E2E8F0',
            background:'rgba(59,130,246,0.12)', padding:'4px 12px', borderRadius:'8px',
            border:'1px solid rgba(59,130,246,0.25)' }}>
            {g.identification_method}
          </span>
        </div>
      )}

      {/* Greeting Text */}
      {g.greeting_text && (
        <div style={{ background:'#0B0F1A', borderRadius:'10px', padding:'12px 16px',
          borderLeft:`4px solid ${complianceColor}`, marginBottom:'14px' }}>
          <div style={{ fontSize:'10px', color:'#64748B', fontWeight:700, marginBottom:'6px',
            textTransform:'uppercase', letterSpacing:'0.06em' }}>Greeting Detected</div>
          <div style={{ fontSize:'13px', color:'#F1F5F9', lineHeight:1.7, fontStyle:'italic' }}>
            "{g.greeting_text}"
          </div>
        </div>
      )}

      {/* Suggestions */}
      {g.suggestions && g.suggestions.length > 0 && (
        <div style={{ background:'rgba(245,158,11,0.08)', borderRadius:'10px', padding:'12px 16px',
          border:'1px solid rgba(245,158,11,0.2)' }}>
          <div style={{ fontSize:'10px', color:'#F59E0B', fontWeight:700, marginBottom:'8px',
            textTransform:'uppercase', letterSpacing:'0.06em' }}>Improvement Suggestions</div>
          {g.suggestions.map((s, i) => (
            <div key={i} style={{ fontSize:'12px', color:'#E2E8F0', marginBottom:'4px',
              display:'flex', gap:'8px', alignItems:'flex-start' }}>
              <span style={{ color:'#F59E0B', fontWeight:700, flexShrink:0 }}>•</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

