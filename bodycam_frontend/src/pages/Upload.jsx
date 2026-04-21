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
  const [mediaUrl, setMediaUrl] = useState(null)
  const inputRef = useRef()

  const handleFile = f => {
    if (!f) return
    if (mediaUrl) URL.revokeObjectURL(mediaUrl)
    setFile(f); setResult(null); setError(null)
    setMediaUrl(URL.createObjectURL(f))
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

          {/* Media Player — shows after upload */}
          {file && mediaUrl && (
            <MediaPlayer file={file} url={mediaUrl} diarization={result?.diarization}/>
          )}

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

  {/* Speaker Diarization — Person 1 (EO) vs Person 2 (Customer) */}
      <SpeakerDiarizationPanel diarization={r.diarization}/>

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


function GeminiAssessment({ assessment, analysis, greeting }) {
  const g = analysis || {}
  const oa = g.overall_assessment || {}
  const summary = oa.summary || assessment || ''
  const action = oa.recommended_action || ''
  const classification = (oa.classification || '').toLowerCase()
  const cls = CLASS_COLOR[classification] || { fg:'#8B5CF6', label:(oa.classification || 'ANALYZED').toUpperCase() }
  const risk = typeof oa.risk_score === 'number' ? oa.risk_score : null

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

  if (!summary && !action && detectedList.length === 0 && risk === null && !greetingMissing && !greetingPartial) return null

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
            Gemini Multimodal Audio Analysis
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

        {oa.is_flagged && (
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


function MediaPlayer({ file, url, diarization }) {
  const mediaRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentSpeaker, setCurrentSpeaker] = useState(null)
  const isVideo = file?.type?.startsWith('video')

  const togglePlay = () => {
    const m = mediaRef.current
    if (!m) return
    if (playing) { m.pause() } else { m.play() }
  }

  const onTimeUpdate = () => {
    const t = mediaRef.current?.currentTime || 0
    setCurrentTime(t)
    if (diarization?.segments?.length) {
      const seg = diarization.segments.find(s => t >= s.start && t <= s.end)
      setCurrentSpeaker(seg?.speaker || null)
    }
  }

  const onLoadedMeta = () => setDuration(mediaRef.current?.duration || 0)

  const seek = e => {
    const bar = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - bar.left) / bar.width
    if (mediaRef.current && duration > 0) {
      mediaRef.current.currentTime = Math.max(0, Math.min(duration, pct * duration))
    }
  }

  const jumpToSpeaker = (spk) => {
    const seg = diarization?.segments?.find(s => s.speaker === spk)
    if (seg && mediaRef.current) {
      mediaRef.current.currentTime = seg.start
      if (!playing) mediaRef.current.play()
    }
  }

  const fmt = s => {
    if (!s || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60), ss = Math.floor(s % 60)
    return `${m}:${ss.toString().padStart(2, '0')}`
  }

  const segs = diarization?.segments || []
  const totalDur = duration || segs[segs.length-1]?.end || 1

  return (
    <div style={CARD}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
        <span style={LABEL}>{isVideo ? '🎬' : '🎙'} Media Player</span>
        {currentSpeaker && (
          <span style={{ fontSize:'10px', fontWeight:800, padding:'3px 10px', borderRadius:'6px',
            background: currentSpeaker === 'EO' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
            color: currentSpeaker === 'EO' ? '#EF4444' : '#10B981',
            border: `1px solid ${currentSpeaker === 'EO' ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'}`,
            letterSpacing:'0.06em' }}>
            🔊 {currentSpeaker === 'EO' ? 'PERSON 1 · EO' : 'PERSON 2 · CUSTOMER'}
          </span>
        )}
      </div>

      <div style={{ background:'#000', borderRadius:'10px', overflow:'hidden', marginBottom:'10px',
        aspectRatio: isVideo ? '16/9' : 'auto' }}>
        {isVideo ? (
          <video ref={mediaRef} src={url}
            onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
            onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMeta}
            style={{ width:'100%', height:'100%', display:'block', background:'#000' }}/>
        ) : (
          <>
            <audio ref={mediaRef} src={url}
              onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
              onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMeta}
              style={{ display:'none' }}/>
            <div style={{ padding:'28px 16px', display:'flex', alignItems:'center', justifyContent:'center',
              background:'linear-gradient(135deg, #0B0F1A, #111827)', minHeight:'90px' }}>
              <div style={{ fontSize:'40px', color: playing ? '#10B981' : '#3B82F6', opacity: playing ? 1 : 0.5 }}>
                {playing ? '▶' : '♪'}
              </div>
            </div>
          </>
        )}
      </div>

      <div onClick={seek} style={{ position:'relative', height:'22px', background:'#0B0F1A',
        borderRadius:'6px', cursor:'pointer', overflow:'hidden', marginBottom:'8px',
        border:'1px solid #1F2937' }}>
        {segs.map((s, i) => {
          const left = (s.start / totalDur) * 100
          const width = ((s.end - s.start) / totalDur) * 100
          return (
            <div key={i} style={{ position:'absolute', left:`${left}%`, width:`${width}%`,
              top:0, bottom:0,
              background: s.speaker === 'EO' ? 'rgba(239,68,68,0.45)' : 'rgba(16,185,129,0.45)' }}/>
          )
        })}
        <div style={{ position:'absolute', top:0, bottom:0, left:0,
          width:`${(currentTime / (totalDur || 1)) * 100}%`,
          background:'rgba(59,130,246,0.25)',
          borderRight: currentTime > 0 ? '2px solid #3B82F6' : 'none',
          pointerEvents:'none' }}/>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
        <button onClick={togglePlay} style={{
          background: playing ? 'linear-gradient(135deg, #EF4444, #DC2626)' : 'linear-gradient(135deg, #3B82F6, #2563EB)',
          color:'#fff', border:'none', borderRadius:'8px', padding:'8px 14px',
          fontSize:'13px', fontWeight:800, cursor:'pointer', minWidth:'70px' }}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <span style={{ fontSize:'11px', color:'#94A3B8', fontWeight:600,
          fontFamily:'ui-monospace, monospace' }}>
          {fmt(currentTime)} / {fmt(totalDur)}
        </span>
      </div>

      {segs.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px', marginTop:'10px' }}>
          <button onClick={() => jumpToSpeaker('EO')} style={{
            background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
            color:'#EF4444', borderRadius:'8px', padding:'8px', fontSize:'11px',
            fontWeight:700, cursor:'pointer', textAlign:'left' }}>
            <div>👮 Person 1 (EO)</div>
            <div style={{ fontSize:'9px', color:'#64748B', marginTop:'2px' }}>
              {diarization?.eo_total_sec || 0}s · {diarization?.eo_segments_count || 0} parts
            </div>
          </button>
          <button onClick={() => jumpToSpeaker('Customer')} style={{
            background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)',
            color:'#10B981', borderRadius:'8px', padding:'8px', fontSize:'11px',
            fontWeight:700, cursor:'pointer', textAlign:'left' }}>
            <div>👤 Person 2 (Customer)</div>
            <div style={{ fontSize:'9px', color:'#64748B', marginTop:'2px' }}>
              {diarization?.customer_total_sec || 0}s · {diarization?.customer_segments_count || 0} parts
            </div>
          </button>
        </div>
      )}
    </div>
  )
}


