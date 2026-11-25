'use client';

import {useEffect, useMemo, useRef, useState, type PointerEvent} from 'react';
import type {CurvePoint} from '@/lib/rag/types';

interface Props {
  emeans: CurvePoint[];
  lloyd: CurvePoint[];
  seeds: number;
}

const HEIGHT = 300;
const PAD = {top: 16, right: 92, bottom: 40, left: 56};

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

export function LossChart({emeans, lloyd, seeds}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    const all = [...emeans, ...lloyd].map((p) => p.mse);
    const yTicks = niceTicks(Math.min(...all), Math.max(...all), 4);
    const y0 = yTicks[0];
    const y1 = yTicks[yTicks.length - 1];
    const xMax = Math.max(...lloyd.map((p) => p.epochs), ...emeans.map((p) => p.epochs));
    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (v: number) => PAD.left + (v / xMax) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * plotH;
    const path = (pts: CurvePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.epochs).toFixed(1)},${y(p.mse).toFixed(1)}`).join('');
    const xTicks = [0, 5, 10, 15, 20, 25].filter((t) => t <= xMax);
    return {x, y, yTicks, xTicks, xMax, plotW, plotH, emeansPath: path(emeans), lloydPath: path(lloyd)};
  }, [emeans, lloyd, width]);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const epochs = ((e.clientX - rect.left) / rect.width) * geom.xMax;
    setHoverX(Math.min(geom.xMax, Math.max(1, Math.round(epochs))));
  };

  const hoverE = hoverX === null ? undefined : emeans.find((p) => p.epochs === hoverX);
  const hoverL = hoverX === null ? undefined : lloyd.find((p) => p.epochs === hoverX);
  const lastE = emeans[emeans.length - 1];
  const lastL = lloyd[lloyd.length - 1];
  const tipLeft = hoverX === null ? 0 : geom.x(hoverX);
  const flip = tipLeft > width - 220;

  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="key key-emeans" /> e-means, final loss for a budget of T epochs
        </span>
        <span>
          <i className="key key-lloyd" /> Lloyd, loss after each iteration
        </span>
      </div>
      <div className="chart-wrap" ref={wrap}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Training loss against epochs. e-means reaches ${lastE.mse.toFixed(4)} at ${lastE.epochs} epochs; Lloyd reaches ${lastL.mse.toFixed(4)} after ${lastL.epochs} iterations.`}
        >
          {geom.yTicks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={PAD.left + geom.plotW} y1={geom.y(t)} y2={geom.y(t)} />
              <text className="tick" x={PAD.left - 8} y={geom.y(t)} textAnchor="end" dominantBaseline="middle">
                {t.toFixed(3)}
              </text>
            </g>
          ))}
          <line className="axis" x1={PAD.left} x2={PAD.left + geom.plotW} y1={PAD.top + geom.plotH} y2={PAD.top + geom.plotH} />
          {geom.xTicks.map((t) => (
            <text key={t} className="tick" x={geom.x(t)} y={PAD.top + geom.plotH + 18} textAnchor="middle">
              {t}
            </text>
          ))}
          <text className="axis-title" x={PAD.left + geom.plotW / 2} y={HEIGHT - 4} textAnchor="middle">
            Epochs (passes over the 110 passage vectors)
          </text>
          <text className="axis-title" x={12} y={PAD.top + geom.plotH / 2} transform={`rotate(-90 12 ${PAD.top + geom.plotH / 2})`} textAnchor="middle">
            MSE
          </text>

          {hoverX !== null ? (
            <line className="crosshair" x1={geom.x(hoverX)} x2={geom.x(hoverX)} y1={PAD.top} y2={PAD.top + geom.plotH} />
          ) : null}

          <path className="series series-lloyd" d={geom.lloydPath} />
          <path className="series series-emeans" d={geom.emeansPath} />
          {emeans.map((p) => (
            <circle key={p.epochs} className="dot dot-emeans" cx={geom.x(p.epochs)} cy={geom.y(p.mse)} r={4.5} />
          ))}
          {hoverL ? <circle className="dot dot-lloyd" cx={geom.x(hoverL.epochs)} cy={geom.y(hoverL.mse)} r={4.5} /> : null}

          <text className="end-label" x={geom.x(lastE.epochs) + 10} y={geom.y(lastE.mse)} dominantBaseline="middle">
            e-means {lastE.mse.toFixed(4)}
          </text>
          <text className="end-label" x={geom.x(lastL.epochs) + 10} y={geom.y(lastL.mse)} dominantBaseline="middle">
            Lloyd {lastL.mse.toFixed(4)}
          </text>

          <rect
            className="hit"
            x={PAD.left}
            y={PAD.top}
            width={geom.plotW}
            height={geom.plotH}
            onPointerMove={onMove}
            onPointerLeave={() => setHoverX(null)}
          />
        </svg>
        {hoverX !== null && (hoverE || hoverL) ? (
          <div
            className="chart-tip"
            style={{left: flip ? undefined : tipLeft + 12, right: flip ? width - tipLeft + 12 : undefined}}
            role="status"
          >
            <p className="chart-tip-title">{hoverX} {hoverX === 1 ? 'epoch' : 'epochs'}</p>
            {hoverE ? (
              <p>
                <i className="key key-emeans" /> e-means <span className="num">{hoverE.mse.toFixed(4)}</span>
                <span className="chart-tip-range num">
                  {' '}
                  ({hoverE.min.toFixed(4)}–{hoverE.max.toFixed(4)})
                </span>
              </p>
            ) : null}
            {hoverL ? (
              <p>
                <i className="key key-lloyd" /> Lloyd <span className="num">{hoverL.mse.toFixed(4)}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <figcaption className="chart-caption">
        Median over {seeds} seeds; the tooltip shows the range across seeds. Each e-means point is a separate run whose
        cosine schedule is fitted to that epoch budget.
      </figcaption>
      <details className="chart-table">
        <summary>Show as a table</summary>
        <table className="trace-table">
          <thead>
            <tr>
              <th scope="col" className="num">
                Epochs
              </th>
              <th scope="col" className="num">
                e-means MSE
              </th>
              <th scope="col" className="num">
                Lloyd MSE
              </th>
            </tr>
          </thead>
          <tbody>
            {lloyd.map((l) => {
              const e = emeans.find((p) => p.epochs === l.epochs);
              return (
                <tr key={l.epochs}>
                  <td className="num">{l.epochs}</td>
                  <td className="num">{e ? e.mse.toFixed(4) : '–'}</td>
                  <td className="num">{l.mse.toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
