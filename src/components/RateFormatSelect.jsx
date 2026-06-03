import { RATE_FORMATS } from "../lib/exchange.js";

function formatRateLabelValue(rate) {
  const numericRate = Number(rate);

  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return "輸入匯率報價";
  }

  return new Intl.NumberFormat("zh-Hant", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(numericRate);
}

function getFormatLabel(format, rate, sourceCurrency, targetCurrency) {
  const source = sourceCurrency || "現持有貨幣（賣出）";
  const target = targetCurrency || "想兌換成的貨幣（買入）";
  const value = formatRateLabelValue(rate);

  switch (format.value) {
    case "source100_to_target":
      return `100 ${source} 可換 ${value} ${target}`;
    case "source1_to_target":
      return `1 ${source} 可換 ${value} ${target}`;
    case "target100_to_source":
      return `100 ${target} 需要 ${value} ${source}`;
    case "target1_to_source":
      return `1 ${target} 需要 ${value} ${source}`;
    default:
      return format.label;
  }
}

export default function RateFormatSelect({
  value,
  onChange,
  rate,
  sourceCurrency,
  targetCurrency,
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
    >
      {RATE_FORMATS.map((format) => (
        <option key={format.value} value={format.value}>
          {getFormatLabel(format, rate, sourceCurrency, targetCurrency)}
        </option>
      ))}
    </select>
  );
}
