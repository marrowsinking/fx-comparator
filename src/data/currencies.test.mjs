import {
  currencies,
  currencyMap,
  fallbackReferenceRates,
  formatCurrencyAmount,
  getReferenceRate,
  searchCurrencies,
} from "./currencies.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(currencies.length === 14, `應有 14 種貨幣，現在是 ${currencies.length}`);
assert(currencyMap.JPY.decimalPlaces === 0, "JPY 應顯示 0 位小數");
assert(currencyMap.KRW.decimalPlaces === 0, "KRW 應顯示 0 位小數");
assert(fallbackReferenceRates.HKD_CNY === 0.86, "HKD_CNY fallback 應為 0.86");
assert(getReferenceRate("HKD", "JPY") === 20, "HKD_JPY referenceRate 應為 20");
assert(getReferenceRate("JPY", "HKD") === 0.05, "JPY_HKD referenceRate 應為 0.05");
assert(getReferenceRate("EUR", "KRW") === null, "缺少 fallback 的貨幣對應返回 null");
assert(formatCurrencyAmount(8645.4, "JPY") === "8,645", "JPY 金額應為 0 位小數");
assert(formatCurrencyAmount(8645.4, "CNY") === "8,645.40", "CNY 金額應為 2 位小數");
assert(searchCurrencies("hkd")[0].code === "HKD", "搜尋 hkd 應找到 HKD");
assert(searchCurrencies("港").some((currency) => currency.code === "HKD"), "搜尋港應找到 HKD");
assert(searchCurrencies("United").some((currency) => currency.code === "USD"), "搜尋 United 應找到 USD");
assert(searchCurrencies("不存在").length === 0, "無匹配時應返回空陣列");

console.log("currency data tests passed");
