// ────────────────────────────────────────────────────────────────────
//  Browser-side video → audio extraction using ffmpeg.wasm.
//
//  Why this exists:
//    • A 1-hour bodycam video can be 500 MB – 1 GB.
//    • Uploading that to the server is slow and burns bandwidth.
//    • ffmpeg.wasm runs the same ffmpeg in the browser via WebAssembly
//      and spits out a tiny ~10 MB Opus audio file.
//    • The user's PC does the work; the server only sees compressed audio.
//
//  Output: 16 kHz mono Opus inside an OGG container — ~10 MB for 1 hour.
//  Backend Python sees this as a normal audio upload (Whisper handles .ogg).
// ────────────────────────────────────────────────────────────────────

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

let _ffmpeg = null
let _loadPromise = null

const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.3gp', '.flv', '.wmv', '.m4v']

/** True if the file is a video that should be audio-stripped before upload. */
export function isVideoFile(file) {
  if (!file) return false
  if (file.type && file.type.startsWith('video/')) return true
  const name = (file.name || '').toLowerCase()
  return VIDEO_EXTS.some(ext => name.endsWith(ext))
}

/** Lazy-load ffmpeg.wasm only the first time it's needed (~30 MB download, cached). */
async function loadFfmpeg(onProgress) {
  if (_ffmpeg) return _ffmpeg
  if (_loadPromise) return _loadPromise

  _loadPromise = (async () => {
    const ff = new FFmpeg()

    if (onProgress) {
      ff.on('log', ({ message }) => {
        // ffmpeg writes progress to stderr; pass it up so the UI can show "decoding..."
        if (typeof onProgress === 'function') onProgress({ stage: 'log', message })
      })
      ff.on('progress', ({ progress }) => {
        if (typeof onProgress === 'function')
          onProgress({ stage: 'progress', percent: Math.round((progress || 0) * 100) })
      })
    }

    await ff.load({
      coreURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.js`,  'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    _ffmpeg = ff
    return ff
  })()

  return _loadPromise
}

/**
 * Extracts the audio track from a video File and returns a Blob suitable for upload.
 *
 * @param {File} videoFile           The user's video.
 * @param {(p: object) => void} [onProgress]   Optional: called with { stage, percent, message }.
 * @returns {Promise<{ blob: Blob, filename: string, sizeBytes: number, durationMs: number }>}
 */
export async function extractAudioFromVideo(videoFile, onProgress) {
  if (!videoFile) throw new Error('No video file provided')

  const t0 = performance.now()
  const ff = await loadFfmpeg(onProgress)

  // Use unique names so concurrent extractions don't collide.
  const inputName  = `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.bin`
  const outputName = `out_${Date.now()}.ogg`

  if (onProgress) onProgress({ stage: 'reading', message: 'Reading video file...' })
  await ff.writeFile(inputName, await fetchFile(videoFile))

  if (onProgress) onProgress({ stage: 'extracting', message: 'Extracting audio...' })
  // -vn       = drop video
  // -ac 1     = mono
  // -ar 16000 = 16 kHz (matches Whisper)
  // -c:a libopus -b:a 24k = Opus codec at 24 kbps (small, voice-quality)
  await ff.exec([
    '-i', inputName,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'libopus',
    '-b:a', '24k',
    outputName,
  ])

  const data = await ff.readFile(outputName)

  // Cleanup the in-memory virtual filesystem so memory doesn't pile up.
  try { await ff.deleteFile(inputName)  } catch {}
  try { await ff.deleteFile(outputName) } catch {}

  const blob = new Blob([data.buffer], { type: 'audio/ogg' })
  const baseName = (videoFile.name || 'recording').replace(/\.[^/.]+$/, '')
  const filename = `${baseName}.ogg`

  const result = {
    blob,
    filename,
    sizeBytes: blob.size,
    durationMs: Math.round(performance.now() - t0),
  }

  if (onProgress) onProgress({
    stage: 'done',
    message: `Extracted ${(blob.size / 1024 / 1024).toFixed(2)} MB audio in ${(result.durationMs / 1000).toFixed(1)}s`,
  })

  return result
}

/**
 * Wrapper that turns the result into a File the existing upload code can consume
 * unchanged. If the input is already audio, returns it as-is.
 */
export async function prepareUploadFile(file, onProgress) {
  if (!isVideoFile(file)) return file
  const { blob, filename } = await extractAudioFromVideo(file, onProgress)
  return new File([blob], filename, { type: 'audio/ogg', lastModified: Date.now() })
}
