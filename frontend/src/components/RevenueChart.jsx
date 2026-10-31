import { useEffect, useRef, useState } from 'react'
import { formatCompactMoney, formatMoney } from '../format'

const SERIES = [
  { key: 'invoiced', label: 'Invoiced', className: 'series-1' },
  { key: 'collected', label: 'Collected', className: 'series-2' },
]
const HEIGHT = 260
const MARGIN = { top: 12, right: 12, bottom: 28, left: 64 }
const BAR_MAX = 24
const BAR_GAP = 2

const monthLabel = (month) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

function niceMax(value) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4) * magnitude
  return Math.ceil(value / step) * step
}

function columnPath(x, y, width, height) {
  const r = Math.min(4, width / 2, height)
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`
}

export default function RevenueChart({ rows }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState(null)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [showTable])

  const values = rows.map((row) => SERIES.map((series) => Number(row[series.key])))
  const max = niceMax(Math.max(0, ...values.flat()))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const plotWidth = width - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const band = plotWidth / Math.max(rows.length, 1)
  const barWidth = Math.min(BAR_MAX, (band * 0.7 - BAR_GAP) / 2)
  const y = (value) => MARGIN.top + plotHeight - (value / max) * plotHeight
  const showEvery = band < 40 ? 2 : 1

  return (
    <div className="chart-block">
      <div className="chart-header">
        <ul className="chart-legend">
          {SERIES.map((series) => (
            <li key={series.key}>
              <span className={`legend-swatch ${series.className}`} aria-hidden="true" />
              {series.label}
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-link" onClick={() => setShowTable((value) => !value)}>
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Invoiced</th>
                <th className="num">Collected</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <td>{monthLabel(row.month)}</td>
                  <td className="num">{formatMoney(row.invoiced)}</td>
                  <td className="num">{formatMoney(row.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" ref={wrapRef}>
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Invoiced and collected revenue per month"
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'chart-baseline' : 'chart-grid'} />
                <text x={MARGIN.left - 8} y={y(tick)} className="chart-tick" textAnchor="end" dominantBaseline="middle">
                  {formatCompactMoney(tick)}
                </text>
              </g>
            ))}
            {rows.map((row, index) => {
              const center = MARGIN.left + band * index + band / 2
              const groupStart = center - barWidth - BAR_GAP / 2
              return (
                <g key={row.month}>
                  {hover === index && (
                    <rect x={MARGIN.left + band * index} y={MARGIN.top} width={band} height={plotHeight} className="chart-hover-band" />
                  )}
                  {SERIES.map((series, s) => {
                    const value = values[index][s]
                    const height = (value / max) * plotHeight
                    if (height <= 0) return null
                    return (
                      <path
                        key={series.key}
                        d={columnPath(groupStart + s * (barWidth + BAR_GAP), y(value), barWidth, height)}
                        className={series.className}
                      />
                    )
                  })}
                  {index % showEvery === 0 && (
                    <text x={center} y={HEIGHT - 8} className="chart-tick" textAnchor="middle">
                      {monthLabel(row.month)}
                    </text>
                  )}
                  <rect
                    x={MARGIN.left + band * index}
                    y={MARGIN.top}
                    width={band}
                    height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() => setHover(index)}
                  />
                </g>
              )
            })}
          </svg>
          {hover !== null && (
            <div
              className="chart-tooltip"
              style={{
                left: Math.min(MARGIN.left + band * hover + band / 2 + 12, width - 190),
                top: MARGIN.top,
              }}
            >
              <strong>{monthLabel(rows[hover].month)}</strong>
              {SERIES.map((series) => (
                <div key={series.key} className="tooltip-row">
                  <span className={`legend-swatch ${series.className}`} aria-hidden="true" />
                  <span>{series.label}</span>
                  <span className="tooltip-value">{formatMoney(rows[hover][series.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
