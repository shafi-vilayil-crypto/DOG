import { useEffect, useRef, useState } from "react";
import { PiggyBank, Sparkles, TrendingUp } from "lucide-react";
import { getSavingsToday } from "../services/dogApi";

const REFRESH_MS = 5000;
const REASON_ORDER = ["Duplicate prevention", "Loop prevention", "Cache hit", "Request coalescing"];

function useAnimatedNumber(target, duration = 800) {
  const [value, setValue] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) return undefined;
    let raf;
    const startedAt = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export default function SavingsWidget() {
  const [data, setData] = useState({ saved_usd: 0, prevented_calls: 0, by_reason: {} });
  const [error, setError] = useState("");
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getSavingsToday();
        if (cancelled) return;
        setData(prev => {
          if (next.saved_usd > prev.saved_usd) setPulseKey(k => k + 1);
          return next;
        });
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const animated = useAnimatedNumber(data.saved_usd);
  const [dollars, cents] = animated.toFixed(2).split(".");

  return (
    <section className="savings-widget" data-testid="savings-widget">
      <div className="savings-glow" aria-hidden="true" />
      <div className="savings-main">
        <div className="savings-kicker">
          <span className="savings-pulse" key={pulseKey} />
          <span>Saved today · live</span>
        </div>
        <div className="savings-amount" data-testid="savings-amount">
          <span className="savings-currency">$</span>
          <span className="savings-dollars">{Number(dollars).toLocaleString()}</span>
          <span className="savings-cents">.{cents}</span>
        </div>
        <div className="savings-meta">
          <PiggyBank size={14} />
          <strong data-testid="savings-prevented-count">{data.prevented_calls.toLocaleString()}</strong>
          <span>calls prevented before they hit a provider</span>
        </div>
        {error && <div className="savings-error" data-testid="savings-error">{error}</div>}
      </div>
      <div className="savings-breakdown">
        <div className="savings-breakdown-title">
          <TrendingUp size={13} />
          <span>Where DOG saved money</span>
        </div>
        {REASON_ORDER.map(reason => {
          const bucket = data.by_reason[reason] || { calls: 0, saved_usd: 0 };
          const pct = data.saved_usd > 0 ? Math.round((bucket.saved_usd / data.saved_usd) * 100) : 0;
          return (
            <div className="savings-row" key={reason} data-testid={`savings-row-${reason.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="savings-row-head">
                <span>{reason}</span>
                <b>${bucket.saved_usd.toFixed(2)}</b>
              </div>
              <div className="savings-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="savings-row-foot">
                <small>{bucket.calls.toLocaleString()} calls</small>
                <small>{pct}%</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className="savings-badge">
        <Sparkles size={13} />
        <span>DOG intelligence</span>
      </div>
    </section>
  );
}
