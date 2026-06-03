import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import FeeConfigFields from "./FeeConfigFields.jsx";
import RateFormatSelect from "./RateFormatSelect.jsx";
import ResultBadge from "./ResultBadge.jsx";
import { formatMoney, formatPercent } from "../lib/exchange.js";

export default function QuoteRow({
  quote,
  index,
  sourceCurrency,
  targetCurrency,
  isBest,
  bestAmount,
  onChange,
  onRemove,
  canRemove,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const difference = quote.finalAmount !== null ? bestAmount - quote.finalAmount : null;
  const percentGap =
    quote.finalAmount !== null && quote.finalAmount > 0
      ? (difference / quote.finalAmount) * 100
      : null;
  const formatInfo = quote.formatInfo || {
    message: "請確認匯率報價格式",
    formula: "",
  };
  const quotePlaceholder = `報價${String.fromCharCode(65 + index)}`;

  return (
    <div className={`rounded-lg border bg-white p-3 shadow-sm ${isBest ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"}`}>
      <div className="grid gap-2 lg:grid-cols-[0.95fr_1.1fr_0.85fr_1.1fr_8rem]">
        <input
          value={quote.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={quotePlaceholder}
          className="h-10 min-w-0 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
        <RateFormatSelect
          value={quote.format}
          onChange={(format) => onChange({ format })}
          rate={quote.rate}
          sourceCurrency={sourceCurrency}
          targetCurrency={targetCurrency}
        />
        <input
          type="number"
          min="0"
          step="0.0001"
          value={quote.rate}
          onChange={(event) => onChange({ rate: event.target.value })}
          placeholder="輸入匯率報價"
          className="h-10 min-w-0 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
        <FeeConfigFields
          feeConfig={quote.feeConfig}
          onChange={(feeConfig) => onChange({ feeConfig })}
          sourceCurrency={sourceCurrency}
          targetCurrency={targetCurrency}
        />
        <div className="flex items-center justify-end gap-2">
          {isBest ? <ResultBadge>最佳</ResultBadge> : null}
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            title="查看結果"
            className="inline-flex h-10 min-w-16 items-center justify-center gap-1 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            結果
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            title="刪除報價"
            className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className={`mt-2 rounded-md px-2 py-1.5 text-xs font-bold ${
        quote.detectionLowConfidence ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
      }`}>
        <div>{formatInfo.message}</div>
        {formatInfo.formula ? <div className="mt-0.5 text-slate-500">{formatInfo.formula}</div> : null}
      </div>

      {quote.error ? <p className="mt-3 text-sm font-semibold text-red-600">{quote.error}</p> : null}

      {isOpen ? (
        <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-slate-500">實際匯率</div>
            <div className="font-bold text-slate-900">
              {quote.normalizedRate ? formatMoney(quote.normalizedRate, 6) : "-"}
            </div>
          </div>
          <div>
            <div className="text-slate-500">預計可得</div>
            <div className="font-bold text-slate-900">
              {quote.finalAmount !== null ? `${formatMoney(quote.finalAmount)} ${targetCurrency}` : "-"}
            </div>
          </div>
          <div>
            <div className="text-slate-500">手續費</div>
            <div className="font-bold text-slate-900">
              {quote.feeConfig?.type === "none" ? "無" : formatMoney(quote.feeAmount)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">與最佳差距</div>
            <div className="font-bold text-slate-900">
              {!isBest && quote.finalAmount !== null && bestAmount !== null
                ? `${formatMoney(difference)} ${targetCurrency} / ${formatPercent(percentGap)}`
                : isBest
                  ? "目前最高"
                  : "-"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
