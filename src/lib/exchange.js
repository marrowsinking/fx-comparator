import {
  EPSILON_AMOUNT,
  buildQuoteCandidates,
  calculateBridgeRoute,
  calculateBestBridgeCombination,
  calculateFee,
  calculateMultiBridgeRoutes,
  calculateQuoteGroup,
  calculateDirectRoute,
  calculateFinalAmount as calculateFinalAmountWithFeeConfig,
  calculateNormalizedRate,
  calculateRateDeviation,
  calculateRouteStep,
  compareDirectAndBridge,
  detectQuoteFormat,
  isSameAmountWithinTolerance,
  rankQuotes,
  toNumber,
  validateBridgeCurrency,
  validateCurrencyCombination,
} from "../utils/exchangeCore.js";
import {
  fallbackReferenceRates,
  getReferenceRate as getFallbackReferenceRateValue,
} from "../data/currencies.js";

export const RATE_FORMATS = [
  {
    value: "auto",
    label: "自動判斷",
  },
  {
    value: "source100_to_target",
    label: "100 現持有貨幣（賣出）可換 輸入匯率報價 想兌換成的貨幣（買入）",
  },
  {
    value: "source1_to_target",
    label: "1 現持有貨幣（賣出）可換 輸入匯率報價 想兌換成的貨幣（買入）",
  },
  {
    value: "target100_to_source",
    label: "100 想兌換成的貨幣（買入）需要 輸入匯率報價 現持有貨幣（賣出）",
  },
  {
    value: "target1_to_source",
    label: "1 想兌換成的貨幣（買入）需要 輸入匯率報價 現持有貨幣（賣出）",
  },
];

export {
  EPSILON_AMOUNT,
  buildQuoteCandidates,
  calculateBridgeRoute,
  calculateBestBridgeCombination,
  calculateFee,
  calculateMultiBridgeRoutes,
  calculateQuoteGroup,
  calculateDirectRoute,
  calculateFinalAmountWithFeeConfig,
  calculateNormalizedRate,
  calculateRateDeviation,
  calculateRouteStep,
  compareDirectAndBridge,
  detectQuoteFormat,
  isSameAmountWithinTolerance,
  rankQuotes,
  toNumber,
  validateBridgeCurrency,
  validateCurrencyCombination,
};

export const normalizeRate = calculateNormalizedRate;

export function calculateFinalAmount(inputAmount, normalizedRate, feePercent) {
  const result = calculateFinalAmountWithFeeConfig(inputAmount, normalizedRate, {
    type: "percent",
    percent: feePercent || 0,
    feeCurrencyMode: "source",
  });

  return result.finalAmount;
}

export function getFallbackReferenceRate(sourceCurrency, targetCurrency) {
  if (sourceCurrency === targetCurrency) {
    return {
      rate: 1,
      source: "fallback_same_currency",
    };
  }

  const rate = getFallbackReferenceRateValue(sourceCurrency, targetCurrency);

  if (Number.isFinite(rate)) {
    return {
      rate,
      source: Number.isFinite(fallbackReferenceRates[`${sourceCurrency}_${targetCurrency}`])
        ? "fallback_pair"
        : "fallback_same_currency",
    };
  }

  return {
    rate: null,
    source: "unavailable",
  };
}

export async function getReferenceRate(sourceCurrency, targetCurrency) {
  return getFallbackReferenceRate(sourceCurrency, targetCurrency);
}

export function formatMoney(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("zh-Hant", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value.toFixed(2)}%`;
}
