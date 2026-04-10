import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5050'

const api = axios.create({
  baseURL: BASE,
  timeout: 120000,  // 2 minutes — enrollment audio can be large
})

export const ApiService = {
  health:        ()             => api.get('/api/health'),
  getOfficers:   ()             => api.get('/api/officers'),
  getSamples:    ()             => api.get('/api/samples'),
  getKeywords:   ()             => api.get('/api/keywords'),
  getIncidents:  (p = {})       => api.get('/api/incidents', { params: p }),
  getIncident:   (id)           => api.get(`/api/incidents/${id}`),
  getDashboard:  ()             => api.get('/api/dashboard/stats'),

  analyzeSample: (filename, oid = 'EO_001') =>
    api.post('/api/analyze/sample', { filename, officer_id: oid }),

  analyzeUpload: (file, oid) => {
    const form = new FormData()
    form.append('audio',      file)
    form.append('officer_id', oid)
    return api.post('/api/analyze/upload', form, {
      timeout: 300000,  // 5 minutes for large audio files
    })
  },

  sendChunk: (blob, oid, sid, idx) => {
    const form = new FormData()
    form.append('audio',       blob, 'chunk.webm')
    form.append('officer_id',  oid)
    form.append('session_id',  sid)
    form.append('chunk_index', idx)
    return api.post('/api/livestream/chunk', form)
  },

  enrollOfficer: (oid, name, area, file) => {
    const form = new FormData()
    form.append('officer_id', oid)
    form.append('name',       name)
    form.append('area',       area || '')
    form.append('audio',      file, file.name || 'enrollment.wav')
    return api.post('/api/officers/enroll', form, {
      timeout: 120000,  // 2 minutes for enrollment
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export default ApiService