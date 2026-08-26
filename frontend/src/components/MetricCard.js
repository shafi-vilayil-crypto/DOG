import { Link } from "react-router-dom";
import { Activity, ArrowDownRight, ArrowUpRight, ShieldCheck, Wallet, Zap } from "lucide-react";
const icons = { activity: Activity, wallet: Wallet, zap: Zap, shield: ShieldCheck };
export default function MetricCard({ item }) {
  const Icon = icons[item.icon] || Activity;
  const down = item.delta.includes("↓");
  const body = (
    <>
      <div className="metric-icon"><Icon size={18} /></div>
      <div className="metric-label">{item.label}<span className="metric-arrow"><ArrowUpRight size={14} /></span></div>
      <div className="metric-value">{item.value}</div>
      <div className={`metric-note ${down ? "positive" : ""}`}>
        {down ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
        <strong>{item.delta}</strong> <span>{item.note}</span>
      </div>
    </>
  );
  const testId = `metric-${item.label.toLowerCase().replace(/\s+/g, "-")}`;
  const className = `metric-card tone-${item.tone}${item.to ? " metric-card-link" : ""}`;
  if (item.to) return <Link to={item.to} className={className} data-testid={testId}>{body}</Link>;
  return <div className={className} data-testid={testId}>{body}</div>;
}
