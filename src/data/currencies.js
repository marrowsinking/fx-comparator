export const currencies = [
  { code: "HKD", nameZh: "港幣", nameEn: "Hong Kong Dollar", symbol: "HK$", decimalPlaces: 2, region: "Hong Kong" },
  { code: "CNY", nameZh: "人民幣", nameEn: "Chinese Yuan", symbol: "¥", decimalPlaces: 2, region: "China" },
  { code: "MOP", nameZh: "澳門幣", nameEn: "Macanese Pataca", symbol: "MOP$", decimalPlaces: 2, region: "Macau" },
  { code: "USD", nameZh: "美元", nameEn: "US Dollar", symbol: "$", decimalPlaces: 2, region: "United States" },
  { code: "EUR", nameZh: "歐元", nameEn: "Euro", symbol: "€", decimalPlaces: 2, region: "Eurozone" },
  { code: "GBP", nameZh: "英鎊", nameEn: "British Pound", symbol: "£", decimalPlaces: 2, region: "United Kingdom" },
  { code: "JPY", nameZh: "日圓", nameEn: "Japanese Yen", symbol: "¥", decimalPlaces: 0, region: "Japan" },
  { code: "KRW", nameZh: "韓圜", nameEn: "South Korean Won", symbol: "₩", decimalPlaces: 0, region: "South Korea" },
  { code: "SGD", nameZh: "新加坡元", nameEn: "Singapore Dollar", symbol: "S$", decimalPlaces: 2, region: "Singapore" },
  { code: "TWD", nameZh: "新台幣", nameEn: "New Taiwan Dollar", symbol: "NT$", decimalPlaces: 2, region: "Taiwan" },
  { code: "THB", nameZh: "泰銖", nameEn: "Thai Baht", symbol: "฿", decimalPlaces: 2, region: "Thailand" },
  { code: "MYR", nameZh: "馬來西亞令吉", nameEn: "Malaysian Ringgit", symbol: "RM", decimalPlaces: 2, region: "Malaysia" },
  { code: "AUD", nameZh: "澳元", nameEn: "Australian Dollar", symbol: "A$", decimalPlaces: 2, region: "Australia" },
  { code: "CAD", nameZh: "加拿大元", nameEn: "Canadian Dollar", symbol: "C$", decimalPlaces: 2, region: "Canada" },
];

export const currencyMap = Object.fromEntries(
  currencies.map((currency) => [currency.code, currency]),
);

export const fallbackReferenceRates = {
  HKD_CNY: 0.86,
  CNY_HKD: 1.16,
  HKD_MOP: 1.03,
  MOP_HKD: 0.97,
  CNY_MOP: 1.16,
  MOP_CNY: 0.86,
  USD_HKD: 7.8,
  HKD_USD: 0.128,
  USD_CNY: 7.2,
  CNY_USD: 0.139,
  USD_MOP: 8.0,
  MOP_USD: 0.125,
  EUR_USD: 1.08,
  USD_EUR: 0.93,
  GBP_USD: 1.27,
  USD_GBP: 0.79,
  JPY_HKD: 0.05,
  HKD_JPY: 20,
  KRW_HKD: 0.0056,
  HKD_KRW: 178,
  SGD_HKD: 5.8,
  HKD_SGD: 0.17,
  TWD_HKD: 0.24,
  HKD_TWD: 4.15,
  THB_HKD: 0.22,
  HKD_THB: 4.55,
  MYR_HKD: 1.65,
  HKD_MYR: 0.61,
  AUD_HKD: 5.1,
  HKD_AUD: 0.196,
  CAD_HKD: 5.7,
  HKD_CAD: 0.175,
};

export function getCurrency(code) {
  return currencyMap[code] || {
    code,
    nameZh: code,
    nameEn: code,
    symbol: code,
    decimalPlaces: 2,
    region: "",
  };
}

export function getCurrencySelectLabel(code, language = "zh-TW") {
  const currency = getCurrency(code);
  return `${currency.code} ${language === "en" ? currency.nameEn : currency.nameZh}`;
}

export function searchCurrencies(query) {
  const keyword = String(query || "").trim().toLowerCase();

  if (!keyword) {
    return currencies;
  }

  return currencies.filter((currency) => {
    const searchableText = [
      currency.code,
      currency.nameZh,
      currency.nameEn,
      currency.region,
    ].join(" ").toLowerCase();

    return searchableText.includes(keyword);
  });
}

export function getReferenceRate(sourceCurrency, targetCurrency) {
  if (sourceCurrency === targetCurrency) {
    return 1;
  }

  const pairKey = `${sourceCurrency}_${targetCurrency}`;
  return Number.isFinite(fallbackReferenceRates[pairKey])
    ? fallbackReferenceRates[pairKey]
    : null;
}

export function formatCurrencyAmount(value, currencyCode) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const currency = getCurrency(currencyCode);

  return new Intl.NumberFormat("zh-Hant", {
    minimumFractionDigits: currency.decimalPlaces,
    maximumFractionDigits: currency.decimalPlaces,
  }).format(value);
}

export function moneyWithCurrencySymbol(value, currencyCode) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${currencyCode} ${formatCurrencyAmount(value, currencyCode)}`;
}
