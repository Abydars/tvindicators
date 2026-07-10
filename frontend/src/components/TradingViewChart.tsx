import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { Candle, Drawing } from '../../../shared/types';

interface ChartProps {
  m1Candles: Candle[];
  drawings: Drawing[];
}

export default function TradingViewChart({ m1Candles, drawings }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const sessionSeriesRef = useRef<any>(null);
  const lineSeriesRefs = useRef<any[]>([]);

  // Time helper for Pakistan session highlighting
  const isInPakistanSession = (timeMs: number): boolean => {
    const dt = new Date(timeMs);
    const utcHours = dt.getUTCHours();
    const utcMinutes = dt.getUTCMinutes();
    // Karachi is UTC+5, offset by 300 minutes
    const karachiMinutes = (utcHours * 60 + utcMinutes + 300) % 1440;

    const s1Start = 12 * 60; // 12:00
    const s1End = 14 * 60;   // 14:00
    const s2Start = 18 * 60; // 18:00
    const s2End = 19.5 * 60; // 19:30

    return (
      (karachiMinutes >= s1Start && karachiMinutes < s1End) ||
      (karachiMinutes >= s2Start && karachiMinutes < s2End)
    );
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. Create the chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid' as any, color: '#0d1321' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(34, 47, 71, 0.3)' },
        horzLines: { color: 'rgba(34, 47, 71, 0.3)' },
      },
      crosshair: {
        mode: 1, // Normal
      },
      timeScale: {
        borderColor: '#222f47',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#222f47',
        autoScale: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });
    chartRef.current = chart;

    // 2. Add Candlestick Series (1m Chart) using Generic Series Loader (v5+)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // 3. Add Session Shading series (Histogram overlaid on a hidden price scale)
    const sessionSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(59, 130, 246, 0.05)', // light blue overlay
      priceFormat: { type: 'custom' },
      priceScaleId: 'session-scale',
    });
    chart.priceScale('session-scale').applyOptions({
      scaleMargins: { top: 0, bottom: 0 },
      visible: false,
    });
    sessionSeriesRef.current = sessionSeries;

    // Handle resizing
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.resize(
          chartContainerRef.current.clientWidth,
          chartContainerRef.current.clientHeight
        );
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Sync candles data and session highlights
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !sessionSeriesRef.current || m1Candles.length === 0) return;

    // Parse data to lightweight-charts formats (timestamp in seconds)
    const candleData = m1Candles.map((c) => ({
      time: (c.time / 1000) as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candlestickSeriesRef.current.setData(candleData);

    // Parse sessions (histogram height spans full height, value = 100)
    const sessionData = m1Candles.map((c) => ({
      time: (c.time / 1000) as any,
      value: isInPakistanSession(c.time) ? 100 : 0,
    }));
    sessionSeriesRef.current.setData(sessionData);

  }, [m1Candles]);

  // Sync drawings (sweep lines, CISD lines, and markers)
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candlestickSeriesRef.current;
    if (!chart || !candleSeries) return;

    // 1. Clear old line series drawings
    for (const lineSeries of lineSeriesRefs.current) {
      try {
        chart.removeSeries(lineSeries);
      } catch (e) {
        // Ignored
      }
    }
    lineSeriesRefs.current = [];

    // 2. Separate lines and markers from drawings array
    const lineDrawings = drawings.filter((d) => d.type === 'line');
    const markerDrawings = drawings.filter((d) => d.type === 'marker');

    // 3. Draw lines (Sweep and CISD levels)
    for (const drawing of lineDrawings) {
      if (drawing.x1 && drawing.y1 && drawing.x2 && drawing.y2) {
        const lineSeries = chart.addSeries(LineSeries, {
          color: drawing.color,
          lineWidth: drawing.width as any || 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });

        lineSeries.setData([
          { time: (drawing.x1 / 1000) as any, value: drawing.y1 },
          { time: (drawing.x2 / 1000) as any, value: drawing.y2 },
        ]);

        lineSeriesRefs.current.push(lineSeries);
      }
    }

    // 4. Draw markers (LONG/SHORT annotations)
    const chartMarkers = markerDrawings.map((d) => {
      const isLong = d.text === 'LONG';
      return {
        time: (d.x! / 1000) as any,
        position: d.position === 'aboveBar' ? 'aboveBar' as const : 'belowBar' as const,
        color: d.color,
        shape: isLong ? 'arrowUp' as const : 'arrowDown' as const,
        text: d.text || '',
        size: 1.5,
      };
    });

    // Sort markers chronologically to avoid lightweight chart warnings
    chartMarkers.sort((a, b) => (a.time as number) - (b.time as number));

    candleSeries.setMarkers(chartMarkers);

  }, [drawings, m1Candles]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}
