import ResultBadge from "./ResultBadge.jsx";
import { formatMoney, formatPercent } from "../lib/exchange.js";

export default function PlanCard({ title, finalAmount, targetCurrency, isBest, bestAmount, error, details }) {
  const difference = finalAmount !== null && bestAmount !== null ? bestAmount - finalAmount : null;
  const percentGap =
    finalAmount !== null && finalAmount > 0 && difference !== null
      ? (difference / finalAmount) * 100
      : null;

  return (
    <div className={`rounded-lg border bg-white p-5 shadow-sm ${isBest ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{details}</p>
        </div>
        {isBest ? <ResultBadge>最佳方案</ResultBadge> : null}
      </div>
      <div className="text-3xl font-black text-slate-950">
        {finalAmount !== null ? formatMoney(finalAmount) : "-"}
        <span className="ml-2 text-base font-bold text-slate-500">{targetCurrency}</span>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      {!isBest && finalAmount !== null && bestAmount !== null ? (
        <p className="mt-4 text-sm text-slate-600">
          最佳方案多得 <strong className="text-slate-900">{formatMoney(difference)} {targetCurrency}</strong>
          ，優勢 <strong className="text-slate-900">{formatPercent(percentGap)}</strong>
        </p>
      ) : null}
    </div>
  );
}
