/**
 * Live microphone input.
 *
 * The application normally drives the transmit chain with a deterministic
 * synthetic voice, which keeps the physics reproducible and the tests honest.
 * But the first question anyone asks in front of this thing is "what does MY
 * voice look like", so a presenter can hand the chain a real microphone and
 * watch their own syllables push the ALC and light the finals.
 *
 * This is opt-in, off by default, and the only place in the app that touches a
 * device permission. It fails soft: no getUserMedia, a denied prompt or an
 * unplugged interface all leave the synthetic voice running with a message that
 * says what happened.
 */

export type MicStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported' | 'error'

export interface MicReading {
  /** Peak envelope over the last analysis frame, 0..1. */
  readonly peak: number
  /** RMS over the last analysis frame, 0..1. */
  readonly rms: number
  /** Fraction of frames in the last second that clipped. */
  readonly clipping: number
}

const SILENT: MicReading = { peak: 0, rms: 0, clipping: 0 }

export class Microphone {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private buffer: Float32Array<ArrayBuffer> = new Float32Array(1024)
  private clipHistory: number[] = []
  private reading: MicReading = SILENT

  status: MicStatus = 'idle'
  message = ''

  get isLive(): boolean {
    return this.status === 'live'
  }

  /**
   * Ask for the microphone. Must be called from a user gesture — browsers
   * refuse otherwise, and a silent refusal would look like a bug.
   */
  async start(): Promise<MicStatus> {
    if (this.status === 'live') return this.status
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.status = 'unsupported'
      this.message = 'This browser does not offer microphone access. The synthetic voice keeps running.'
      return this.status
    }

    this.status = 'requesting'
    try {
      // Processing is off: the point is to see the raw envelope, and automatic
      // gain control would flatten exactly the dynamics being demonstrated.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      await this.ctx.resume()
      const source = this.ctx.createMediaStreamSource(this.stream)
      const analyser = this.ctx.createAnalyser()
      analyser.fftSize = 2048
      // Short, because we want syllables, not a slow meter.
      analyser.smoothingTimeConstant = 0.15
      source.connect(analyser)
      this.analyser = analyser
      this.buffer = new Float32Array(analyser.fftSize)
      this.status = 'live'
      this.message = ''
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.status = 'denied'
        this.message = 'Microphone access was refused. Allow it in the browser address bar, then try again.'
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.status = 'error'
        this.message = 'No microphone was found. Plug one in and try again.'
      } else {
        this.status = 'error'
        this.message = 'The microphone could not be opened. The synthetic voice keeps running.'
      }
      this.stop()
    }
    return this.status
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.ctx?.close()
    this.ctx = null
    this.analyser = null
    this.reading = SILENT
    this.clipHistory = []
    if (this.status === 'live') {
      this.status = 'idle'
      this.message = ''
    }
  }

  /** Read the current envelope. Cheap enough to call every frame. */
  sample(): MicReading {
    const analyser = this.analyser
    if (!analyser) return SILENT
    analyser.getFloatTimeDomainData(this.buffer)
    let peak = 0
    let sum = 0
    for (let i = 0; i < this.buffer.length; i++) {
      const v = this.buffer[i] ?? 0
      const a = Math.abs(v)
      if (a > peak) peak = a
      sum += v * v
    }
    const rms = Math.sqrt(sum / this.buffer.length)

    // A one-second window of clip flags, so the UI can say "you are clipping"
    // rather than flickering on a single loud sample.
    this.clipHistory.push(peak >= 0.995 ? 1 : 0)
    if (this.clipHistory.length > 60) this.clipHistory.shift()
    const clipping =
      this.clipHistory.reduce((a, b) => a + b, 0) / Math.max(1, this.clipHistory.length)

    this.reading = { peak: Math.min(1, peak), rms: Math.min(1, rms), clipping }
    return this.reading
  }

  get last(): MicReading {
    return this.reading
  }
}

/** One instance for the app. A second AudioContext would just fight the first. */
export const microphone = new Microphone()
