export type AmbientPreset = 'rain' | 'cafe' | 'ocean' | 'fire' | 'wind'

export const AMBIENT_PRESETS: Record<AmbientPreset, { label: string; emoji: string }> = {
  rain:  { label: '雨声', emoji: '🌧️' },
  cafe:  { label: '咖啡馆', emoji: '☕' },
  ocean: { label: '海浪', emoji: '🌊' },
  fire:  { label: '壁炉', emoji: '🔥' },
  wind:  { label: '微风', emoji: '🍃' },
}

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let activeNodes: AudioNode[] = []
let activePreset: AmbientPreset | null = null
let crackleTimer = 0

function getCtx() {
  if (!ctx) {
    ctx = new AudioContext()
    masterGain = ctx.createGain()
    masterGain.gain.value = 0.3
    masterGain.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return { ctx, masterGain: masterGain! }
}

function makeNoise(ac: AudioContext, seconds: number): AudioBuffer {
  const sr = ac.sampleRate
  const len = sr * seconds
  const buf = ac.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  return buf
}

function makeBrown(ac: AudioContext, seconds: number): AudioBuffer {
  const sr = ac.sampleRate
  const len = sr * seconds
  const buf = ac.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let v = 0
    for (let i = 0; i < len; i++) {
      v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02
      d[i] = v * 3.5
    }
  }
  return buf
}

function loop(ac: AudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const s = ac.createBufferSource()
  s.buffer = buf; s.loop = true; s.start()
  return s
}

function track(...nodes: AudioNode[]) { activeNodes.push(...nodes) }

function buildRain(ac: AudioContext, dest: AudioNode) {
  const n = loop(ac, makeNoise(ac, 4))
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 0.5
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 200
  const g = ac.createGain(); g.gain.value = 0.8
  n.connect(lp).connect(hp).connect(g).connect(dest)
  track(n, lp, hp, g)
}

function buildCafe(ac: AudioContext, dest: AudioNode) {
  const b = loop(ac, makeBrown(ac, 4))
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500
  const g = ac.createGain(); g.gain.value = 0.6
  b.connect(lp).connect(g).connect(dest)
  const n2 = loop(ac, makeNoise(ac, 3))
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.3
  const g2 = ac.createGain(); g2.gain.value = 0.08
  n2.connect(bp).connect(g2).connect(dest)
  track(b, lp, g, n2, bp, g2)
}

function buildOcean(ac: AudioContext, dest: AudioNode) {
  const n = loop(ac, makeNoise(ac, 6))
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600
  const g = ac.createGain(); g.gain.value = 0.7
  n.connect(lp).connect(g).connect(dest)
  const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.12
  const lg = ac.createGain(); lg.gain.value = 300
  lfo.connect(lg).connect(lp.frequency); lfo.start()
  track(n, lp, g, lfo, lg)
}

function buildFire(ac: AudioContext, dest: AudioNode) {
  const n = loop(ac, makeNoise(ac, 4))
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 1.5
  const g = ac.createGain(); g.gain.value = 0.5
  n.connect(bp).connect(g).connect(dest)
  const ck = loop(ac, makeNoise(ac, 2))
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000
  const cg = ac.createGain(); cg.gain.value = 0
  ck.connect(hp).connect(cg).connect(dest)
  track(n, bp, g, ck, hp, cg)
  function pop() {
    if (!activePreset) return
    const t = ac.currentTime
    cg.gain.setValueAtTime(0, t)
    cg.gain.linearRampToValueAtTime(0.15, t + 0.01)
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
    crackleTimer = window.setTimeout(pop, 100 + Math.random() * 400)
  }
  pop()
}

function buildWind(ac: AudioContext, dest: AudioNode) {
  const n = loop(ac, makeNoise(ac, 5))
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 0.4
  const g = ac.createGain(); g.gain.value = 0.5
  n.connect(bp).connect(g).connect(dest)
  const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08
  const lg = ac.createGain(); lg.gain.value = 150
  lfo.connect(lg).connect(bp.frequency); lfo.start()
  track(n, bp, g, lfo, lg)
}

const builders: Record<AmbientPreset, (ac: AudioContext, d: AudioNode) => void> = {
  rain: buildRain, cafe: buildCafe, ocean: buildOcean, fire: buildFire, wind: buildWind,
}

export function playAmbient(preset: AmbientPreset) {
  stopAmbient()
  const { ctx: ac, masterGain: mg } = getCtx()
  activePreset = preset
  builders[preset](ac, mg)
  localStorage.setItem('ambient_preset', preset)
}

export function stopAmbient() {
  if (crackleTimer) { clearTimeout(crackleTimer); crackleTimer = 0 }
  for (const n of activeNodes) { try { (n as AudioBufferSourceNode).stop?.() } catch {} }
  activeNodes = []
  activePreset = null
  localStorage.removeItem('ambient_preset')
}

export function setAmbientVolume(v: number) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v))
  localStorage.setItem('ambient_volume', String(v))
}

export function getAmbientVolume(): number {
  const s = localStorage.getItem('ambient_volume')
  return s ? parseFloat(s) : 0.3
}

export function getActivePreset(): AmbientPreset | null { return activePreset }

export function getSavedPreset(): AmbientPreset | null {
  return localStorage.getItem('ambient_preset') as AmbientPreset | null
}