function SpeakerDiarizationPanel({ diarization }) {
  if (!diarization || !diarization.segments || diarization.segments.length === 0) return null
  const d = diarization
  const totalSpoken = (d.eo_total_sec || 0) + (d.customer_total_sec || 0)
  const eoPct = totalSpoken > 0 ? ((d.eo_total_sec / totalSpoken) * 100).toFixed(0) : 0
  const custPct = totalSpoken > 0 ? ((d.customer_total_sec / totalSpoken) * 100).toFixed(0) : 0

  return (
    <div style={CARD}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
        <span style={LABEL}>🗣 Speaker Detection (Voice Diarization)</span>
        <span style={{ fontSize:'10px', fontWeight:700, color:'#94A3B8',
          background:'rgba(148,163,184,0.1)', padding:'3px 10px', borderRadius:'6px' }}>
          {d.speaker_count} speaker{d.speaker_count === 1 ? '' : 's'} detected
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.25)',
          borderRadius:'12px', padding:'14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
            <span style={{ fontSize:'18px' }}>👮</span>
            <span style={{ fontSize:'12px', fontWeight:800, color:'#EF4444', letterSpacing:'0.05em' }}>
              PERSON 1 — EO
            </span>
          </div>
          <div style={{ fontSize:'22px', fontWeight:900, color:'#EF4444', lineHeight:1 }}>
            {d.eo_total_sec || 0}<span style={{ fontSize:'12px', color:'#64748B', fontWeight:600 }}>s</span>
          </div>
          <div style={{ fontSize:'10px', color:'#64748B', marginTop:'4px' }}>
            {eoPct}% of speech · {d.eo_segments_count} segment{d.eo_segments_count === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{ background:'rgba(16,185,129,0.05)', border:'1px solid rgba(16,185,129,0.2)',
          borderRadius:'12px', padding:'14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
            <span style={{ fontSize:'18px' }}>👤</span>
            <span style={{ fontSize:'12px', fontWeight:800, color:'#10B981', letterSpacing:'0.05em' }}>
              PERSON 2 — CUSTOMER
            </span>
          </div>
          <div style={{ fontSize:'22px', fontWeight:900, color:'#10B981', lineHeight:1 }}>
            {d.customer_total_sec || 0}<span style={{ fontSize:'12px', color:'#64748B', fontWeight:600 }}>s</span>
          </div>
          <div style={{ fontSize:'10px', color:'#64748B', marginTop:'4px' }}>
            {custPct}% of speech · {d.customer_segments_count} segment{d.customer_segments_count === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div style={{ height:'10px', background:'#0B0F1A', borderRadius:'5px', overflow:'hidden',
        display:'flex', border:'1px solid #1F2937', marginBottom:'12px' }}>
        <div style={{ width:`${eoPct}%`, background:'linear-gradient(90deg, #EF4444, #DC2626)' }}/>
        <div style={{ width:`${custPct}%`, background:'linear-gradient(90deg, #10B981, #059669)' }}/>
      </div>

      <div style={{ fontSize:'11px', color:'#64748B', lineHeight:1.6,
        background:'#0B0F1A', borderRadius:'8px', padding:'10px 12px',
        border:'1px solid #1F2937' }}>
        <strong style={{ color:'#94A3B8' }}>Note:</strong> Voice analysis and violations are scored
        only from <strong style={{ color:'#EF4444' }}>Person 1 (EO)</strong> — Person 2 (Customer) is
        shown for context and is never scored as an officer violation.
      </div>
    </div>
  )
}

