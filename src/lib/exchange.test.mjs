import {
  calculateFinalAmountWithFeeConfig,
  detectQuoteFormat,
  formatMoney,
  getFallbackReferenceRate,
  isSameAmountWithinTolerance,
} from "./exchange.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sourceCurrency = "HKD";
const targetCurrency = "CNY";
const amount = 10000;
const referenceRate = getFallbackReferenceRate(sourceCurrency, targetCurrency).rate;

const quoteA = detectQuoteFormat("1.1684", sourceCurrency, targetCurrency, referenceRate);
const quoteB = detectQuoteFormat("116.84", sourceCurrency, targetCurrency, referenceRate);

assert(quoteA.format === "target1_to_source", `報價 A 判斷錯誤：${quoteA.format}`);
assert(quoteB.format === "target100_to_source", `報價 B 判斷錯誤：${quoteB.format}`);

const resultA = calculateFinalAmountWithFeeConfig(amount, quoteA.normalizedRate, { type: "none" });
const resultB = calculateFinalAmountWithFeeConfig(amount, quoteB.normalizedRate, { type: "none" });
const bestAmount = Math.max(resultA.finalAmount, resultB.finalAmount);

assert(formatMoney(resultA.finalAmount) === "8,558.71", `報價 A 金額錯誤：${formatMoney(resultA.finalAmount)}`);
assert(formatMoney(resultB.finalAmount) === "8,558.71", `報價 B 金額錯誤：${formatMoney(resultB.finalAmount)}`);
assert(isSameAmountWithinTolerance(resultA.finalAmount, bestAmount), "報價 A 應該視為並列最佳");
assert(isSameAmountWithinTolerance(resultB.finalAmount, bestAmount), "報價 B 應該視為並列最佳");

console.log("exchange tests passed");
