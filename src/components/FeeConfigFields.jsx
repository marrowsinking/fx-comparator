import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../i18n/I18nContext.jsx";

const FEE_MODES = [
  { value: "none", labelKey: "noFee", shortLabelKey: "noFee" },
  { value: "fixed", labelKey: "fixedFee", shortLabelKey: "fixedFee" },
  { value: "percent", labelKey: "percentageFee", shortLabelKey: "percentageFee" },
  { value: "percent_min", labelKey: "percentageMinFee", shortLabelKey: "percentageMinFee" },
  { value: "percent_max", labelKey: "percentageCapFee", shortLabelKey: "percentageCapFee" },
  { value: "percent_min_max", labelKey: "percentageMinCapFee", shortLabelKey: "percentageMinCapFee" },
];

function FeeInput({ label, value, onChange, placeholder }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-bold text-gray-500">
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 min-w-0 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}

export default function FeeConfigFields({
  feeConfig,
  onChange,
  compact = false,
  sourceCurrency,
  targetCurrency,
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const config = {
    type: "none",
    fixed: "0",
    percent: "0",
    min: "0",
    max: "0",
    feeCurrencyMode: "source",
    ...feeConfig,
  };
  const showPercent = ["percent", "percent_min", "percent_max", "percent_min_max"].includes(config.type);
  const showMin = ["percent_min", "percent_min_max"].includes(config.type);
  const showMax = ["percent_max", "percent_min_max"].includes(config.type);
  const showFixed = config.type === "fixed";
  const isNone = config.type === "none";
  const minNeedsConfirm = showMin && (!Number.isFinite(Number(config.min)) || Number(config.min) <= 0);

  function patch(nextPatch) {
    onChange({ ...config, ...nextPatch });
  }

  const selectedMode = FEE_MODES.find((mode) => mode.value === config.type) || FEE_MODES[0];

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="grid min-w-0 gap-2">
      {compact ? (
        <div ref={dropdownRef} className="relative min-w-0">
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="flex h-11 w-full min-w-0 items-center justify-between gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-slate-800 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
          >
            <span className="truncate">{t(selectedMode.shortLabelKey)}</span>
            <ChevronDown size={14} className="shrink-0 text-slate-500" />
          </button>
          {isOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 shadow-lg">
              {FEE_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => {
                    patch({ type: mode.value });
                    setIsOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${
                    mode.value === config.type ? "bg-blue-50 text-blue-700" : ""
                  }`}
                >
                  {t(mode.labelKey)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <select
          value={config.type}
          onChange={(event) => patch({ type: event.target.value })}
          className="h-11 min-w-0 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-slate-800 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
        >
          {FEE_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {t(mode.labelKey)}
            </option>
          ))}
        </select>
      )}

      {isNone ? null : (
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1 text-xs font-bold text-gray-500">
            {t("feeCurrency")}
            <select
              value={config.feeCurrencyMode}
              onChange={(event) => patch({ feeCurrencyMode: event.target.value })}
              className="h-11 min-w-0 w-full rounded-lg border border-gray-200 bg-gray-50 pl-2 pr-1 text-left text-xs font-bold text-slate-900 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="source">{t("deductFromOriginal")}（{sourceCurrency}）</option>
              <option value="target">{t("deductFromConverted")}（{targetCurrency}）</option>
            </select>
          </label>

          {showFixed ? (
            <FeeInput
              label={t("fixedFeeShort")}
              value={config.fixed}
              onChange={(fixed) => patch({ fixed })}
              placeholder={t("fixedFeeShort")}
            />
          ) : null}
          {showPercent ? (
            <FeeInput
              label={t("percent")}
              value={config.percent}
              onChange={(percent) => patch({ percent })}
              placeholder={t("percent")}
            />
          ) : null}
          {showMin ? (
            <FeeInput
              label={t("minFee")}
              value={config.min}
              onChange={(min) => patch({ min })}
              placeholder={t("minPlaceholder")}
            />
          ) : null}
          {showMax ? (
            <FeeInput
              label={t("capFee")}
              value={config.max}
              onChange={(max) => patch({ max })}
              placeholder={t("capPlaceholder")}
            />
          ) : null}
          {minNeedsConfirm ? (
            <div className="col-span-2 text-xs font-bold text-amber-600">
              {t("minFeeConfirm")}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
