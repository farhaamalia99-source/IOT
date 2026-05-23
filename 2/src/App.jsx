import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Area, AreaChart
} from 'recharts'

// ─── KONSTANTA (sama persis dengan sketch.ino) ────────────────────────────
const THRESHOLD_WARNING  = 30.0
const THRESHOLD_OVERLOAD = 45.0
const MAX_WEIGHT         = 52.0
const STEP_DEFAULT       = 0.5  // kg per detik

function getStatus(w) {
  if (w > THRESHOLD_OVERLOAD) return 'OVERLOAD'
  if (w > THRESHOLD_WARNING)  return 'WARNING'
  return 'NORMAL'
}

// ─── GAUGE SVG ────────────────────────────────────────────────────────────
function Gauge({ weight }) {
  const pct    = Math.min(weight / MAX_WEIGHT, 1)
  const angle  = -135 + pct * 270
  const r      = 80
  const cx     = 100, cy = 100
  const toRad  = d => (d * Math.PI) / 180

  const arcPath = (startDeg, endDeg, color, strokeW = 10) => {
    const s = toRad(startDeg - 90)
    const e = toRad(endDeg - 90)
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return <path d={`M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
                 fill="none" stroke={color} strokeWidth={strokeW}
                 strokeLinecap="round" />
  }

  const status = getStatus(weight)
  const needleColor = status === 'OVERLOAD' ? '#ef4444' : status === 'WARNING' ? '#eab308' : '#22c55e'
  const nx = cx + (r - 18) * Math.cos(toRad(angle - 90))
  const ny = cy + (r - 18) * Math.sin(toRad(angle - 90))

  return (
    <svg viewBox="0 0 200 140" className="gauge-svg">
      {/* background arc */}
      {arcPath(-135, 135, '#1e2d45', 10)}
      {/* normal zone */}
      {arcPath(-135, -135 + (THRESHOLD_WARNING/MAX_WEIGHT)*270, '#22c55e', 10)}
      {/* warning zone */}
      {arcPath(-135 + (THRESHOLD_WARNING/MAX_WEIGHT)*270,
               -135 + (THRESHOLD_OVERLOAD/MAX_WEIGHT)*270, '#eab308', 10)}
      {/* overload zone */}
      {arcPath(-135 + (THRESHOLD_OVERLOAD/MAX_WEIGHT)*270, 135, '#ef4444', 10)}
      {/* needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
            stroke={needleColor} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill={needleColor} />
      {/* labels */}
      <text x="22" y="130" fill="#64748b" fontSize="9" textAnchor="middle">0</text>
      <text x="100" y="22"  fill="#64748b" fontSize="9" textAnchor="middle">26</text>
      <text x="178" y="130" fill="#64748b" fontSize="9" textAnchor="middle">{MAX_WEIGHT}</text>
    </svg>
  )
}

// ─── LCD DISPLAY ──────────────────────────────────────────────────────────
function LCD({ weight, status }) {
  const line1 = `Berat: ${weight.toFixed(2).padStart(6)} kg`
  const line2 = status === 'OVERLOAD' ? '!! OVERLOAD !!  '
              : status === 'WARNING'  ? '> WARNING       '
              :                         'Status: NORMAL  '
  return (
    <div className="lcd">
      <div className="lcd-line">{line1}</div>
      <div className="lcd-line">{line2}</div>
    </div>
  )
}

// ─── LED ─────────────────────────────────────────────────────────────────
function LEDs({ status, tick }) {
  const normalOn   = status === 'NORMAL'
  const warningOn  = status === 'WARNING'  && tick % 2 === 0
  const overloadOn = status === 'OVERLOAD' && tick % 2 === 0

  return (
    <div className="leds-row">
      {[
        { label: 'NORMAL',   on: normalOn,   cls: 'on-green'  },
        { label: 'WARNING',  on: warningOn,  cls: 'on-yellow' },
        { label: 'OVERLOAD', on: overloadOn, cls: 'on-red'    },
      ].map(({ label, on, cls }) => (
        <div className="led-item" key={label}>
          <div className={`led-circle ${on ? cls : 'off'}`} />
          <span className="led-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── BUZZER ───────────────────────────────────────────────────────────────
function BuzzerIcon({ active }) {
  return (
    <div className={`buzzer-icon ${active ? 'active' : ''}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
           stroke={active ? '#ef4444' : '#64748b'} strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 1 0 8" />
        <path d="M14.7 10.7a2 2 0 0 1 0 2.6" />
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      </svg>
    </div>
  )
}

// ─── CUSTOM CHART TOOLTIP ─────────────────────────────────────────────────
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background:'#111827', border:'1px solid #1e2d45',
                  borderRadius:8, padding:'8px 12px', fontSize:'0.75rem' }}>
      <div style={{ color:'#64748b' }}>t = {d.t}s</div>
      <div style={{ color:'#22c55e', fontFamily:'monospace' }}>
        {d.weight.toFixed(2)} kg
      </div>
      <div style={{ color: d.status==='OVERLOAD'?'#ef4444':d.status==='WARNING'?'#eab308':'#22c55e' }}>
        {d.status}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  // simulasi state (sama dengan variabel di sketch.ino)
  const [weight,   setWeight]   = useState(0)
  const [goingUp,  setGoingUp]  = useState(true)
  const [running,  setRunning]  = useState(true)
  const [speed,    setSpeed]    = useState(STEP_DEFAULT)   // step kg/s
  const [tick,     setTick]     = useState(0)             // untuk blinking
  const [uptime,   setUptime]   = useState(0)
  const [history,  setHistory]  = useState([])            // grafik
  const [logs,     setLogs]     = useState([])            // serial monitor
  const [stats,    setStats]    = useState({ normal:0, warning:0, overload:0, maxSeen:0 })

  const weightRef  = useRef(0)
  const goingRef   = useRef(true)
  const logEndRef  = useRef(null)

  const addLog = useCallback((text, type = 'normal') => {
    setLogs(prev => {
      const next = [...prev, { t: uptime, text, type, id: Date.now() + Math.random() }]
      return next.length > 200 ? next.slice(-200) : next
    })
  }, [uptime])

  // ── Simulasi loop (setInterval 1000ms = 1 detik, persis sketch.ino loop()) ──
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setUptime(u => u + 1)
      setTick(t => (t + 1) % 2)

      // Logic identik dengan sketch.ino
      let w = weightRef.current
      let up = goingRef.current
      if (up) {
        w += speed
        if (w >= MAX_WEIGHT) { up = false }
      } else {
        w -= speed
        if (w <= 0) { w = 0; up = true }
      }
      w = Math.max(0, Math.min(MAX_WEIGHT, w))
      weightRef.current = w
      goingRef.current  = up

      const st = getStatus(w)
      setWeight(w)
      setGoingUp(up)

      setHistory(prev => {
        const next = [...prev, { t: prev.length, weight: w, status: st }]
        return next.length > 60 ? next.slice(-60) : next
      })

      setStats(prev => ({
        normal:   prev.normal   + (st === 'NORMAL'   ? 1 : 0),
        warning:  prev.warning  + (st === 'WARNING'  ? 1 : 0),
        overload: prev.overload + (st === 'OVERLOAD' ? 1 : 0),
        maxSeen:  Math.max(prev.maxSeen, w),
      }))

      // Serial log (sama dengan logSerial() di sketch.ino)
      setLogs(prev => {
        const t = prev.length > 0 ? prev[prev.length-1].t + 1 : 1
        const entries = [{ t, text: `${String(t).padEnd(8)}  ${w.toFixed(2).padEnd(10)}  ${st}`, type: st.toLowerCase(), id: Date.now() }]
        if (st === 'OVERLOAD') {
          entries.push({ t, text: `  [ALERT] OVERLOAD! ${w.toFixed(2)} kg > ${THRESHOLD_OVERLOAD} kg`, type: 'overload', id: Date.now()+1 })
          entries.push({ t, text: `  [MQTT]  → warehouse/scale/alert : OVERLOAD`, type: 'mqtt', id: Date.now()+2 })
        } else if (st === 'WARNING') {
          entries.push({ t, text: `  [ALERT] WARNING! ${w.toFixed(2)} kg > ${THRESHOLD_WARNING} kg`, type: 'warning', id: Date.now()+1 })
          entries.push({ t, text: `  [MQTT]  → warehouse/scale/alert : WARNING`, type: 'mqtt', id: Date.now()+2 })
        }
        const next = [...prev, ...entries]
        return next.length > 300 ? next.slice(-300) : next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running, speed])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Startup log
  useEffect(() => {
    setLogs([
      { t:0, text: '===========================================', type:'system', id:1 },
      { t:0, text: ' IoT Timbangan Digital Gudang – UNSIL 2026', type:'system', id:2 },
      { t:0, text: ' Farha Fadila Amalia | NPM: 237006072',      type:'system', id:3 },
      { t:0, text: '===========================================', type:'system', id:4 },
      { t:0, text: '', type:'system', id:5 },
      { t:0, text: '[SISTEM] Monitoring dimulai...', type:'system', id:6 },
      { t:0, text: '─────────────────────────────────────────', type:'system', id:7 },
      { t:0, text: 'Waktu(s)  Berat(kg)  Status', type:'system', id:8 },
      { t:0, text: '─────────────────────────────────────────', type:'system', id:9 },
    ])
  }, [])

  const status = getStatus(weight)
  const buzzerOn = status !== 'NORMAL'

  const statusColor = status === 'OVERLOAD' ? '#ef4444'
                    : status === 'WARNING'  ? '#eab308' : '#22c55e'

  const lineColor = (d) => {
    if (!d) return '#22c55e'
    if (d.status === 'OVERLOAD') return '#ef4444'
    if (d.status === 'WARNING')  return '#eab308'
    return '#22c55e'
  }

  const handleReset = () => {
    weightRef.current = 0
    goingRef.current  = true
    setWeight(0); setGoingUp(true); setUptime(0)
    setHistory([]); setStats({ normal:0, warning:0, overload:0, maxSeen:0 })
    setLogs([
      { t:0, text:'[SISTEM] Reset oleh pengguna. Mulai ulang...', type:'system', id:Date.now() }
    ])
  }

  return (
    <div className="app">

      {/* ── HEADER ── */}
      <div className="header">
        <div className="header-left">
          <h1>IoT Timbangan Digital <span>Gudang</span></h1>
          <p>Implementasi IoT Monitoring Beban Berbasis ESP32 + MQTT + Node-RED &nbsp;|&nbsp; UNSIL 2026</p>
          <p style={{ marginTop:2 }}>Farha Fadila Amalia &nbsp;·&nbsp; NPM: 237006072 &nbsp;·&nbsp; Dosen: Dr. Ir. Nur Widiyasono, M.Kom.</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end' }}>
          <div className="header-badge">
            <span className="dot-live" /> SIMULASI BERJALAN
          </div>
          <div style={{ fontSize:'0.75rem', color:'#64748b', fontFamily:'monospace' }}>
            Uptime: {uptime}s &nbsp;|&nbsp; ESP32 DevKit V1
          </div>
        </div>
      </div>

      {/* ── ROW 1: Gauge | LCD+LED | Stats | MQTT ── */}
      <div className="grid-main">

        {/* Gauge */}
        <div className="card">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Pembacaan Berat
          </div>
          <div className="gauge-wrap">
            <Gauge weight={weight} />
            <div className="gauge-val" style={{ color: statusColor }}>
              {weight.toFixed(2)}
              <span className="gauge-unit"> kg</span>
            </div>
            <div className="gauge-status-badge"
                 style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>
              {status}
            </div>
          </div>
        </div>

        {/* LCD + LED + Buzzer */}
        <div className="card">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            LCD I2C 16×2 + Indikator
          </div>
          <LCD weight={weight} status={status} />
          <LEDs status={status} tick={tick} />
          <div style={{ marginTop:16, textAlign:'center' }}>
            <BuzzerIcon active={buzzerOn} />
            <div style={{ fontSize:'0.72rem', color: buzzerOn ? '#ef4444' : '#64748b' }}>
              BUZZER {buzzerOn ? 'AKTIF 🔊' : 'OFF'}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="card">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            Statistik Operasional
          </div>
          <div className="stats-grid">
            <div className="stat-box green">
              <div className="val">{stats.normal}</div>
              <div className="lbl">Detik NORMAL</div>
            </div>
            <div className="stat-box yellow">
              <div className="val">{stats.warning}</div>
              <div className="lbl">Detik WARNING</div>
            </div>
            <div className="stat-box red">
              <div className="val">{stats.overload}</div>
              <div className="lbl">Detik OVERLOAD</div>
            </div>
            <div className="stat-box blue">
              <div className="val">{stats.maxSeen.toFixed(1)}</div>
              <div className="lbl">Berat Maks (kg)</div>
            </div>
          </div>

          {/* threshold info */}
          <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:6 }}>
            {[
              { label:'Batas Normal',   val:'< 30 kg', color:'#22c55e' },
              { label:'Batas Warning',  val:'30–45 kg', color:'#eab308' },
              { label:'Batas Overload', val:'> 45 kg', color:'#ef4444' },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between',
                fontSize:'0.75rem', color:'#94a3b8' }}>
                <span>{r.label}</span>
                <span style={{ color:r.color, fontFamily:'monospace', fontWeight:600 }}>{r.val}</span>
              </div>
            ))}
          </div>

          {/* controls */}
          <div className="controls">
            <button className={`btn ${running ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => setRunning(r => !r)}>
              {running ? '⏸ Pause' : '▶ Resume'}
            </button>
            <button className="btn btn-secondary" onClick={handleReset}>↺ Reset</button>
          </div>
          <div className="slider-wrap">
            <label>Kecepatan simulasi: {speed} kg/s</label>
            <input type="range" min="0.1" max="2" step="0.1"
                   value={speed} onChange={e => setSpeed(+e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── ROW 2: Chart | MQTT + Pin Map ── */}
      <div className="grid-bottom">

        {/* Chart */}
        <div className="card">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Grafik Berat Real-Time (60 detik terakhir)
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top:8, right:8, bottom:0, left:-10 }}>
                <defs>
                  <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                <XAxis dataKey="t" stroke="#334155" tick={{ fontSize:10, fill:'#64748b' }} label={{ value:'Waktu (s)', position:'insideBottom', offset:-2, fill:'#475569', fontSize:10 }} />
                <YAxis stroke="#334155" tick={{ fontSize:10, fill:'#64748b' }} domain={[0, MAX_WEIGHT]} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={THRESHOLD_WARNING}  stroke="#eab308" strokeDasharray="4 3" label={{ value:'Warning 30', fill:'#eab308', fontSize:9 }} />
                <ReferenceLine y={THRESHOLD_OVERLOAD} stroke="#ef4444" strokeDasharray="4 3" label={{ value:'Overload 45', fill:'#ef4444', fontSize:9 }} />
                <Area type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2}
                      fill="url(#wGrad)" dot={false} activeDot={{ r:4, fill:'#3b82f6' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Serial Log */}
          <div className="card-title" style={{ marginTop:20 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            Serial Monitor
          </div>
          <div className="serial-log">
            {logs.map(l => (
              <div className="log-line" key={l.id}>
                <span className="log-time">{l.t > 0 ? `[${l.t}s]` : '    '}</span>
                <span className={`log-${l.type}`}>{l.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Right column: MQTT + Pin Map */}
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* MQTT Topics */}
          <div className="card">
            <div className="card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V5a1 1 0 0 1 1-1h14"/><path d="M18 15v4a1 1 0 0 1-1 1H3"/><path d="m3 9 9-4 9 4-9 4-9-4z"/></svg>
              MQTT Topics (Simulasi)
            </div>
            {[
              { topic: 'warehouse/scale/weight', payload: `${weight.toFixed(3)} kg`, always: true },
              { topic: 'warehouse/scale/status', payload: status, always: true },
              { topic: 'warehouse/scale/alert',  payload: status !== 'NORMAL' ? status : '—', active: status !== 'NORMAL' },
              { topic: 'warehouse/scale/uptime', payload: `${uptime}s`, always: true },
            ].map(m => (
              <div className="mqtt-topic" key={m.topic}
                   style={{ borderColor: m.active ? 'rgba(239,68,68,0.3)' : undefined }}>
                <div className="topic">📡 {m.topic}</div>
                <div className="payload" style={{ color: m.active ? '#ef4444' : undefined }}>
                  ➜ {m.payload}
                </div>
              </div>
            ))}
          </div>

          {/* Pin Map */}
          <div className="card">
            <div className="card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M12 6v4"/><path d="M8 10H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-3"/></svg>
              Pin Mapping ESP32
            </div>
            <table className="pin-table">
              <thead>
                <tr><th>Komponen</th><th>Pin ESP32</th><th>Fungsi</th></tr>
              </thead>
              <tbody>
                {[
                  ['HX711 DOUT', 'D16', 'Data ADC'],
                  ['HX711 SCK',  'D4',  'Clock ADC'],
                  ['LCD SDA',    'D21', 'I2C Data'],
                  ['LCD SCL',    'D22', 'I2C Clock'],
                  ['LED Normal', 'D5',  'Indikator Hijau'],
                  ['LED Warning','D18', 'Indikator Kuning'],
                  ['LED Overload','D19','Indikator Merah'],
                  ['Buzzer',     'D23', 'Notifikasi Audio'],
                ].map(([comp, pin, fn]) => (
                  <tr key={comp}>
                    <td>{comp}</td>
                    <td><span className="pin-tag">{pin}</span></td>
                    <td style={{ color:'#64748b' }}>{fn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Wokwi link */}
          <div className="card" style={{ textAlign:'center' }}>
            <div style={{ fontSize:'0.78rem', color:'#64748b', marginBottom:12 }}>
              Simulasi hardware tersedia di:
            </div>
            <a href="https://wokwi.com/projects/464794943325882369"
               target="_blank" rel="noopener noreferrer"
               style={{ display:'inline-flex', alignItems:'center', gap:8,
                        background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)',
                        borderRadius:8, padding:'10px 20px', color:'#3b82f6',
                        textDecoration:'none', fontSize:'0.82rem', fontWeight:600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 0 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Buka di Wokwi Simulator
            </a>
          </div>

        </div>
      </div>

      <div className="footer">
        IoT Timbangan Digital Gudang &nbsp;·&nbsp; Farha Fadila Amalia (237006072) &nbsp;·&nbsp;
        Informatika, Universitas Siliwangi &nbsp;·&nbsp; 2026 &nbsp;|&nbsp;
        Dosen: Dr. Ir. Nur Widiyasono, M.Kom.
      </div>
    </div>
  )
}
