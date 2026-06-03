import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  Crown,
  HelpCircle,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import FeeConfigFields from "./components/FeeConfigFields.jsx";
import { I18nProvider, useI18n } from "./i18n/I18nContext.jsx";
import {
  getCurrency,
  getCurrencySelectLabel,
  moneyWithCurrencySymbol,
  searchCurrencies,
} from "./data/currencies.js";
import {
  EPSILON_AMOUNT,
  calculateBestBridgeCombination,
  calculateFinalAmountWithFeeConfig,
  calculateMultiBridgeRoutes,
  calculateQuoteGroup,
  calculateRateDeviation,
  compareDirectAndBridge,
  detectQuoteFormat,
  formatMoney,
  formatPercent,
  getFallbackReferenceRate,
  getReferenceRate,
  normalizeRate,
  rankQuotes,
  toNumber,
  validateBridgeCurrency,
  validateCurrencyCombination,
} from "./lib/exchange.js";

const DEFAULT_QUOTE = {
  name: "",
  format: "auto",
  rate: "",
  feeConfig: {
    type: "none",
    fixed: "0",
    percent: "0",
    min: "0",
    max: "0",
    feeCurrencyMode: "source",
  },
};

const MAX_QUOTES = 10;

function formatRateValue(rate) {
  const numericRate = toNumber(rate);

  if (!Number.isFinite(numericRate)) {
    return "-";
  }

  return new Intl.NumberFormat("zh-Hant", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(numericRate);
}

function getQuoteFormatInfo(format, sourceCurrency, targetCurrency, prefix = "已判斷", rate = null, language = "zh-TW") {
  const rateValue = formatRateValue(rate);
  const prefixText = prefix ? `${prefix}${language === "en" ? ": " : "："}` : "";

  switch (format) {
    case "source100_to_target":
      return {
        message: language === "en" ? `${prefixText}100 ${sourceCurrency} gets ${rateValue} ${targetCurrency}` : `${prefix}：100 ${sourceCurrency} 可換 ${rateValue} ${targetCurrency}`,
        formula: language === "en" ? `Formula: amount × ${rateValue} ÷ 100` : `公式：本金 × ${rateValue} ÷ 100`,
      };
    case "source1_to_target":
      return {
        message: language === "en" ? `${prefixText}1 ${sourceCurrency} gets ${rateValue} ${targetCurrency}` : `${prefix}：1 ${sourceCurrency} 可換 ${rateValue} ${targetCurrency}`,
        formula: language === "en" ? `Formula: amount × ${rateValue}` : `公式：本金 × ${rateValue}`,
      };
    case "target100_to_source":
      return {
        message: language === "en" ? `${prefixText}100 ${targetCurrency} costs ${rateValue} ${sourceCurrency}` : `${prefix}：100 ${targetCurrency} 需要 ${rateValue} ${sourceCurrency}`,
        formula: language === "en" ? `Formula: amount × 100 ÷ ${rateValue}` : `公式：本金 × 100 ÷ ${rateValue}`,
      };
    case "target1_to_source":
      return {
        message: language === "en" ? `${prefixText}1 ${targetCurrency} costs ${rateValue} ${sourceCurrency}` : `${prefix}：1 ${targetCurrency} 需要 ${rateValue} ${sourceCurrency}`,
        formula: language === "en" ? `Formula: amount ÷ ${rateValue}` : `公式：本金 ÷ ${rateValue}`,
      };
    default:
      return {
        message: "請確認匯率報價格式",
        formula: "",
      };
  }
}

let quoteIdSequence = 0;

function createQuoteId() {
  quoteIdSequence += 1;
  return `quote-${Date.now()}-${quoteIdSequence}`;
}

function makeQuote(index) {
  return {
    id: createQuoteId(),
    ...DEFAULT_QUOTE,
    name: "",
    rate: "",
    lastRateEditedAt: null,
  };
}

function getDefaultQuoteName(index) {
  return `報價${String.fromCharCode(65 + index)}`;
}

function getDefaultQuoteNameByLanguage(index, language) {
  return language === "en" ? `Quote ${String.fromCharCode(65 + index)}` : getDefaultQuoteName(index);
}

function formatEditedAt(timestamp) {
  if (!timestamp) {
    return "尚未編輯";
  }

  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function InputBox({ compact = false, className = "", ...props }) {
  return (
    <input
      {...props}
      className={`${compact ? "h-11 text-sm" : "h-11"} min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500 ${className}`}
    />
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function makeRouteQuote() {
  return {
    format: "auto",
    rate: "",
    feeConfig: { ...DEFAULT_QUOTE.feeConfig },
    lastRateEditedAt: null,
  };
}

let providerQuoteIdSequence = 0;

function makeProviderQuote(providerName = "") {
  providerQuoteIdSequence += 1;

  return {
    id: `provider-${Date.now()}-${providerQuoteIdSequence}`,
    providerName: providerName || `銀行 ${String.fromCharCode(64 + providerQuoteIdSequence)}`,
    format: "auto",
    rate: "",
    feeConfig: { ...DEFAULT_QUOTE.feeConfig },
    lastRateEditedAt: null,
  };
}

function makeProviderQuotePendingGroup({
  quotes,
  sourceCurrency,
  targetCurrency,
  message,
}) {
  return {
    quotes: quotes.map((quote, index) => ({
      ...quote,
      id: quote.id || `quote-${index}`,
      providerName: quote.providerName || `報價來源 ${index + 1}`,
      sourceCurrency,
      targetCurrency,
      step: null,
      finalAmount: null,
      feeAmount: null,
      isValid: false,
      invalidCurrencyCombination: true,
      status: "待確認",
      message,
      reason: message,
    })),
    validQuotes: [],
    bestQuotes: [],
    secondBestQuote: null,
    hasTie: false,
    bestFinalAmount: null,
  };
}

function makeProviderCurrencyInvalidBridgeResult({
  amount,
  sourceCurrency,
  bridgeCurrency,
  targetCurrency,
  firstQuotes,
  secondQuotes,
  message,
}) {
  return {
    type: "bridge",
    sourceCurrency,
    bridgeCurrency,
    targetCurrency,
    isValid: false,
    invalidCurrencyCombination: true,
    invalidStep: "currency",
    firstGroup: makeProviderQuotePendingGroup({
      quotes: firstQuotes,
      sourceCurrency,
      targetCurrency: bridgeCurrency,
      message,
    }),
    secondGroup: makeProviderQuotePendingGroup({
      quotes: secondQuotes,
      sourceCurrency: bridgeCurrency,
      targetCurrency,
      message,
    }),
    bestFirstQuote: null,
    bestSecondQuote: null,
    intermediateAmount: null,
    finalAmount: null,
    amount,
    message,
    reason: message,
  };
}

let bridgeRouteIdSequence = 0;

function makeBridgeRoute(bridgeCurrency = "HKD") {
  bridgeRouteIdSequence += 1;

  return {
    id: `bridge-${Date.now()}-${bridgeRouteIdSequence}`,
    bridgeCurrency,
    firstQuote: makeRouteQuote(),
    secondQuote: makeRouteQuote(),
  };
}

function updateRouteQuoteState(setQuote, patch) {
  setQuote((current) => ({
    ...current,
    ...patch,
    lastRateEditedAt: Object.prototype.hasOwnProperty.call(patch, "rate")
      ? Date.now()
      : current.lastRateEditedAt,
  }));
}

function getRouteStepFormatInfo(quote, step, sourceCurrency, targetCurrency) {
  if (!String(quote.rate || "").trim()) {
    return { message: "請輸入匯率報價", formula: "" };
  }

  if (!step?.isValid) {
    return { message: displayText(step?.explanationText || "請確認匯率報價格式"), formula: "" };
  }

  return {
    message: `實際匯率：${formatRateDisplay(step.normalizedRate, sourceCurrency, targetCurrency)}`,
    formula: "",
  };
}

function RouteStepEditor({ title, sourceCurrency, targetCurrency, quote, step, onChange }) {
  const { t, text, language } = useI18n();
  const formatInfo = getCompactFormatInfo(getRouteStepFormatInfo(quote, step, sourceCurrency, targetCurrency));
  const hasRate = String(quote.rate || "").trim() !== "";
  const isWarning = hasRate && (!step?.isValid || step?.confidence === "low_confidence");

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black text-slate-900">{text(title)}</div>
          <div className="mt-0.5 text-xs font-bold text-gray-400">{sourceCurrency} → {targetCurrency}</div>
          <div className="mt-0.5 text-xs font-medium text-gray-400">{t("lastEdited")}：{text(formatEditedAt(quote.lastRateEditedAt))}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-black text-slate-700">{step?.isValid ? formatMoney(step.normalizedRate, 4) : "--"}</div>
          <div className="text-[10px] font-bold text-gray-400">{t("effectiveRate")}</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <MobileRateFormatSelect
          value={quote.format}
          onChange={(format) => onChange({ format })}
          sourceCurrency={sourceCurrency}
          targetCurrency={targetCurrency}
        />
        <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-xs font-medium leading-snug">
          <div className={isWarning ? "text-amber-700" : hasRate ? "text-blue-700" : "text-gray-400"}>{text(formatInfo.meaning)}</div>
          {formatInfo.formula ? <div className="mt-0.5 text-xs text-gray-400">{text(formatInfo.formula)}</div> : null}
          {step?.confidence === "low_confidence" ? <div className="mt-0.5 text-amber-600">{t("confirm")}</div> : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <InputBox
          compact
          type="number"
          min="0"
          step="0.0001"
          value={quote.rate}
          onChange={(event) => onChange({ rate: event.target.value })}
          placeholder={t("enterExchangeRateQuote")}
          className="w-full"
        />
        <FeeConfigFields
          compact
          feeConfig={quote.feeConfig}
          onChange={(feeConfig) => onChange({ feeConfig })}
          sourceCurrency={sourceCurrency}
          targetCurrency={targetCurrency}
        />
      </div>
    </div>
  );
}

function getRouteFeeText(step, sourceCurrency, targetCurrency) {
  if (!step?.isValid) {
    return "-";
  }

  const feeCurrency = step.feeCurrencyMode === "target" ? targetCurrency : sourceCurrency;
  return step.feeAmount > 0 ? amountWithCurrency(step.feeAmount, feeCurrency) : "無";
}

function getRouteComparison({ directRoute, bridgeRoute, targetCurrency }) {
  const directValid = directRoute?.isValid;
  const bridgeValid = bridgeRoute?.isValid;

  if (directValid && bridgeValid) {
    const difference = Math.abs(directRoute.finalAmount - bridgeRoute.finalAmount);

    if (difference < EPSILON_AMOUNT) {
      return {
        state: "tie",
        directStatus: "並列最佳",
        bridgeStatus: "並列最佳",
        bestAmount: directRoute.finalAmount,
        differenceAmount: 0,
        percentGap: 0,
      };
    }

    const directBest = directRoute.finalAmount > bridgeRoute.finalAmount;
    const loserAmount = directBest ? bridgeRoute.finalAmount : directRoute.finalAmount;
    const percentGap = loserAmount > 0 ? (difference / loserAmount) * 100 : 0;
    const loserText = `少 ${moneyWithSymbol(difference, targetCurrency)} / ${formatPercent(percentGap)}`;

    return {
      state: directBest ? "direct_best" : "bridge_best",
      directStatus: directBest ? "最佳" : loserText,
      bridgeStatus: directBest ? loserText : "最佳",
      bestAmount: directBest ? directRoute.finalAmount : bridgeRoute.finalAmount,
      differenceAmount: difference,
      percentGap,
    };
  }

  if (directValid) {
    return { state: "direct_only", directStatus: "目前有效", bridgeStatus: "待確認", bestAmount: directRoute.finalAmount };
  }

  if (bridgeValid) {
    return { state: "bridge_only", directStatus: "待確認", bridgeStatus: "目前有效", bestAmount: bridgeRoute.finalAmount };
  }

  return { state: "empty", directStatus: "-", bridgeStatus: "-", bestAmount: null };
}

function RouteSummary({ validationError, comparison, sourceCurrency, bridgeCurrency, targetCurrency }) {
  if (validationError) {
    return (
      <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="text-xs font-black text-amber-700">路徑比較</div>
        <div className="mt-2 text-base font-black text-amber-900">{validationError}</div>
        <div className="mt-1 text-xs font-bold text-amber-700">請先調整貨幣後再比較。</div>
      </section>
    );
  }

  if (comparison.state === "empty") {
    return (
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-black text-gray-400">路徑比較</div>
        <div className="mt-2 text-base font-black text-slate-800">輸入匯率報價後自動比較直接兌換與中轉兌換</div>
      </section>
    );
  }

  if (comparison.state === "direct_only" || comparison.state === "bridge_only") {
    const isDirectOnly = comparison.state === "direct_only";

    return (
      <section className="mb-4 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-black text-blue-500">路徑比較</div>
        <div className="mt-2 text-base font-black text-slate-900">目前只有{isDirectOnly ? "直接兌換" : "中轉兌換"}有效</div>
        <div className="mt-1 break-words text-2xl font-black text-slate-900">{moneyWithSymbol(comparison.bestAmount, targetCurrency)}</div>
        <div className="mt-1 text-xs font-bold text-gray-400">請輸入{isDirectOnly ? "中轉路徑" : "直接兌換"}報價進行比較</div>
      </section>
    );
  }

  if (comparison.state === "tie") {
    return (
      <section className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
          <Crown size={13} />
          並列最佳
        </div>
        <div className="mt-2 text-base font-black text-emerald-900">直接兌換與中轉兌換結果相同</div>
        <div className="mt-1 break-words text-2xl font-black text-emerald-900">{moneyWithSymbol(comparison.bestAmount, targetCurrency)}</div>
      </section>
    );
  }

  const directBest = comparison.state === "direct_best";

  return (
    <section className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
      <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
        <Crown size={13} />
        最佳路徑：{directBest ? "直接兌換" : "中轉兌換"}
      </div>
      <div className="mt-2 text-base font-black text-emerald-900">
        {directBest ? `${sourceCurrency} → ${targetCurrency}` : `${sourceCurrency} → ${bridgeCurrency} → ${targetCurrency}`}
      </div>
      <div className="mt-1 break-words text-2xl font-black text-emerald-900">{moneyWithSymbol(comparison.bestAmount, targetCurrency)}</div>
      <div className="mt-1 text-xs font-bold text-emerald-700">
        比{directBest ? "中轉" : "直接"}多：{moneyWithSymbol(comparison.differenceAmount, targetCurrency)} / {formatPercent(comparison.percentGap)}
      </div>
    </section>
  );
}

function getRouteStatusText(route, targetCurrency) {
  if (!route?.isValid) {
    return "待完成";
  }

  if (route.isBest) {
    return route.isJointBest ? "並列最佳" : "最佳";
  }

  if (Number.isFinite(route.differenceAmount)) {
    return `較最佳少 ${moneyWithSymbol(route.differenceAmount, targetCurrency)} / ${formatPercent(route.percentGap)}`;
  }

  return route.status || "-";
}

function MultiRouteSummary({ validationError, routeResult, sourceCurrency, targetCurrency }) {
  const { t, text, language } = useI18n();
  if (validationError) {
    return (
      <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="text-xs font-black text-amber-700">{t("routeCompare")}</div>
        <div className="mt-2 text-base font-black text-amber-900">{text(validationError)}</div>
        <div className="mt-1 text-xs font-bold text-amber-700">{t("invalidCurrencyCombination")}</div>
      </section>
    );
  }

  const routes = routeResult.routes || [];
  const validRoutes = routes.filter((route) => route.isValid);
  const directRoute = routes.find((route) => route.type === "direct");
  const validBridgeRoutes = validRoutes.filter((route) => route.type === "bridge");

  if (!validRoutes.length) {
    return (
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-black text-gray-400">{t("routeCompare")}</div>
        <div className="mt-2 text-base font-black text-slate-800">{t("routeCompareEmpty")}</div>
      </section>
    );
  }

  if (validRoutes.length === 1) {
    const onlyRoute = validRoutes[0];
    const routeName = onlyRoute.type === "direct" ? t("directExchange") : `${onlyRoute.bridgeCurrency} ${t("bridgeRoute")}`;

    return (
      <section className="mb-4 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-black text-blue-500">{t("routeCompare")}</div>
        <div className="mt-2 text-base font-black text-slate-900">{routeName}</div>
        <div className="mt-1 break-words text-2xl font-black text-slate-900">{moneyWithSymbol(onlyRoute.finalAmount, targetCurrency)}</div>
        <div className="mt-1 text-xs font-bold text-gray-400">{t("completeQuotesBeforeCompare")}</div>
      </section>
    );
  }

  if (routeResult.hasTie) {
    return (
      <section className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
          <Crown size={13} />
          {t("tiedBest")}
        </div>
        <div className="mt-2 text-base font-black text-emerald-900">{t("tinyDifferenceSuggestion")}</div>
        <div className="mt-1 break-words text-2xl font-black text-emerald-900">{moneyWithSymbol(routeResult.bestFinalAmount, targetCurrency)}</div>
      </section>
    );
  }

  const bestRoute = routeResult.bestRoutes[0];
  const secondBestRoute = routeResult.secondBestRoute;
  const directDifference = bestRoute?.type === "bridge" && directRoute?.isValid
    ? bestRoute.finalAmount - directRoute.finalAmount
    : null;
  const secondDifference = secondBestRoute
    ? bestRoute.finalAmount - secondBestRoute.finalAmount
    : null;

  return (
    <section className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
      <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
        <Crown size={13} />
        {t("bestRoute")}
      </div>
      <div className="mt-2 text-base font-black text-emerald-900">{bestRoute.label}</div>
      <div className="mt-1 break-words text-2xl font-black text-emerald-900">{moneyWithSymbol(bestRoute.finalAmount, targetCurrency)}</div>
      {directDifference !== null && directDifference > 0 ? (
        <div className="mt-1 text-xs font-bold text-emerald-700">
          {t("bridgeRoute")} + {moneyWithSymbol(directDifference, targetCurrency)} / {formatPercent(directRoute.finalAmount > 0 ? directDifference / directRoute.finalAmount * 100 : 0)}
        </div>
      ) : null}
      {secondDifference !== null && secondDifference > 0 ? (
        <div className="mt-1 text-xs font-bold text-emerald-700">
          {t("best")} + {moneyWithSymbol(secondDifference, targetCurrency)} / {formatPercent(secondBestRoute.finalAmount > 0 ? secondDifference / secondBestRoute.finalAmount * 100 : 0)}
        </div>
      ) : null}
      {!validBridgeRoutes.length ? (
        <div className="mt-1 text-xs font-bold text-emerald-700">{t("directIsOnlyValidRoute")}</div>
      ) : null}
    </section>
  );
}

function RouteCalculationPanel({ type, route, comparisonStatus, sourceCurrency, bridgeCurrency, targetCurrency }) {
  const { t, text, language } = useI18n();
  if (!route?.isValid) {
    const invalidStepLabel = route?.invalidStep === "second"
      ? `第二程 ${bridgeCurrency} → ${targetCurrency}`
      : route?.invalidStep === "first"
        ? `第一程 ${sourceCurrency} → ${bridgeCurrency}`
        : `${sourceCurrency} → ${targetCurrency}`;

    return (
      <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-xs font-bold text-slate-700">
        <div className="mb-1.5 text-xs font-black text-slate-950">{t("calculationFlow")}</div>
        <div className="font-black text-amber-700">{type === "bridge" ? t("completeQuotesBeforeCompare") : t("completeQuotesBeforeCompare")}</div>
        <div className="mt-1 text-slate-600">{t("pleaseConfirmQuoteFormat")}：{text(invalidStepLabel)}</div>
        {route?.reason || route?.message ? <div className="mt-1 text-slate-500">{text(displayText(route.reason || route.message))}</div> : null}
      </div>
    );
  }

  if (type === "direct") {
    const step = route.steps[0];

    return (
      <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-xs font-bold text-slate-700">
        <div className="mb-1.5 text-xs font-black text-slate-950">{t("calculationFlow")}</div>
        <ol className="grid gap-1.5">
          <li>1. {t("originalAmount")}：{amountWithCurrency(step.inputAmount, sourceCurrency)}</li>
          <li>2. {t("directExchange")}：{sourceCurrency} → {targetCurrency}</li>
          <li>3. {t("exchangeRateQuote")}：{text(step.explanationText)}</li>
          <li>4. {t("effectiveRate")}：{formatRateDisplay(step.normalizedRate, sourceCurrency, targetCurrency)}</li>
          <li>5. {t("fee")}：{text(getRouteFeeDetailText(step, sourceCurrency, targetCurrency))}</li>
          {step.feeAmount > 0 && step.feeCurrencyMode === "source" ? (
            <li>6. {t("netOriginalAmount")}：{amountWithCurrency(step.inputAmount, sourceCurrency)} - {amountWithCurrency(step.feeAmount, sourceCurrency)} = {amountWithCurrency(step.netSourceAmount, sourceCurrency)}</li>
          ) : null}
          {step.feeAmount > 0 && step.feeCurrencyMode === "target" ? (
            <li>6. {t("grossAmount")}：{amountWithCurrency(step.grossAmount, targetCurrency)}</li>
          ) : null}
          <li>7. {t("finalAmount")}：{text(step.formulaText)} = {amountWithCurrency(step.finalAmount, targetCurrency)}</li>
          <li>8. {t("result")}：{text(comparisonStatus)}</li>
        </ol>
      </div>
    );
  }

  const firstStep = route.steps[0];
  const secondStep = route.steps[1];

  return (
    <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-xs font-bold text-slate-700">
      <div className="mb-1.5 text-xs font-black text-slate-950">{t("calculationFlow")}</div>
      <div className="font-black text-slate-900">{t("firstStep")}：{sourceCurrency} → {bridgeCurrency}</div>
      <ol className="mt-1 grid gap-1.5">
        <li>1. {t("originalAmount")}：{amountWithCurrency(firstStep.inputAmount, sourceCurrency)}</li>
        <li>2. {t("exchangeRateQuote")}：{text(firstStep.explanationText)}</li>
        <li>3. {t("fee")}：{text(getRouteFeeDetailText(firstStep, sourceCurrency, bridgeCurrency))}</li>
        {firstStep.feeAmount > 0 && firstStep.feeCurrencyMode === "source" ? (
          <li>4. {t("netOriginalAmount")}：{amountWithCurrency(firstStep.inputAmount, sourceCurrency)} - {amountWithCurrency(firstStep.feeAmount, sourceCurrency)} = {amountWithCurrency(firstStep.netSourceAmount, sourceCurrency)}</li>
        ) : null}
        {firstStep.feeAmount > 0 && firstStep.feeCurrencyMode === "target" ? (
          <li>4. {t("grossAmount")}：{amountWithCurrency(firstStep.grossAmount, bridgeCurrency)}</li>
        ) : null}
        <li>5. {t("firstStepResult")}：{text(firstStep.formulaText)} = {amountWithCurrency(firstStep.finalAmount, bridgeCurrency)}</li>
      </ol>
      <div className="mt-2 font-black text-slate-900">{t("secondStep")}：{bridgeCurrency} → {targetCurrency}</div>
      <ol className="mt-1 grid gap-1.5">
        <li>5. {t("bridgeCurrency")}：{amountWithCurrency(secondStep.inputAmount, bridgeCurrency)}</li>
        <li>6. {t("exchangeRateQuote")}：{text(secondStep.explanationText)}</li>
        <li>7. {t("fee")}：{text(getRouteFeeDetailText(secondStep, bridgeCurrency, targetCurrency))}</li>
        {secondStep.feeAmount > 0 && secondStep.feeCurrencyMode === "source" ? (
          <li>8. {t("netOriginalAmount")}：{amountWithCurrency(secondStep.inputAmount, bridgeCurrency)} - {amountWithCurrency(secondStep.feeAmount, bridgeCurrency)} = {amountWithCurrency(secondStep.netSourceAmount, bridgeCurrency)}</li>
        ) : null}
        {secondStep.feeAmount > 0 && secondStep.feeCurrencyMode === "target" ? (
          <li>8. {t("grossAmount")}：{amountWithCurrency(secondStep.grossAmount, targetCurrency)}</li>
        ) : null}
        <li>9. {t("secondStepResult")}：{text(secondStep.formulaText)} = {amountWithCurrency(secondStep.finalAmount, targetCurrency)}</li>
        <li>10. {t("finalAmount")}：{amountWithCurrency(route.finalAmount, targetCurrency)}</li>
        <li>11. {t("result")}：{text(comparisonStatus)}</li>
      </ol>
    </div>
  );
}

function DirectRouteCard({ route, quote, sourceCurrency, targetCurrency, comparisonStatus, isBest, isJointBest, onChange }) {
  const { t, text, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const step = route.steps[0];

  return (
    <section className={`relative mb-6 rounded-xl bg-white p-6 shadow-sm transition-all ${isBest ? "border-2 border-green-500 ring-4 ring-green-50" : "border border-gray-100"}`}>
      {isBest ? (
        <div className="absolute -right-3 -top-3 flex items-center gap-1 rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
          <Crown size={14} />
          {isJointBest ? t("tiedBest") : t("best")}
        </div>
      ) : null}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-md bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">A · {t("directExchange")}</div>
          <div className="mt-2 text-xs font-bold text-gray-400">{sourceCurrency} → {targetCurrency}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold text-gray-800">{step?.isValid ? `1 ${sourceCurrency} = ${formatMoney(step.normalizedRate, 4)} ${targetCurrency}` : "--"}</div>
            <div className="mt-1 text-[10px] text-gray-400 sm:text-xs">{t("effectiveRate")}</div>
        </div>
      </div>

      <RouteStepEditor title={t("directExchangeQuote")} sourceCurrency={sourceCurrency} targetCurrency={targetCurrency} quote={quote} step={step} onChange={onChange} />

      <hr className="my-4 border-gray-100" />
      <button type="button" onClick={() => setIsOpen((current) => !current)} className={`w-full cursor-pointer rounded-xl border px-4 py-3.5 text-left transition-colors ${isBest ? "border-green-100 bg-green-50/70 hover:bg-green-50" : "border-gray-100 bg-gray-50 hover:bg-gray-100"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-bold text-gray-400">{t("estimatedAmount")}</div>
          <div className="min-w-0 text-right">
            {isBest ? (
              <span className="inline-flex rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-black text-white">
                {isJointBest ? t("tiedBest") : t("best")}
              </span>
            ) : comparisonStatus ? (
              <span className="break-words text-xs font-bold text-gray-500">{text(comparisonStatus)}</span>
            ) : null}
          </div>
        </div>
        <div className="mt-1 max-w-full break-words text-2xl font-black leading-tight text-gray-900">{moneyWithSymbol(route.finalAmount, targetCurrency)}</div>
        {!route.isValid ? (
          <div className="mt-1 text-xs font-bold text-amber-700">{t("pleaseConfirmQuoteFormat")}</div>
        ) : null}
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="text-xs font-medium text-gray-400">{t("feeDeducted")}：{text(getRouteFeeText(step, sourceCurrency, targetCurrency))}</div>
          <div className="inline-flex items-center justify-end gap-1 text-sm font-bold text-gray-500 transition-colors hover:text-blue-600">
            {isOpen ? t("hideDetails") : t("calculationDetails")}
            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </button>
      {isOpen ? <RouteCalculationPanel type="direct" route={route} comparisonStatus={comparisonStatus} sourceCurrency={sourceCurrency} bridgeCurrency="" targetCurrency={targetCurrency} /> : null}
    </section>
  );
}

function BridgeRouteCard({ route, firstQuote, secondQuote, sourceCurrency, bridgeCurrency, targetCurrency, comparisonStatus, isBest, isJointBest, onFirstChange, onSecondChange, onRemove }) {
  const { t, text } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const firstStep = route.steps[0];
  const secondStep = route.steps[1];
  const feeText = route.isValid
    ? `${getRouteFeeText(firstStep, sourceCurrency, bridgeCurrency)} / ${getRouteFeeText(secondStep, bridgeCurrency, targetCurrency)}`
    : "-";

  return (
    <section className={`relative mb-6 rounded-xl bg-white p-6 shadow-sm transition-all ${isBest ? "border-2 border-green-500 ring-4 ring-green-50" : "border border-gray-100"}`}>
      {isBest ? (
        <div className="absolute -right-3 -top-3 flex items-center gap-1 rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
          <Crown size={14} />
          {isJointBest ? t("tiedBest") : t("best")}
        </div>
      ) : null}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-md bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">B · {t("bridgeRoute")}</div>
          <div className="mt-2 text-xs font-bold text-gray-400">{sourceCurrency} → {bridgeCurrency} → {targetCurrency}</div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
            <div className="text-base font-bold text-gray-800">{route.isValid ? moneyWithSymbol(route.finalAmount, targetCurrency) : "--"}</div>
            <div className="mt-1 text-[10px] text-gray-400 sm:text-xs">{t("estimatedAmount")}</div>
          </div>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="grid h-8 w-8 place-items-center rounded-lg text-gray-300 transition hover:bg-red-50 hover:text-red-500"
              aria-label={`${t("delete")} ${bridgeCurrency}`}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        <RouteStepEditor title={t("firstExchangeStep")} sourceCurrency={sourceCurrency} targetCurrency={bridgeCurrency} quote={firstQuote} step={firstStep} onChange={onFirstChange} />
        <RouteStepEditor title={t("secondExchangeStep")} sourceCurrency={bridgeCurrency} targetCurrency={targetCurrency} quote={secondQuote} step={secondStep} onChange={onSecondChange} />
      </div>

      <hr className="my-4 border-gray-100" />
      <button type="button" onClick={() => setIsOpen((current) => !current)} className={`w-full cursor-pointer rounded-xl border px-4 py-3.5 text-left transition-colors ${isBest ? "border-green-100 bg-green-50/70 hover:bg-green-50" : "border-gray-100 bg-gray-50 hover:bg-gray-100"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-bold text-gray-400">{t("estimatedAmount")}</div>
          <div className="min-w-0 text-right">
            {isBest ? (
              <span className="inline-flex rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-black text-white">
                {isJointBest ? t("tiedBest") : t("best")}
              </span>
            ) : comparisonStatus ? (
              <span className="break-words text-xs font-bold text-gray-500">{text(comparisonStatus)}</span>
            ) : null}
          </div>
        </div>
        <div className="mt-1 max-w-full break-words text-2xl font-black leading-tight text-gray-900">{moneyWithSymbol(route.finalAmount, targetCurrency)}</div>
        {!route.isValid ? (
          <div className="mt-1 text-xs font-bold text-amber-700">{t("pleaseConfirmQuoteFormat")}</div>
        ) : route.intermediateAmount !== null ? (
          <div className="mt-1 text-xs font-medium text-gray-400">{t("firstStepResult")}：{amountWithCurrency(route.intermediateAmount, bridgeCurrency)}</div>
        ) : null}
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="text-xs font-medium text-gray-400">{t("feeDeducted")}：{text(feeText)}</div>
          <div className="inline-flex items-center justify-end gap-1 text-sm font-bold text-gray-500 transition-colors hover:text-blue-600">
            {isOpen ? t("hideDetails") : t("calculationDetails")}
            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </button>
      {isOpen ? <RouteCalculationPanel type="bridge" route={route} comparisonStatus={comparisonStatus} sourceCurrency={sourceCurrency} bridgeCurrency={bridgeCurrency} targetCurrency={targetCurrency} /> : null}
    </section>
  );
}

function moneyWithSymbol(value, currency) {
  return moneyWithCurrencySymbol(value, currency);
}

function formatDisplayMoney(value, currency) {
  return moneyWithSymbol(value, currency);
}

function formatRateDisplay(normalizedRate, sourceCurrency, targetCurrency) {
  if (!Number.isFinite(normalizedRate)) {
    return "--";
  }

  return `1 ${sourceCurrency} = ${formatMoney(normalizedRate, 4)} ${targetCurrency}`;
}

function displayText(value) {
  return String(value || "")
    .replaceAll("匯出金額", "現持有金額")
    .replaceAll("匯出幣種", "現持有貨幣（賣出）")
    .replaceAll("接收幣種", "想兌換成的貨幣（買入）")
    .replaceAll("中轉幣種", "中轉貨幣")
    .replaceAll("輸入商家報價", "輸入匯率報價")
    .replaceAll("商家報價", "匯率報價")
    .replaceAll("第一段", "第一程")
    .replaceAll("第二段", "第二程")
    .replaceAll("請確認報價格式", "請確認匯率報價格式")
    .replaceAll("請補充完整報價後再比較", "請補充完整匯率報價後再比較")
    .replaceAll("匯出、接收", "現持有貨幣、想兌換成的貨幣")
    .replaceAll("請選擇不同的匯出、接收和中轉貨幣", "請選擇不同的現持有貨幣、想兌換成的貨幣和中轉貨幣");
}

function CurrencyCombobox({ value, onChange, label }) {
  const { language, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const selectedCurrency = getCurrency(value);
  const filteredCurrencies = useMemo(() => searchCurrencies(searchText), [searchText]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchText("");
    setActiveIndex(0);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [searchText]);

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

  function closeMenu() {
    setIsOpen(false);
  }

  function selectCurrency(currencyCode) {
    onChange(currencyCode);
    closeMenu();
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(filteredCurrencies.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && filteredCurrencies[activeIndex]) {
      event.preventDefault();
      selectCurrency(filteredCurrencies[activeIndex].code);
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-11 min-w-0 w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-left text-xs font-black text-slate-800 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
      >
        <span className="min-w-0 truncate">
          {language === "en" ? selectedCurrency.code : getCurrencySelectLabel(selectedCurrency.code, language)}
        </span>
        <ChevronDown size={14} className="shrink-0 text-slate-500" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-slate-950/20"
            aria-label={t("cancel")}
            onClick={closeMenu}
          />
          <div className="absolute inset-x-4 bottom-4 mx-auto max-h-[72vh] max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-black text-slate-900">{label}</div>
                <div className="text-xs font-bold text-gray-400">{t("currencyHint")}</div>
              </div>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500">
                <Search size={16} className="shrink-0 text-gray-400" />
                <input
                  ref={searchInputRef}
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={t("searchCurrencyPlaceholder")}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-gray-400"
                />
              </div>
            </div>

            <div className="max-h-[calc(72vh-6.5rem)] overflow-y-auto p-2" role="listbox" aria-label={label}>
              {filteredCurrencies.length ? (
                filteredCurrencies.map((currency, index) => {
                  const isSelected = currency.code === value;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={currency.code}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectCurrency(currency.code)}
                      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                        isSelected || isActive ? "bg-blue-50 text-blue-700" : "text-slate-800 hover:bg-gray-50"
                      }`}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="w-11 shrink-0 text-sm font-black">{currency.code}</span>
                        <span className="min-w-0 truncate text-sm font-bold">{language === "en" ? currency.nameEn : currency.nameZh}</span>
                      </span>
                      {isSelected ? <Check size={17} className="shrink-0 text-blue-600" /> : null}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center text-sm font-bold text-gray-400">
                  {t("noCurrencyFound")}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileRateFormatSelect({
  value,
  onChange,
  sourceCurrency,
  targetCurrency,
}) {
  const { language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const options = [
    { value: "auto", label: language === "en" ? "Auto Detect" : "自動判斷" },
    { value: "source100_to_target", label: language === "en" ? `100 ${sourceCurrency} gets X ${targetCurrency}` : `100 ${sourceCurrency} 可換 X ${targetCurrency}` },
    { value: "source1_to_target", label: language === "en" ? `1 ${sourceCurrency} gets X ${targetCurrency}` : `1 ${sourceCurrency} 可換 X ${targetCurrency}` },
    { value: "target100_to_source", label: language === "en" ? `100 ${targetCurrency} costs X ${sourceCurrency}` : `100 ${targetCurrency} 需要 X ${sourceCurrency}` },
    { value: "target1_to_source", label: language === "en" ? `1 ${targetCurrency} costs X ${sourceCurrency}` : `1 ${targetCurrency} 需要 X ${sourceCurrency}` },
  ];
  const closedLabel = value === "auto" ? (language === "en" ? "Auto" : "自動") : (language === "en" ? "Manual" : "手動");

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
    <div ref={dropdownRef} className="relative w-[5.6rem] shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-black text-slate-800 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500"
      >
        <span className="truncate">{closedLabel}</span>
        <ChevronDown size={14} className="text-slate-500" />
      </button>
      {isOpen ? (
        <div className="absolute left-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 shadow-lg">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${
                option.value === value ? "bg-blue-50 text-blue-700" : ""
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getCompactFormatInfo(formatInfo) {
  if (!formatInfo?.message || formatInfo.message === "請確認報價格式" || formatInfo.message === "請確認匯率報價格式") {
    return {
      meaning: "請確認匯率報價格式",
      formula: "",
    };
  }

  if (formatInfo.message === "輸入後自動判斷") {
    return {
      meaning: "請輸入匯率報價",
      formula: "",
    };
  }

  return {
    meaning: formatInfo.message.replace(/^已判斷：/, "").replace(/^手動：/, "").replace(/^建議：/, ""),
    formula: (formatInfo.formula || "").replace(/^公式：/, ""),
  };
}

function getUnavailableFormatInfo(detection) {
  if (detection?.reason === "missing_reference_rate") {
    return {
      message: "缺少參考匯率，請手動選擇格式",
      formula: "",
    };
  }

  return getQuoteFormatInfo(null);
}

function getRatePlaceholder() {
  return "輸入匯率報價";
}

function amountWithCurrency(value, currency) {
  return formatDisplayMoney(value, currency);
}

function getExchangeExpression(amountValue, format, rate) {
  const amountText = formatMoney(amountValue);
  const rateText = formatRateValue(rate);

  switch (format) {
    case "source100_to_target":
      return `${amountText} × ${rateText} ÷ 100`;
    case "source1_to_target":
      return `${amountText} × ${rateText}`;
    case "target100_to_source":
      return `${amountText} × 100 ÷ ${rateText}`;
    case "target1_to_source":
      return `${amountText} ÷ ${rateText}`;
    default:
      return "";
  }
}

function getFeeDescription(feeConfig, feeAmount, feeCurrency) {
  const config = feeConfig || { type: "none" };

  if (config.type === "none") {
    return "無";
  }

  const feeText = amountWithCurrency(feeAmount, feeCurrency);
  const percentText = `${formatMoney(toNumber(config.percent || 0))}%`;

  switch (config.type) {
    case "fixed":
      return `固定費 = ${feeText}`;
    case "percent":
      return `${percentText} = ${feeText}`;
    case "percent_min":
      return `${percentText}，最低 ${amountWithCurrency(toNumber(config.min || 0), feeCurrency)}，實扣 ${feeText}`;
    case "percent_max":
      return `${percentText}，封頂 ${amountWithCurrency(toNumber(config.max || 0), feeCurrency)}，實扣 ${feeText}`;
    case "percent_min_max":
      return `${percentText}，最低 ${amountWithCurrency(toNumber(config.min || 0), feeCurrency)}，封頂 ${amountWithCurrency(toNumber(config.max || 0), feeCurrency)}，實扣 ${feeText}`;
    default:
      return feeText;
  }
}

function getFeeDeductionText(feeCurrencyMode) {
  return feeCurrencyMode === "target" ? "從兌換結果扣除" : "從本金扣除";
}

function getFeeDetailText(feeConfig, feeAmount, feeCurrency, feeCurrencyMode) {
  const feeText = getFeeDescription(feeConfig, feeAmount, feeCurrency);
  return feeText === "無" ? "無" : `${feeText}，${getFeeDeductionText(feeCurrencyMode)}`;
}

function getRouteFeeDetailText(step, sourceCurrency, targetCurrency) {
  if (!step?.isValid) {
    return "-";
  }

  const feeCurrency = step.feeCurrencyMode === "target" ? targetCurrency : sourceCurrency;
  return step.feeAmount > 0
    ? `${amountWithCurrency(step.feeAmount, feeCurrency)}，${getFeeDeductionText(step.feeCurrencyMode)}`
    : "無";
}

function getCalculationFlow({
  amount,
  quote,
  sourceCurrency,
  targetCurrency,
  isBest,
  isJointBest,
  bestAmount,
  language = "zh-TW",
}) {
  if (quote.quoteInputEmpty) {
    return {
      canCalculate: false,
      message: "請先輸入匯率報價。",
      reasons: [],
    };
  }

  if (
    quote.detectionLowConfidence ||
    quote.finalAmount === null ||
    !Number.isFinite(quote.normalizedRate)
  ) {
    const missingReferenceRate = quote.detectionReason === "missing_reference_rate";

    return {
      canCalculate: false,
      message: missingReferenceRate
        ? "缺少參考匯率，請手動選擇格式。"
        : "請確認匯率報價格式。",
      reasons: missingReferenceRate
        ? [
          "此貨幣對暫時沒有參考匯率",
          "請手動選擇匯率關係",
        ]
        : [
          "匯率報價與常見匯率範圍不匹配",
          "系統無法判斷是「可換」還是「需要」",
          "請手動選擇匯率關係",
        ],
    };
  }

  const amountValue = toNumber(amount);
  const feeType = quote.feeConfig?.type || "none";
  const effectiveFormat = quote.format === "auto" ? quote.detectedFormat : quote.format;
  const formatSource = quote.format === "auto" ? "自動判斷" : "手動選擇";
  const feeCurrency = quote.feeCurrencyMode === "target" ? targetCurrency : sourceCurrency;
  const formatInfo = getCompactFormatInfo(
    getQuoteFormatInfo(effectiveFormat, sourceCurrency, targetCurrency, "", quote.rate, language),
  );
  const steps = [
    { label: "本金", value: amountWithCurrency(amountValue, sourceCurrency) },
    { label: "匯率報價", value: formatRateValue(quote.rate) },
    { label: "格式來源", value: formatSource },
    { label: "匯率關係", value: formatInfo.meaning.replace(/^：/, "") },
    { label: "換算方式", value: formatInfo.formula || getExchangeExpression(amountValue, effectiveFormat, quote.rate) },
    {
      label: "實際匯率",
      value: formatRateDisplay(quote.normalizedRate, sourceCurrency, targetCurrency),
    },
  ];

  if (feeType === "none") {
    steps.push(
      { label: "手續費", value: "無" },
      {
        label: "預計可得",
        value: `${getExchangeExpression(amountValue, effectiveFormat, quote.rate)} = ${amountWithCurrency(quote.finalAmount, targetCurrency)}`,
      },
    );
  } else if (quote.feeCurrencyMode === "source") {
    const netSourceAmount = amountValue - quote.feeAmount;
    steps.push(
      {
        label: "手續費",
        value: getFeeDetailText(quote.feeConfig, quote.feeAmount, feeCurrency, quote.feeCurrencyMode),
      },
      {
        label: "扣費後本金",
        value: `${amountWithCurrency(amountValue, sourceCurrency)} - ${amountWithCurrency(quote.feeAmount, sourceCurrency)} = ${amountWithCurrency(netSourceAmount, sourceCurrency)}`,
      },
      {
        label: "匯率計算",
        value: `${getExchangeExpression(netSourceAmount, effectiveFormat, quote.rate)} = ${amountWithCurrency(quote.finalAmount, targetCurrency)}`,
      },
      {
        label: "預計可得",
        value: amountWithCurrency(quote.finalAmount, targetCurrency),
      },
    );
  } else {
    const grossTargetAmount = amountValue * quote.normalizedRate;
    steps.push(
      {
        label: "未扣費可得",
        value: `${getExchangeExpression(amountValue, effectiveFormat, quote.rate)} = ${amountWithCurrency(grossTargetAmount, targetCurrency)}`,
      },
      {
        label: "手續費",
        value: getFeeDetailText(quote.feeConfig, quote.feeAmount, feeCurrency, quote.feeCurrencyMode),
      },
      {
        label: "預計可得",
        value: `${amountWithCurrency(grossTargetAmount, targetCurrency)} - ${amountWithCurrency(quote.feeAmount, targetCurrency)} = ${amountWithCurrency(quote.finalAmount, targetCurrency)}`,
      },
    );
  }

  if (isJointBest) {
    steps.push({ label: "結果", value: "與其他報價並列最佳" });
  } else if (isBest) {
    steps.push({ label: "結果", value: `${quote.displayName} 是目前最佳方案` });
  } else if (bestAmount !== null) {
    const difference = bestAmount - quote.finalAmount;
    const percentGap = quote.finalAmount > 0 ? (difference / quote.finalAmount) * 100 : 0;
    steps.push({
      label: "結果",
      value: `與最佳差 ${amountWithCurrency(difference, targetCurrency)} / ${formatPercent(percentGap)}`,
    });
  }

  return {
    canCalculate: true,
    steps,
  };
}

function CalculationFlowPanel({
  amount,
  quote,
  sourceCurrency,
  targetCurrency,
  isBest,
  isJointBest,
  bestAmount,
}) {
  const { t, text, language } = useI18n();
  const flow = getCalculationFlow({
    amount,
    quote,
    sourceCurrency,
    targetCurrency,
    isBest,
    isJointBest,
    bestAmount,
    language,
  });

  return (
    <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-xs font-bold text-slate-700 transition-all duration-200">
      <div className="mb-1.5 text-xs font-black text-slate-950">{t("calculationFlow")}</div>
      {flow.canCalculate ? (
        <ol className="grid gap-1.5">
          {flow.steps.map((step, stepIndex) => (
            <li key={`${step.label}-${stepIndex}`} className="grid grid-cols-[1.2rem_4.5rem_1fr] gap-1 leading-snug">
              <span className="text-slate-400">{stepIndex + 1}.</span>
              <span className="text-slate-500">{text(step.label)}：</span>
              <span className="min-w-0 text-slate-900">{text(step.value)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="leading-snug text-slate-700">
          <div className="font-black text-amber-700">{text(displayText(flow.message))}</div>
          {flow.reasons.length ? (
            <>
              <div className="mt-1 text-slate-500">{t("result")}：</div>
              <ul className="mt-1 grid gap-1 text-slate-600">
                {flow.reasons.map((reason) => (
                  <li key={reason}>- {text(displayText(reason))}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MobileQuoteCard({
  amount,
  quote,
  index,
  sourceCurrency,
  targetCurrency,
  isBest,
  isJointBest,
  bestAmount,
  onChange,
}) {
  const { t, text, language } = useI18n();
  const difference =
    !isBest && quote.finalAmount !== null && bestAmount !== null
      ? bestAmount - quote.finalAmount
      : null;
  const percentGap =
    difference !== null && quote.finalAmount > 0 ? (difference / quote.finalAmount) * 100 : null;
  const feeCurrency = quote.feeCurrencyMode === "target" ? targetCurrency : sourceCurrency;
  const shouldHideCalculatedValues = quote.quoteInputEmpty || quote.detectionLowConfidence;
  const rateLabel = quote.quoteInputEmpty
    ? t("notEntered")
    : shouldHideCalculatedValues
      ? t("pending")
      : t("effectiveRate");
  const rateSummaryText = quote.quoteInputEmpty
    ? t("notEntered")
    : shouldHideCalculatedValues || !Number.isFinite(quote.normalizedRate)
      ? "--"
      : `1 ${sourceCurrency} = ${formatMoney(quote.normalizedRate, 4)} ${targetCurrency}`;
  const suggestedFormatInfo = quote.suggestedFormatInfo
    ? getCompactFormatInfo(quote.suggestedFormatInfo)
    : null;
  const feeText = quote.feeConfig?.type === "none" ? t("none") : moneyWithSymbol(quote.feeAmount, feeCurrency);
  const gapText = difference !== null
    ? `${t("best")} - ${moneyWithSymbol(difference, targetCurrency)} / ${formatPercent(percentGap)}`
    : "-";
  const [isCalculationOpen, setIsCalculationOpen] = useState(false);
  const cardClass = isBest
    ? "relative mb-6 min-w-0 w-full rounded-xl border-2 border-green-500 bg-white p-6 shadow-sm ring-4 ring-green-50 transition-all"
    : "relative mb-6 min-w-0 w-full rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-all";
  return (
    <div className={cardClass}>
      {isBest ? (
        <div className="absolute -right-3 -top-3 flex items-center gap-1 rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
          <Crown size={14} />
          {isJointBest ? t("tiedBest") : t("best")}
        </div>
      ) : null}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <input
            value={quote.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder={getDefaultQuoteNameByLanguage(index, language)}
            className="h-8 min-w-0 max-w-[8.5rem] rounded-md border-none bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 outline-none transition-colors placeholder:text-indigo-300 focus:bg-indigo-50 focus:ring-2 focus:ring-indigo-300"
          />
          <div className="text-xs font-medium text-gray-400">{t("lastEdited")}：{text(formatEditedAt(quote.lastRateEditedAt))}</div>
        </div>

        <div className="flex min-w-0 shrink-0 flex-col items-end gap-1">
          <div className="whitespace-nowrap text-base font-bold text-gray-800">
            {rateSummaryText}
          </div>
          <div className="mt-1 text-[10px] text-gray-400 sm:text-xs">{rateLabel}</div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <MobileRateFormatSelect
            value={quote.format}
            onChange={(format) => onChange({ format })}
            sourceCurrency={sourceCurrency}
            targetCurrency={targetCurrency}
          />
          <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-xs font-medium leading-snug">
            <div className={
              quote.quoteInputEmpty
                ? "text-gray-400"
                : quote.detectionLowConfidence || quote.detectionNeedsConfirmation || quote.manualFormatWarning
                  ? "text-amber-700"
                  : "text-blue-700"
            }>
              {quote.quoteInputEmpty
                ? t("pleaseEnterQuote")
                : quote.detectionLowConfidence || quote.detectionNeedsConfirmation || quote.manualFormatWarning
                  ? t("pleaseConfirmQuoteFormat")
                  : t("convertedToEffectiveRate")}
            </div>
            {!quote.quoteInputEmpty && !quote.detectionLowConfidence && !quote.manualFormatWarning ? (
              <div className="mt-0.5 text-xs text-gray-400">{rateSummaryText}</div>
            ) : null}
            {quote.detectionNeedsConfirmation ? (
              <div className="mt-0.5 text-amber-600">{t("confirm")}</div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InputBox
            compact
            type="number"
            min="0"
            step="0.0001"
            value={quote.rate}
            onChange={(event) => onChange({ rate: event.target.value })}
            placeholder={t("enterExchangeRateQuote")}
            className="w-full"
          />
          <div className="min-w-0">
            <FeeConfigFields
              compact
              feeConfig={quote.feeConfig}
              onChange={(feeConfig) => onChange({ feeConfig })}
              sourceCurrency={sourceCurrency}
              targetCurrency={targetCurrency}
            />
          </div>
        </div>
      </div>

      {quote.manualFormatWarning ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-snug text-amber-800">
          <div>{t("pleaseConfirmQuoteFormat")}</div>
          {suggestedFormatInfo ? (
            <div className="mt-1 text-amber-700">
              你輸入的 {formatRateValue(quote.rate)} 更像是「{suggestedFormatInfo.meaning}」
            </div>
          ) : null}
          {quote.suggestedFormat ? (
            <button
              type="button"
              onClick={() => onChange({ format: quote.suggestedFormat })}
              className="mt-2 h-8 rounded-lg bg-amber-600 px-3 text-xs font-black text-white"
            >
              {t("confirm")}
            </button>
          ) : null}
        </div>
      ) : null}

      <hr className="my-4 border-gray-100" />

      <button
        type="button"
        onClick={() => setIsCalculationOpen((current) => !current)}
        className={`w-full cursor-pointer rounded-xl border px-4 py-3.5 text-left transition-colors ${
          isBest
            ? "border-green-100 bg-green-50/70 hover:bg-green-50"
            : "border-gray-100 bg-gray-50 hover:bg-gray-100"
        }`}
        aria-expanded={isCalculationOpen}
        aria-label={`${isCalculationOpen ? t("hideDetails") : t("calculationDetails")}${quote.displayName}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-bold text-gray-400">{t("estimatedAmount")}</div>
          <div className="min-w-0 text-right">
            {isBest ? (
              <span className="inline-flex rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-black text-white">
                {isJointBest ? t("tiedBest") : t("best")}
              </span>
            ) : difference !== null ? (
              <span className="break-words text-xs font-bold text-gray-500">{gapText}</span>
            ) : quote.rankStatus === "待確認" ? (
              <span className="text-xs font-bold text-amber-700">{t("pending")}</span>
            ) : null}
          </div>
        </div>
        <div className="mt-1 max-w-full break-words text-2xl font-black leading-tight text-gray-900">
          {moneyWithSymbol(quote.finalAmount, targetCurrency)}
        </div>
        {quote.rankStatus === "待確認" || quote.detectionLowConfidence ? (
          <div className="mt-1 text-xs font-bold text-amber-700">{t("pleaseConfirmQuoteFormat")}</div>
        ) : null}
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="text-xs font-medium text-gray-400">{t("feeDeducted")}：{feeText}</div>
          <div className="inline-flex items-center justify-end gap-1 text-sm font-bold text-gray-500 transition-colors hover:text-blue-600">
            {isCalculationOpen ? t("hideDetails") : t("calculationDetails")}
            {isCalculationOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </button>

      {quote.error && (!quote.detectionLowConfidence || quote.feeConfigIncomplete) && !quote.manualFormatWarning ? (
        <div className="mt-2 text-xs font-bold text-red-600">{text(quote.error)}</div>
      ) : null}

      {isCalculationOpen ? (
        <CalculationFlowPanel
          amount={amount}
          quote={quote}
          sourceCurrency={sourceCurrency}
          targetCurrency={targetCurrency}
          isBest={isBest}
          isJointBest={isJointBest}
          bestAmount={bestAmount}
        />
      ) : null}
    </div>
  );
}

function BestResultSummary({
  rankInfo,
  targetCurrency,
}) {
  const { t } = useI18n();
  const validQuotes = rankInfo.rankedQuotes;
  const validCount = validQuotes.length;
  const bestQuotes = validQuotes.filter((quote) => quote.isBest);

  if (validCount === 0) {
    return (
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-black text-gray-400">{t("resultSummary")}</div>
        <div className="mt-2 text-base font-black text-slate-800">{t("noComparableQuotes")}</div>
        <div className="mt-1 text-xs font-bold text-gray-400">{t("resultSummaryEmpty")}</div>
      </section>
    );
  }

  if (validCount === 1) {
    const onlyQuote = validQuotes[0];

    return (
      <section className="mb-4 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black text-blue-500">{t("resultSummary")}</div>
            <div className="mt-2 text-base font-black text-slate-900">{t("noComparableQuotes")}</div>
            <div className="mt-1 text-xs font-bold text-gray-400">{t("resultSummaryEmpty")}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs font-bold text-gray-400">{onlyQuote.displayName}</div>
            <div className="mt-1 break-words text-2xl font-black text-slate-900">
              {moneyWithSymbol(onlyQuote.finalAmount, targetCurrency)}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (rankInfo.bestTieCount > 1) {
    const names = bestQuotes.map((quote) => quote.displayName).join("、");

    return (
      <section className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 text-xs font-black text-emerald-700">{t("resultSummary")}</div>
            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
              <Crown size={13} />
              {t("tiedBest")}
            </div>
            <div className="mt-2 truncate text-base font-black text-emerald-900">{names}</div>
            <div className="mt-1 text-xs font-bold text-emerald-700">{t("tiedBest")}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs font-bold text-emerald-700">{t("estimatedAmount")}</div>
            <div className="mt-1 break-words text-2xl font-black text-emerald-900">
              {moneyWithSymbol(rankInfo.bestFinalAmount, targetCurrency)}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const bestQuote = bestQuotes[0];

  return (
    <section className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 text-xs font-black text-emerald-700">{t("resultSummary")}</div>
          <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
            <Crown size={13} />
            {t("best")}
          </div>
          <div className="mt-2 text-base font-black text-emerald-900">{bestQuote.displayName}</div>
          <div className="mt-1 text-xs font-bold text-emerald-700">{t("bestQuote")}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-bold text-emerald-700">{t("estimatedAmount")}</div>
          <div className="mt-1 break-words text-2xl font-black text-emerald-900">
            {moneyWithSymbol(bestQuote.finalAmount, targetCurrency)}
          </div>
        </div>
      </div>
    </section>
  );
}

function ThreeCurrencyRouteApp({
  amount,
  setAmount,
  amountError,
  sourceCurrency,
  setSourceCurrency,
  targetCurrency,
  setTargetCurrency,
  directQuote,
  routeResult,
  bridgeRoutes,
  pendingBridgeCurrency,
  setPendingBridgeCurrency,
  addBridgeRoute,
  addBridgeError,
  removeBridgeRoute,
  validationError,
  clearRouteData,
  updateDirectQuote,
  updateBridgeRouteQuote,
}) {
  const { t, text } = useI18n();
  const directRoute = routeResult.routes.find((route) => route.type === "direct");
  const visibleDirectRoute = validationError ? { ...directRoute, isValid: false, message: validationError } : directRoute;

  return (
    <div className="px-4 pb-4 pt-3">
      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-black text-slate-700">{t("amountYouHave")}</label>
            <button
              type="button"
              onClick={clearRouteData}
              className="flex items-center gap-1 text-sm font-bold text-gray-400 transition-colors hover:text-red-500"
            >
              <Trash2 size={14} />
              {t("clearInputs")}
            </button>
          </div>
          <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="min-w-0 flex-1 bg-white px-4 py-2 text-sm font-black text-slate-900 outline-none"
              placeholder={t("inputAmount")}
            />
            <span className="border-l border-gray-300 bg-gray-100 px-4 py-2 text-sm font-black text-gray-500">{sourceCurrency}</span>
          </div>
        </div>
        {amountError ? <div className="mt-1 text-xs font-bold text-red-600">{text(amountError)}</div> : null}

        <div className="mt-4">
              <div className="mb-1 text-xs font-bold text-slate-500">{t("routeCompare")}</div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <CurrencyCombobox value={sourceCurrency} onChange={setSourceCurrency} label={t("selectCurrencyYouHave")} />
            <button
              type="button"
              onClick={() => {
                setSourceCurrency(targetCurrency);
                setTargetCurrency(sourceCurrency);
              }}
              aria-label="swap currencies"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm transition hover:bg-blue-50 hover:text-blue-600 active:scale-95"
            >
              <ArrowRightLeft size={16} />
            </button>
            <CurrencyCombobox value={targetCurrency} onChange={setTargetCurrency} label={t("selectCurrencyYouWant")} />
          </div>
        </div>

      </section>

      <MultiRouteSummary
        validationError={validationError}
        routeResult={routeResult}
        sourceCurrency={sourceCurrency}
        targetCurrency={targetCurrency}
      />

      <DirectRouteCard
        route={visibleDirectRoute}
        quote={directQuote}
        sourceCurrency={sourceCurrency}
        targetCurrency={targetCurrency}
        comparisonStatus={validationError ? t("pending") : getRouteStatusText(visibleDirectRoute, targetCurrency)}
        isBest={!validationError && visibleDirectRoute?.isBest}
        isJointBest={!validationError && visibleDirectRoute?.isJointBest}
        onChange={updateDirectQuote}
      />

      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-900">{t("bridgeRoute")}</div>
            <div className="mt-0.5 text-xs font-bold text-gray-400">{t("canAddMultipleBridge")}</div>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <CurrencyCombobox value={pendingBridgeCurrency} onChange={setPendingBridgeCurrency} label={t("selectBridgeCurrency")} />
          <button
            type="button"
            onClick={addBridgeRoute}
            className="flex h-11 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-black text-white transition hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus size={16} />
            {t("addBridgeCurrency")}
          </button>
        </div>
        {addBridgeError ? <div className="mt-2 text-xs font-bold text-amber-700">{text(addBridgeError)}</div> : null}
      </section>

      {bridgeRoutes.length ? (
        bridgeRoutes.map((bridgeRoute) => {
          const calculatedRoute = routeResult.routes.find((route) => route.id === bridgeRoute.id) || {
            id: bridgeRoute.id,
            type: "bridge",
            bridgeCurrency: bridgeRoute.bridgeCurrency,
            isValid: false,
            finalAmount: null,
            intermediateAmount: null,
            steps: [],
            status: "待完成",
          };
          const visibleBridgeRoute = validationError
            ? { ...calculatedRoute, isValid: false, message: validationError }
            : calculatedRoute;

          return (
            <BridgeRouteCard
              key={bridgeRoute.id}
              route={visibleBridgeRoute}
              firstQuote={bridgeRoute.firstQuote}
              secondQuote={bridgeRoute.secondQuote}
              sourceCurrency={sourceCurrency}
              bridgeCurrency={bridgeRoute.bridgeCurrency}
              targetCurrency={targetCurrency}
              comparisonStatus={validationError ? t("pending") : getRouteStatusText(visibleBridgeRoute, targetCurrency)}
              isBest={!validationError && visibleBridgeRoute.isBest}
              isJointBest={!validationError && visibleBridgeRoute.isJointBest}
              onFirstChange={(patch) => updateBridgeRouteQuote(bridgeRoute.id, "firstQuote", patch)}
              onSecondChange={(patch) => updateBridgeRouteQuote(bridgeRoute.id, "secondQuote", patch)}
              onRemove={() => removeBridgeRoute(bridgeRoute.id)}
            />
          );
        })
      ) : (
        <section className="mb-6 rounded-xl border border-dashed border-gray-300 bg-white p-5 text-center shadow-sm">
          <div className="text-sm font-black text-slate-800">{t("noBridgeRoutes")}</div>
          <div className="mt-1 text-xs font-bold text-gray-400">{t("addBridgeHint")}</div>
        </section>
      )}
    </div>
  );
}

function ProviderQuoteRow({
  quote,
  result,
  sourceCurrency,
  targetCurrency,
  onChange,
  onRemove,
  canRemove,
  isBest,
}) {
  const { t, text, language } = useI18n();
  const hasRate = String(quote.rate || "").trim() !== "";
  const isWarning = hasRate && !result?.isValid;
  const rateText = result?.isValid
    ? formatRateDisplay(result.step?.normalizedRate, sourceCurrency, targetCurrency)
    : "--";
  const resultText = result?.isValid
    ? formatDisplayMoney(result.finalAmount, targetCurrency)
    : result?.invalidCurrencyCombination
      ? "-"
      : text(displayText(result?.reason || result?.message || "請輸入匯率報價"));
  const feeCurrency = result?.feeCurrencyMode === "target" ? targetCurrency : sourceCurrency;
  const feeText = result?.isValid && result.feeAmount > 0
    ? formatDisplayMoney(result.feeAmount, feeCurrency)
    : t("none");

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all duration-300 ${
        isBest
          ? "border-emerald-500 bg-emerald-50/30 shadow-sm ring-4 ring-emerald-50"
          : "border-gray-200 bg-gray-50/50"
      }`}
    >
      {isBest ? (
        <div className="absolute -right-2 -top-3 flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-black tracking-wide text-white shadow-sm">
          <Crown size={14} />
          {t("bestQuote")}
        </div>
      ) : null}

      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={quote.providerName}
            onChange={(event) => onChange({ providerName: event.target.value })}
            placeholder={language === "en" ? "e.g. Bank A" : "例如：銀行 A"}
            className="h-9 min-w-0 w-full rounded-lg border border-transparent bg-white/60 px-3 text-sm font-black text-slate-800 outline-none transition hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            aria-label={t("provider")}
          />
          <div className="mt-1 text-xs font-medium text-gray-400">{t("lastEdited")}：{text(formatEditedAt(quote.lastRateEditedAt))}</div>
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition hover:bg-red-100 hover:text-red-600"
            aria-label={`${t("delete")} ${quote.providerName || t("exchangeRateQuote")}`}
          >
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>

      <div className="mb-3 grid grid-cols-[5.6rem_1fr] items-center gap-3">
        <MobileRateFormatSelect
          value={quote.format}
          onChange={(format) => onChange({ format })}
          sourceCurrency={sourceCurrency}
          targetCurrency={targetCurrency}
        />
        <div className="min-w-0 text-xs leading-snug">
          <div className="font-black text-slate-700">{sourceCurrency} → {targetCurrency}</div>
          <div className={isWarning ? "mt-0.5 font-bold text-amber-700" : "mt-0.5 font-bold text-gray-400"}>
            {isWarning ? t("pleaseConfirmQuoteFormat") : t("quoteAutoConverted")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InputBox
          compact
          type="number"
          min="0"
          step="0.0001"
          value={quote.rate}
          onChange={(event) => onChange({ rate: event.target.value })}
          placeholder={t("enterExchangeRateQuote")}
          className="w-full bg-white"
        />
        <FeeConfigFields
          compact
          feeConfig={quote.feeConfig}
          onChange={(feeConfig) => onChange({ feeConfig })}
          sourceCurrency={sourceCurrency}
          targetCurrency={targetCurrency}
        />
      </div>

      <hr className="my-3 border-gray-200/80" />

      <div className={`rounded-xl border px-4 py-3.5 ${isBest ? "border-emerald-100 bg-emerald-50/70" : "border-gray-100 bg-white/80"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-bold text-gray-400">{t("estimatedAmount")}</div>
          {isBest ? (
            <span className="inline-flex rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-black text-white">{t("best")}</span>
          ) : null}
        </div>
        <div className={result?.isValid ? "mt-1 max-w-full break-words text-2xl font-black leading-tight text-slate-900" : "mt-1 max-w-full break-words text-sm font-bold text-amber-700"}>
          {resultText}
        </div>
        <div className="mt-1 text-xs font-medium text-gray-400">{t("effectiveRate")}：{rateText}</div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="text-xs font-medium text-gray-400">{t("feeDeducted")}：{feeText}</div>
          <div className="text-sm font-bold text-gray-500">{t("calculationDetails")}</div>
        </div>
      </div>
    </div>
  );
}

function ProviderQuoteGroup({
  title,
  pathText,
  addLabel,
  sourceCurrency,
  targetCurrency,
  quotes,
  groupResult,
  onAdd,
  onChangeQuote,
  onRemoveQuote,
}) {
  const { t } = useI18n();
  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          <div className="mt-1 text-xs font-bold text-gray-400">{pathText}</div>
        </div>
        {groupResult?.bestQuotes?.[0] ? (
          <div className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-right">
            <div className="text-[10px] font-bold text-emerald-600">{t("best")}</div>
            <div className="text-xs font-black text-emerald-800">{groupResult.bestQuotes[0].providerName}</div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4">
        {quotes.map((quote, index) => {
          const result = groupResult?.quotes?.find((item) => item.id === quote.id);
          const isBest = result?.isValid && groupResult?.bestQuotes?.[0]?.id === quote.id;

          return (
            <ProviderQuoteRow
              key={quote.id}
              quote={quote}
              result={result}
              isBest={isBest}
              sourceCurrency={sourceCurrency}
              targetCurrency={targetCurrency}
              onChange={(patch) => onChangeQuote(quote.id, patch)}
              onRemove={() => onRemoveQuote(quote.id)}
              canRemove={index > 0}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 py-3 text-sm font-black text-gray-500 transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 active:scale-[0.98]"
      >
        <Plus size={18} />
        {addLabel}
      </button>
    </section>
  );
}

function ProviderRecommendation({
  recommendation,
  directBest,
  bridgeBest,
  sourceCurrency,
  bridgeCurrency,
  targetCurrency,
  invalidCurrencyMessage,
  resultSummaryRef,
}) {
  const { t, text } = useI18n();
  if (invalidCurrencyMessage) {
    return (
      <section ref={resultSummaryRef} className="result-summary mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="text-xs font-black text-amber-700">{t("finalRecommendation")}</div>
        <div className="mt-2 text-lg font-black text-amber-900">{t("invalidCurrencyCombination")}</div>
        <div className="mt-1 text-xs font-bold text-amber-700">{text(displayText(invalidCurrencyMessage))}</div>
      </section>
    );
  }

  if (recommendation.recommendationType === "insufficient_data") {
    return (
      <section ref={resultSummaryRef} className="result-summary mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
        <div className="text-xs font-black text-blue-600">{t("finalRecommendation")}</div>
        <div className="mt-2 text-lg font-black text-slate-900">{t("completeQuotesBeforeCompare")}</div>
        <div className="mt-1 text-xs font-bold text-slate-500">{text(displayText(recommendation.suggestionText))}</div>
      </section>
    );
  }

  if (recommendation.recommendationType === "tie") {
    return (
      <section ref={resultSummaryRef} className="result-summary mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-md">
        <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
          <Crown size={13} />
          {t("finalRecommendation")}
        </div>
        <div className="mt-3 text-lg font-black text-emerald-950">{t("tinyDifferenceSuggestion")}</div>
        <div className="mt-1 text-xs font-bold text-emerald-700">{t("tinyDifferenceSuggestion")}</div>
        <div className="mt-4 text-xs font-bold text-emerald-700">{t("estimatedAmount")}</div>
        <div className="mt-1 break-words text-3xl font-black text-emerald-950">{formatDisplayMoney(recommendation.bestFinalAmount, targetCurrency)}</div>
      </section>
    );
  }

  const useBridge = recommendation.recommendationType === "bridge";
  const strengthText = useBridge
    ? t("bridgeBetterSuggestion")
    : t("directBetterSuggestion");

  return (
    <section ref={resultSummaryRef} className="result-summary mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-md">
      <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
        <Crown size={13} />
        {t("finalRecommendation")}
      </div>
      <div className="mt-3 text-2xl font-black text-emerald-950">{t("recommendedOption")}：{useBridge ? t("bridgeRoute") : t("directExchange")}</div>
      <div className="mt-4 grid gap-3 rounded-xl bg-white/70 p-3">
        <div>
          <div className="text-xs font-bold text-emerald-700">{t("bestRoute")}</div>
          <div className="mt-0.5 text-sm font-black text-slate-900">
            {useBridge ? `${sourceCurrency} → ${bridgeCurrency} → ${targetCurrency}` : `${sourceCurrency} → ${targetCurrency}`}
          </div>
        </div>
        {useBridge ? (
          <div className="grid gap-2 text-xs font-bold text-slate-700">
            <div>{t("firstStep")}：{bridgeBest?.bestFirstQuote?.providerName}：{sourceCurrency} → {bridgeCurrency}</div>
            <div>{t("secondStep")}：{bridgeBest?.bestSecondQuote?.providerName}：{bridgeCurrency} → {targetCurrency}</div>
          </div>
        ) : (
          <div>
            <div className="text-xs font-bold text-emerald-700">{t("provider")}</div>
            <div className="mt-0.5 text-sm font-black text-slate-900">{directBest?.providerName}</div>
          </div>
        )}
      </div>
      <div className="mt-4 text-xs font-bold text-emerald-700">{t("estimatedAmount")}</div>
      <div className="mt-1 break-words text-3xl font-black text-emerald-950">{formatDisplayMoney(recommendation.bestFinalAmount, targetCurrency)}</div>
      {Number.isFinite(recommendation.differenceAmount) ? (
        <div className="mt-1 text-xs font-bold text-emerald-700">
          {useBridge ? t("bridgeRoute") : t("directExchange")} + {formatDisplayMoney(recommendation.differenceAmount, targetCurrency)} / {formatPercent(recommendation.differencePercent)}
        </div>
      ) : null}
      <div className="mt-3 rounded-xl bg-emerald-100/70 px-3 py-2 text-xs font-bold leading-snug text-emerald-800">
        {strengthText}
      </div>
    </section>
  );
}

function ProviderCombinationApp({
  amount,
  setAmount,
  amountError,
  sourceCurrency,
  setSourceCurrency,
  targetCurrency,
  setTargetCurrency,
  bridgeCurrency,
  setBridgeCurrency,
  directQuotes,
  bridgeFirstQuotes,
  bridgeSecondQuotes,
  directGroup,
  bridgeCombination,
  recommendation,
  invalidCurrencyMessage,
  invalidCurrencyCombination,
  resultSummaryRef,
  updateProviderQuote,
  addProviderQuote,
  removeProviderQuote,
  clearProviderInputs,
  viewProviderResult,
}) {
  const { t, text } = useI18n();
  return (
    <div className="px-4 pb-4 pt-3">
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-black text-slate-900">{t("routeCompare")}</div>
          <button
            type="button"
            onClick={clearProviderInputs}
            className="flex items-center gap-1 text-xs font-bold text-gray-400 transition-colors hover:text-red-500"
          >
            <Trash2 size={14} />
            {t("clearInputs")}
          </button>
        </div>
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-xs font-bold text-gray-500">
            {t("amountYouHave")}
            <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="min-w-0 flex-1 bg-white px-4 py-2.5 text-sm font-black text-slate-900 outline-none"
                placeholder={t("inputAmount")}
              />
              <span className="border-l border-gray-300 bg-gray-50 px-4 py-2.5 text-sm font-black text-gray-500">
                {sourceCurrency}
              </span>
            </div>
          </label>
          {amountError ? <div className="text-xs font-bold text-red-600">{text(amountError)}</div> : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-bold text-gray-500">
              {t("currencyYouWant")}
              <CurrencyCombobox value={targetCurrency} onChange={setTargetCurrency} label={t("selectCurrencyYouWant")} />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-gray-500">
              {t("bridgeCurrency")}
              <CurrencyCombobox value={bridgeCurrency} onChange={setBridgeCurrency} label={t("selectBridgeCurrency")} />
            </label>
          </div>

          <label className="grid gap-1.5 text-xs font-bold text-gray-500">
            {t("currencyYouHave")}
            <CurrencyCombobox value={sourceCurrency} onChange={setSourceCurrency} label={t("selectCurrencyYouHave")} />
          </label>
        </div>
      </section>

      <ProviderRecommendation
        recommendation={recommendation}
        directBest={directGroup.bestQuotes[0]}
        bridgeBest={bridgeCombination}
        sourceCurrency={sourceCurrency}
        bridgeCurrency={bridgeCurrency}
        targetCurrency={targetCurrency}
        invalidCurrencyMessage={invalidCurrencyMessage}
        resultSummaryRef={resultSummaryRef}
      />

      <ProviderQuoteGroup
        title={t("directExchangeQuote")}
        pathText={`${sourceCurrency} → ${targetCurrency}`}
        addLabel={t("addDirectRateQuote")}
        sourceCurrency={sourceCurrency}
        targetCurrency={targetCurrency}
        quotes={directQuotes}
        groupResult={directGroup}
        onAdd={() => addProviderQuote("direct")}
        onChangeQuote={(id, patch) => updateProviderQuote("direct", id, patch)}
        onRemoveQuote={(id) => removeProviderQuote("direct", id)}
      />

      <ProviderQuoteGroup
        title={t("firstExchangeStep")}
        pathText={`${sourceCurrency} → ${bridgeCurrency}`}
        addLabel={t("addFirstStepRateQuote")}
        sourceCurrency={sourceCurrency}
        targetCurrency={bridgeCurrency}
        quotes={bridgeFirstQuotes}
        groupResult={bridgeCombination.firstGroup}
        onAdd={() => addProviderQuote("first")}
        onChangeQuote={(id, patch) => updateProviderQuote("first", id, patch)}
        onRemoveQuote={(id) => removeProviderQuote("first", id)}
      />

      <ProviderQuoteGroup
        title={t("secondExchangeStep")}
        pathText={`${bridgeCurrency} → ${targetCurrency}`}
        addLabel={t("addSecondStepRateQuote")}
        sourceCurrency={bridgeCurrency}
        targetCurrency={targetCurrency}
        quotes={bridgeSecondQuotes}
        groupResult={bridgeCombination.secondGroup}
        onAdd={() => addProviderQuote("second")}
        onChangeQuote={(id, patch) => updateProviderQuote("second", id, patch)}
        onRemoveQuote={(id) => removeProviderQuote("second", id)}
      />

      <section className="mb-8 mt-2">
        <button
          type="button"
          onClick={viewProviderResult}
          className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-4 text-base font-black text-white shadow-md transition-all hover:bg-blue-700 active:scale-[0.98]"
        >
          {t("startCompareAndViewResult")}
        </button>
      </section>
    </div>
  );
}

function MobileExchangeApp({
  activeTab,
  setActiveTab,
  amount,
  setAmount,
  amountError,
  sourceCurrency,
  setSourceCurrency,
  targetCurrency,
  setTargetCurrency,
  quotes,
  calculatedQuotes,
  bestAmount,
  updateQuote,
  addQuote,
  clearAllData,
  debugPanel,
  rankInfo,
  routePanel,
}) {
  const { t, text } = useI18n();
  const rankedQuotes = rankInfo.rankedQuotes;
  const canAddQuote = quotes.length < MAX_QUOTES;

  function swapCurrencies() {
    setSourceCurrency(targetCurrency);
    setTargetCurrency(sourceCurrency);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      <div className="mx-auto w-full max-w-md overflow-x-hidden pb-10">
          <div className="px-4 pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-950">{t("appTitle")}</div>
                  <div className="text-xs font-bold text-slate-500">{t("appSubtitle")}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <LanguageToggle />
                <HelpCircle size={19} className="text-slate-500" aria-label="help" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 border-b border-slate-200 text-center text-xs font-black">
              <button
                type="button"
                onClick={() => setActiveTab("single")}
                className={`border-b-2 pb-2 ${
                  activeTab === "single"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500"
                }`}
              >
                {t("singleCompare")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("route")}
                className={`border-b-2 pb-2 ${
                  activeTab === "route"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500"
                }`}
              >
                {t("routeCompare")}
              </button>
            </div>
          </div>

          {activeTab === "route" ? routePanel : (
          <div className="px-4 pb-4 pt-3">
            <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-black text-slate-700">{t("amountYouHave")}</label>
                  <button
                    type="button"
                    onClick={clearAllData}
                    className="flex items-center gap-1 text-sm font-bold text-gray-400 transition-colors hover:text-red-500"
                  >
                    <Trash2 size={14} />
                    {t("clearInputs")}
                  </button>
                </div>
                <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="min-w-0 flex-1 bg-white px-4 py-2 text-sm font-black text-slate-900 outline-none"
                    placeholder={t("inputAmount")}
                  />
                  <span className="border-l border-gray-300 bg-gray-100 px-4 py-2 text-sm font-black text-gray-500">
                    {sourceCurrency}
                  </span>
                </div>
              </div>
              {amountError ? <div className="mt-1 text-xs font-bold text-red-600">{text(amountError)}</div> : null}

              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">{t("currencyYouHave")}</div>
                  <CurrencyCombobox
                    value={sourceCurrency}
                    onChange={setSourceCurrency}
                    label={t("selectCurrencyYouHave")}
                  />
                </div>
                <button
                  type="button"
                  onClick={swapCurrencies}
                  aria-label="swap currencies"
                  className="mt-5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600 active:scale-95"
                >
                  <ArrowRightLeft size={18} />
                </button>
                <div>
                  <div className="mb-1 text-xs font-bold text-slate-500">{t("currencyYouWant")}</div>
                  <CurrencyCombobox
                    value={targetCurrency}
                    onChange={setTargetCurrency}
                    label={t("selectCurrencyYouWant")}
                  />
                </div>
              </div>
            </section>

            <BestResultSummary
              rankInfo={rankInfo}
              targetCurrency={targetCurrency}
            />

            <div className="mt-3 grid min-w-0 gap-2">
              {calculatedQuotes.map((quote, index) => (
                (() => {
                  return (
                    <MobileQuoteCard
                      key={quote.id}
                      amount={amount}
                      quote={quote}
                      index={index}
                      sourceCurrency={sourceCurrency}
                      targetCurrency={targetCurrency}
                      isBest={quote.isBest}
                      isJointBest={quote.isJointBest}
                      bestAmount={bestAmount}
                      onChange={(patch) => updateQuote(quote.id, patch)}
                    />
                  );
                })()
              ))}
            </div>

            <button
              type="button"
              onClick={addQuote}
              disabled={!canAddQuote}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 transition-colors ${
                canAddQuote
                  ? "border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-600"
                  : "cursor-not-allowed border-gray-200 text-gray-300"
              }`}
            >
              <Plus size={18} />
              {canAddQuote ? `${t("addRateQuote")} (${quotes.length}/${MAX_QUOTES})` : t("maxRateQuotes", { count: MAX_QUOTES })}
            </button>

            <button
              type="button"
              onClick={() => document.getElementById("mobile-results")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-lg font-bold text-white shadow-md transition-transform hover:bg-blue-700 active:scale-[0.98]"
            >
              <Play size={20} />
              {t("startCompare")}
            </button>

            <div className="mt-2 text-center text-xs font-bold text-slate-400">
              {t("noBackendNeeded")}
            </div>

            <section id="mobile-results" className="mt-4 rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Crown size={13} />
                  </div>
                  <h2 className="text-sm font-black text-slate-950">{t("comparisonResult")}</h2>
                </div>
                <div className="text-xs font-bold text-slate-500">
                  {t("evaluatedAs", { amount: formatDisplayMoney(toNumber(amount) || 0, sourceCurrency), currency: targetCurrency })}
                </div>
              </div>

              <div className="grid gap-2">
                {rankedQuotes.length ? (
                  rankedQuotes.map((quote, index) => {
                    return (
                      <div
                        key={quote.id}
                        className={`flex items-center gap-3 rounded-xl border p-2 ${
                          quote.isBest ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${
                          quote.isBest ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                        }`}>
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-950">{quote.displayName || quote.name}</span>
                            {quote.isBest ? (
                              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">
                                {quote.isJointBest ? t("tiedBest") : t("best")}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-xs font-bold text-slate-500">
                            {formatRateDisplay(quote.normalizedRate, sourceCurrency, targetCurrency)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="max-w-full break-words text-sm font-black text-slate-950">
                            {formatDisplayMoney(quote.finalAmount, targetCurrency)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-500">
                    {t("pleaseEnterQuoteSentence")}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
                <span>{t("effectiveRate")}</span>
                <span>1 {sourceCurrency} = {t("autoCalculatedValue")} {targetCurrency}</span>
                <ChevronRight size={15} />
              </div>
            </section>

            {debugPanel}
          </div>
          )}
      </div>
    </div>
  );
}

function formatDebugNumber(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return Number(value).toFixed(digits);
}

function ExchangeDebugPanel({
  quotes,
  sourceCurrency,
  targetCurrency,
  referenceRate,
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between text-left font-black text-slate-100"
      >
        開發除錯
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isOpen ? (
        <div className="mt-3">
          <div className="mb-2 text-slate-300">
            referenceRate：{formatRateDisplay(referenceRate, sourceCurrency, targetCurrency)}
          </div>
          <div className="grid gap-2">
            {quotes.map((quote) => (
              <div key={quote.id} className="rounded-lg bg-white/10 p-2">
                <div className="font-black text-white">{quote.displayName}</div>
                <div className="mt-1 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1">
                  <span className="text-slate-400">原始輸入</span>
                  <span>{quote.rate || "-"}</span>
                  <span className="text-slate-400">自動格式</span>
                  <span>{quote.detectedFormat || "-"}</span>
                  <span className="text-slate-400">normalizedRate</span>
                  <span>{formatDebugNumber(quote.normalizedRate, 8)}</span>
                  <span className="text-slate-400">referenceRate</span>
                  <span>{formatDebugNumber(quote.referenceRate, 8)}</span>
                  <span className="text-slate-400">deviation</span>
                  <span>{formatDebugNumber(quote.deviation, 8)}</span>
                  <span className="text-slate-400">confidence</span>
                  <span>{quote.confidence || "-"}</span>
                  <span className="text-slate-400">finalAmount</span>
                  <span>{formatDebugNumber(quote.finalAmount, 2)}</span>
                  <span className="text-slate-400">參與排名</span>
                  <span>{quote.participatesInRanking ? "是" : "否"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LanguageToggle() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="flex items-center rounded-full bg-slate-100 p-1 text-xs font-black">
      <button
        type="button"
        onClick={() => setLanguage("zh-TW")}
        className={`rounded-full px-2 py-1 transition-colors ${
          language === "zh-TW" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"
        }`}
      >
        {t("zhShort")}
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={`rounded-full px-2 py-1 transition-colors ${
          language === "en" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"
        }`}
      >
        {t("enShort")}
      </button>
    </div>
  );
}

function AppContent() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("single");
  const [routeMode, setRouteMode] = useState("custom");
  const [amount, setAmount] = useState("10000");
  const [sourceCurrency, setSourceCurrency] = useState("HKD");
  const [targetCurrency, setTargetCurrency] = useState("CNY");
  const [quotes, setQuotes] = useState(() => [makeQuote(0), makeQuote(1)]);
  const [routeAmount, setRouteAmount] = useState("10000");
  const [routeSourceCurrency, setRouteSourceCurrency] = useState("CNY");
  const [routeTargetCurrency, setRouteTargetCurrency] = useState("MOP");
  const [directRouteQuote, setDirectRouteQuote] = useState(() => makeRouteQuote());
  const [bridgeRouteItems, setBridgeRouteItems] = useState(() => [makeBridgeRoute("HKD")]);
  const [pendingBridgeCurrency, setPendingBridgeCurrency] = useState("USD");
  const [addBridgeError, setAddBridgeError] = useState("");
  const [providerAmount, setProviderAmount] = useState("10000");
  const [providerSourceCurrency, setProviderSourceCurrency] = useState("CNY");
  const [providerTargetCurrency, setProviderTargetCurrency] = useState("MOP");
  const [providerBridgeCurrency, setProviderBridgeCurrency] = useState("HKD");
  const [directProviderQuotes, setDirectProviderQuotes] = useState(() => [makeProviderQuote("銀行 A"), makeProviderQuote("銀行 B")]);
  const [bridgeFirstProviderQuotes, setBridgeFirstProviderQuotes] = useState(() => [makeProviderQuote("銀行 C")]);
  const [bridgeSecondProviderQuotes, setBridgeSecondProviderQuotes] = useState(() => [makeProviderQuote("銀行 D")]);
  const providerResultSummaryRef = useRef(null);

  useEffect(() => {
    function preventNumberInputWheel(event) {
      if (event.target instanceof HTMLInputElement && event.target.type === "number") {
        event.preventDefault();
      }
    }

    document.addEventListener("wheel", preventNumberInputWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      document.removeEventListener("wheel", preventNumberInputWheel, {
        capture: true,
      });
    };
  }, []);

  const amountError = useMemo(() => {
    const numericAmount = toNumber(amount);
    return !Number.isFinite(numericAmount) || numericAmount <= 0 ? "現持有金額必須大於 0" : "";
  }, [amount]);

  const routeAmountError = useMemo(() => {
    const numericAmount = toNumber(routeAmount);
    return !Number.isFinite(numericAmount) || numericAmount <= 0 ? "現持有金額必須大於 0" : "";
  }, [routeAmount]);

  const providerAmountError = useMemo(() => {
    const numericAmount = toNumber(providerAmount);
    return !Number.isFinite(numericAmount) || numericAmount <= 0 ? "現持有金額必須大於 0" : "";
  }, [providerAmount]);

  const fallbackReferenceRateInfo = useMemo(
    () => getFallbackReferenceRate(sourceCurrency, targetCurrency),
    [sourceCurrency, targetCurrency],
  );
  const [apiReferenceRateInfo, setApiReferenceRateInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setApiReferenceRateInfo(null);

    getReferenceRate(sourceCurrency, targetCurrency).then((info) => {
      if (!cancelled) {
        setApiReferenceRateInfo({
          ...info,
          sourceCurrency,
          targetCurrency,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sourceCurrency, targetCurrency]);

  const referenceRateInfo =
    apiReferenceRateInfo?.sourceCurrency === sourceCurrency &&
    apiReferenceRateInfo?.targetCurrency === targetCurrency
      ? apiReferenceRateInfo
      : fallbackReferenceRateInfo;
  const referenceRate = referenceRateInfo?.rate;

  const routeResult = useMemo(() => calculateMultiBridgeRoutes({
    amount: routeAmount,
    sourceCurrency: routeSourceCurrency,
    targetCurrency: routeTargetCurrency,
    directQuote: {
      inputRate: directRouteQuote.rate,
      selectedFormat: directRouteQuote.format,
      feeConfig: directRouteQuote.feeConfig,
      referenceRate: getFallbackReferenceRate(routeSourceCurrency, routeTargetCurrency).rate,
    },
    bridgeRoutes: bridgeRouteItems.map((bridgeRoute) => ({
      id: bridgeRoute.id,
      bridgeCurrency: bridgeRoute.bridgeCurrency,
      firstQuote: {
        inputRate: bridgeRoute.firstQuote.rate,
        selectedFormat: bridgeRoute.firstQuote.format,
        feeConfig: bridgeRoute.firstQuote.feeConfig,
        referenceRate: getFallbackReferenceRate(routeSourceCurrency, bridgeRoute.bridgeCurrency).rate,
      },
      secondQuote: {
        inputRate: bridgeRoute.secondQuote.rate,
        selectedFormat: bridgeRoute.secondQuote.format,
        feeConfig: bridgeRoute.secondQuote.feeConfig,
        referenceRate: getFallbackReferenceRate(bridgeRoute.bridgeCurrency, routeTargetCurrency).rate,
      },
    })),
  }), [routeAmount, routeSourceCurrency, routeTargetCurrency, directRouteQuote, bridgeRouteItems]);

  const routeValidationError = useMemo(() => {
    if (routeSourceCurrency === routeTargetCurrency) {
      return "現持有貨幣（賣出）和想兌換成的貨幣（買入）不能相同";
    }

    return "";
  }, [routeSourceCurrency, routeTargetCurrency]);

  const providerCurrencyMessage = useMemo(() => validateCurrencyCombination({
    sourceCurrency: providerSourceCurrency,
    targetCurrency: providerTargetCurrency,
    bridgeCurrency: providerBridgeCurrency,
  }), [providerSourceCurrency, providerTargetCurrency, providerBridgeCurrency]);
  const invalidProviderCurrencyCombination = Boolean(providerCurrencyMessage);

  const directProviderGroup = useMemo(() => {
    if (invalidProviderCurrencyCombination) {
      return makeProviderQuotePendingGroup({
        quotes: directProviderQuotes,
        sourceCurrency: providerSourceCurrency,
        targetCurrency: providerTargetCurrency,
        message: "請選擇不同的現持有貨幣、想兌換成的貨幣和中轉貨幣",
      });
    }

    return calculateQuoteGroup({
      amount: providerAmount,
      sourceCurrency: providerSourceCurrency,
      targetCurrency: providerTargetCurrency,
      quotes: directProviderQuotes.map((quote) => ({
        ...quote,
        referenceRate: getFallbackReferenceRate(providerSourceCurrency, providerTargetCurrency).rate,
      })),
    });
  }, [
    invalidProviderCurrencyCombination,
    providerAmount,
    providerSourceCurrency,
    providerTargetCurrency,
    directProviderQuotes,
  ]);

  const bridgeProviderCombination = useMemo(() => {
    if (invalidProviderCurrencyCombination) {
      return makeProviderCurrencyInvalidBridgeResult({
        amount: providerAmount,
        sourceCurrency: providerSourceCurrency,
        bridgeCurrency: providerBridgeCurrency,
        targetCurrency: providerTargetCurrency,
        firstQuotes: bridgeFirstProviderQuotes,
        secondQuotes: bridgeSecondProviderQuotes,
        message: "請選擇不同的現持有貨幣、想兌換成的貨幣和中轉貨幣",
      });
    }

    return calculateBestBridgeCombination({
      amount: providerAmount,
      sourceCurrency: providerSourceCurrency,
      bridgeCurrency: providerBridgeCurrency,
      targetCurrency: providerTargetCurrency,
      firstQuotes: bridgeFirstProviderQuotes.map((quote) => ({
        ...quote,
        referenceRate: getFallbackReferenceRate(providerSourceCurrency, providerBridgeCurrency).rate,
      })),
      secondQuotes: bridgeSecondProviderQuotes.map((quote) => ({
        ...quote,
        referenceRate: getFallbackReferenceRate(providerBridgeCurrency, providerTargetCurrency).rate,
      })),
    });
  }, [
    invalidProviderCurrencyCombination,
    providerAmount,
    providerSourceCurrency,
    providerBridgeCurrency,
    providerTargetCurrency,
    bridgeFirstProviderQuotes,
    bridgeSecondProviderQuotes,
  ]);

  const providerRecommendation = useMemo(() => {
    if (invalidProviderCurrencyCombination) {
      return {
        recommendationType: "insufficient_data",
        bestFinalAmount: null,
        differenceAmount: null,
        differencePercent: null,
        strength: "tiny",
        suggestionText: "請選擇不同的現持有貨幣、想兌換成的貨幣和中轉貨幣",
      };
    }

    return compareDirectAndBridge({
      directBestResult: directProviderGroup.bestQuotes[0] || null,
      bridgeBestResult: bridgeProviderCombination,
    });
  }, [invalidProviderCurrencyCombination, directProviderGroup, bridgeProviderCombination]);

  const calculatedQuotes = useMemo(() => {
    return quotes.map((quote, index) => {
      const displayName = quote.name.trim() || getDefaultQuoteName(index);
      const quoteInputEmpty = String(quote.rate || "").trim() === "";

      if (quoteInputEmpty) {
        return {
          ...quote,
          displayName,
          quoteInputEmpty: true,
          normalizedRate: null,
          detectedFormat: null,
          detectionLowConfidence: false,
          detectionNeedsConfirmation: false,
          manualFormatWarning: false,
          suggestedFormat: null,
          suggestedFormatInfo: null,
          formatInfo: { message: "輸入後自動判斷", formula: "" },
          feeAmount: null,
          feeCurrencyMode: quote.feeConfig?.feeCurrencyMode || "source",
          finalAmount: null,
          referenceRate,
          deviation: null,
          confidence: null,
          detectionReason: null,
          feeConfigIncomplete: false,
          shouldCalculate: false,
          participatesInRanking: false,
          error: "",
        };
      }

      try {
        const isManualFormat = quote.format !== "auto";
        const autoDetection = detectQuoteFormat(quote.rate, sourceCurrency, targetCurrency, referenceRate);
        const manualNormalizedRate = isManualFormat ? normalizeRate(quote.rate, quote.format) : null;
        const manualDeviation = isManualFormat
          ? calculateRateDeviation(manualNormalizedRate, referenceRate)
          : null;
        const manualFormatWarning = isManualFormat && manualDeviation !== null && manualDeviation > 0.15;
        const detection = isManualFormat
          ? {
            format: quote.format,
            normalizedRate: manualNormalizedRate,
            deviation: manualDeviation,
            confidence: manualFormatWarning ? "manual_warning" : "manual",
            lowConfidence: false,
            shouldCalculate: true,
          }
          : autoDetection;

        const formatInfo = !detection.shouldCalculate
          ? getUnavailableFormatInfo(detection)
          : getQuoteFormatInfo(
            detection.format,
            sourceCurrency,
            targetCurrency,
            quote.format === "auto" ? "已判斷" : "手動",
            quote.rate,
          );

        if (!detection.shouldCalculate) {
          return {
            ...quote,
            displayName,
            quoteInputEmpty: false,
            normalizedRate: null,
            detectedFormat: detection.format,
            detectionLowConfidence: true,
            detectionNeedsConfirmation: false,
            manualFormatWarning: false,
            suggestedFormat: null,
            suggestedFormatInfo: null,
            formatInfo,
            feeAmount: null,
            feeCurrencyMode: quote.feeConfig?.feeCurrencyMode || "source",
            finalAmount: null,
            referenceRate,
            deviation: detection.deviation,
            confidence: detection.confidence,
            detectionReason: detection.reason,
            feeConfigIncomplete: false,
            shouldCalculate: false,
            participatesInRanking: false,
            error: formatInfo.message,
          };
        }

        const normalizedRate = detection.normalizedRate;
        const quoteResult = calculateFinalAmountWithFeeConfig(amount, normalizedRate, quote.feeConfig);
        return {
          ...quote,
          displayName,
          quoteInputEmpty: false,
          normalizedRate,
          detectedFormat: detection.format,
          detectionLowConfidence: false,
          detectionNeedsConfirmation: detection.confidence === "low_confidence",
          manualFormatWarning,
          suggestedFormat: null,
          suggestedFormatInfo: null,
          formatInfo,
          feeAmount: quoteResult.feeAmount,
          feeCurrencyMode: quoteResult.feeCurrencyMode,
          finalAmount: quoteResult.finalAmount,
          referenceRate,
          deviation: detection.deviation,
          confidence: detection.confidence,
          detectionReason: detection.reason,
          feeConfigIncomplete: false,
          shouldCalculate: true,
          participatesInRanking: true,
          error: "",
        };
      } catch (error) {
        const feeConfigIncomplete = error.message.includes("請補充手續費資料");

        return {
          ...quote,
          displayName,
          quoteInputEmpty: false,
          normalizedRate: null,
          detectedFormat: null,
          detectionLowConfidence: true,
          detectionNeedsConfirmation: false,
          manualFormatWarning: false,
          suggestedFormat: null,
          suggestedFormatInfo: null,
          formatInfo: getQuoteFormatInfo(null, sourceCurrency, targetCurrency),
          feeAmount: null,
          feeCurrencyMode: quote.feeConfig?.feeCurrencyMode || "source",
          finalAmount: null,
          referenceRate,
          deviation: null,
          confidence: "need_manual",
          detectionReason: "calculation_error",
          feeConfigIncomplete,
          shouldCalculate: false,
          participatesInRanking: false,
          error: error.message,
        };
      }
    });
  }, [amount, quotes, sourceCurrency, targetCurrency, referenceRate]);

  const rankInfo = useMemo(() => rankQuotes(calculatedQuotes), [calculatedQuotes]);
  const rankedCalculatedQuotes = rankInfo.quotes;
  const bestAmount = rankInfo.bestFinalAmount;

  function updateQuote(id, patch) {
    setQuotes((current) =>
      current.map((quote) => {
        if (quote.id !== id) {
          return quote;
        }

        const shouldUpdateEditedAt = Object.prototype.hasOwnProperty.call(patch, "rate");

        return {
          ...quote,
          ...patch,
          lastRateEditedAt: shouldUpdateEditedAt ? Date.now() : quote.lastRateEditedAt,
        };
      }),
    );
  }

  function addQuote() {
    setQuotes((current) => {
      if (current.length >= MAX_QUOTES) {
        return current;
      }

      return [...current, makeQuote(current.length)];
    });
  }

  function clearAllData() {
    setAmount("10000");
    setSourceCurrency("HKD");
    setTargetCurrency("CNY");
    setQuotes([makeQuote(0), makeQuote(1)]);
  }

  function clearRouteData() {
    setRouteAmount("10000");
    setDirectRouteQuote(makeRouteQuote());
    setBridgeRouteItems((current) =>
      current.map((bridgeRoute) => ({
        ...bridgeRoute,
        firstQuote: makeRouteQuote(),
        secondQuote: makeRouteQuote(),
      })),
    );
    setAddBridgeError("");
  }

  function addBridgeRoute() {
    const validationMessage = validateBridgeCurrency({
      sourceCurrency: routeSourceCurrency,
      targetCurrency: routeTargetCurrency,
      bridgeCurrency: pendingBridgeCurrency,
      existingBridgeCurrencies: bridgeRouteItems.map((bridgeRoute) => bridgeRoute.bridgeCurrency),
    });

    if (validationMessage) {
      setAddBridgeError(validationMessage);
      return;
    }

    setBridgeRouteItems((current) => [...current, makeBridgeRoute(pendingBridgeCurrency)]);
    setAddBridgeError("");
  }

  function removeBridgeRoute(id) {
    setBridgeRouteItems((current) => current.filter((bridgeRoute) => bridgeRoute.id !== id));
    setAddBridgeError("");
  }

  function updateBridgeRouteQuote(id, quoteKey, patch) {
    setBridgeRouteItems((current) =>
      current.map((bridgeRoute) => {
        if (bridgeRoute.id !== id) {
          return bridgeRoute;
        }

        const currentQuote = bridgeRoute[quoteKey];

        return {
          ...bridgeRoute,
          [quoteKey]: {
            ...currentQuote,
            ...patch,
            lastRateEditedAt: Object.prototype.hasOwnProperty.call(patch, "rate")
              ? Date.now()
              : currentQuote.lastRateEditedAt,
          },
        };
      }),
    );
  }

  function getProviderQuoteSetter(groupKey) {
    if (groupKey === "direct") {
      return setDirectProviderQuotes;
    }

    if (groupKey === "first") {
      return setBridgeFirstProviderQuotes;
    }

    return setBridgeSecondProviderQuotes;
  }

  function addProviderQuote(groupKey) {
    getProviderQuoteSetter(groupKey)((current) => [...current, makeProviderQuote()]);
  }

  function updateProviderQuote(groupKey, id, patch) {
    getProviderQuoteSetter(groupKey)((current) =>
      current.map((quote) => {
        if (quote.id !== id) {
          return quote;
        }

        return {
          ...quote,
          ...patch,
          lastRateEditedAt: Object.prototype.hasOwnProperty.call(patch, "rate")
            ? Date.now()
            : quote.lastRateEditedAt,
        };
      }),
    );
  }

  function removeProviderQuote(groupKey, id) {
    getProviderQuoteSetter(groupKey)((current) => {
      const nextQuotes = current.filter((quote) => quote.id !== id);
      return nextQuotes.length ? nextQuotes : [makeProviderQuote()];
    });
  }

  function clearProviderInputs() {
    setProviderAmount("10000");
    setDirectProviderQuotes([makeProviderQuote("銀行 A"), makeProviderQuote("銀行 B")]);
    setBridgeFirstProviderQuotes([makeProviderQuote("銀行 C")]);
    setBridgeSecondProviderQuotes([makeProviderQuote("銀行 D")]);
  }

  function viewProviderResult() {
    providerResultSummaryRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <main className="min-h-screen bg-gray-50 text-slate-900">
      <div className="relative mx-auto min-h-screen w-full max-w-md bg-white pb-10 shadow-sm">
        <MobileExchangeApp
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          amount={amount}
          setAmount={setAmount}
          amountError={amountError}
          sourceCurrency={sourceCurrency}
          setSourceCurrency={setSourceCurrency}
          targetCurrency={targetCurrency}
          setTargetCurrency={setTargetCurrency}
          quotes={quotes}
          calculatedQuotes={rankedCalculatedQuotes}
          bestAmount={bestAmount}
          updateQuote={updateQuote}
          addQuote={addQuote}
          clearAllData={clearAllData}
          rankInfo={rankInfo}
          routePanel={
            <>
              <div className="bg-gray-50 px-4 pb-2 pt-3">
                <div className="grid grid-cols-2 rounded-xl bg-slate-200/60 p-1 text-xs font-black">
                  <button
                    type="button"
                    onClick={() => setRouteMode("custom")}
                    className={`rounded-lg px-2 py-2 text-left transition-all duration-200 ${
                      routeMode === "custom" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <span className="block text-center">{t("customBridge")}</span>
                    <span className="mt-0.5 block text-center text-[10px] font-bold opacity-70">{t("customBridgeSubtitle")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteMode("provider")}
                    className={`rounded-lg px-2 py-2 text-left transition-all duration-200 ${
                      routeMode === "provider" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <span className="block text-center">{t("providerCombination")}</span>
                    <span className="mt-0.5 block text-center text-[10px] font-bold opacity-70">{t("providerCombinationSubtitle")}</span>
                  </button>
                </div>
              </div>
              {routeMode === "custom" ? (
                <ThreeCurrencyRouteApp
                  amount={routeAmount}
                  setAmount={setRouteAmount}
                  amountError={routeAmountError}
                  sourceCurrency={routeSourceCurrency}
                  setSourceCurrency={setRouteSourceCurrency}
                  targetCurrency={routeTargetCurrency}
                  setTargetCurrency={setRouteTargetCurrency}
                  directQuote={directRouteQuote}
                  routeResult={routeResult}
                  bridgeRoutes={bridgeRouteItems}
                  pendingBridgeCurrency={pendingBridgeCurrency}
                  setPendingBridgeCurrency={setPendingBridgeCurrency}
                  addBridgeRoute={addBridgeRoute}
                  addBridgeError={addBridgeError}
                  removeBridgeRoute={removeBridgeRoute}
                  validationError={routeValidationError}
                  clearRouteData={clearRouteData}
                  updateDirectQuote={(patch) => updateRouteQuoteState(setDirectRouteQuote, patch)}
                  updateBridgeRouteQuote={updateBridgeRouteQuote}
                />
              ) : (
                <ProviderCombinationApp
                  amount={providerAmount}
                  setAmount={setProviderAmount}
                  amountError={providerAmountError}
                  sourceCurrency={providerSourceCurrency}
                  setSourceCurrency={setProviderSourceCurrency}
                  targetCurrency={providerTargetCurrency}
                  setTargetCurrency={setProviderTargetCurrency}
                  bridgeCurrency={providerBridgeCurrency}
                  setBridgeCurrency={setProviderBridgeCurrency}
                  directQuotes={directProviderQuotes}
                  bridgeFirstQuotes={bridgeFirstProviderQuotes}
                  bridgeSecondQuotes={bridgeSecondProviderQuotes}
                  directGroup={directProviderGroup}
                  bridgeCombination={bridgeProviderCombination}
                  recommendation={providerRecommendation}
                  invalidCurrencyMessage={providerCurrencyMessage}
                  invalidCurrencyCombination={invalidProviderCurrencyCombination}
                  resultSummaryRef={providerResultSummaryRef}
                  updateProviderQuote={updateProviderQuote}
                  addProviderQuote={addProviderQuote}
                  removeProviderQuote={removeProviderQuote}
                  clearProviderInputs={clearProviderInputs}
                  viewProviderResult={viewProviderResult}
                />
              )}
            </>
          }
          debugPanel={null}
        />
        <footer className="px-4 py-4 pb-6 text-center text-xs font-medium text-gray-400">
          {t("footerCredit")}
        </footer>
      </div>
    </main>
  );
}
