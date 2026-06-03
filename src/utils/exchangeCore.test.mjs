import {
  EPSILON_AMOUNT,
  buildQuoteCandidates,
  calculateBridgeRoute,
  calculateDirectRoute,
  calculateFee,
  calculateFinalAmount,
  calculateBestBridgeCombination,
  calculateMultiBridgeRoutes,
  calculateQuoteGroup,
  calculateRouteStep,
  compareDirectAndBridge,
  detectQuoteFormat,
  rankQuotes,
  validateBridgeCurrency,
  validateCurrencyCombination,
} from "./exchangeCore.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual, expected, message, epsilon = 0.000001) {
  assert(Math.abs(actual - expected) < epsilon, `${message}：expected ${expected}, got ${actual}`);
}

function assertThrows(fn, expectedMessage, message) {
  try {
    fn();
  } catch (error) {
    assert(
      error.message.includes(expectedMessage),
      `${message}：expected message includes ${expectedMessage}, got ${error.message}`,
    );
    return;
  }

  throw new Error(`${message}：expected function to throw`);
}

const sourceCurrency = "HKD";
const targetCurrency = "CNY";
const referenceRate = 0.86;
const amount = 10000;
const noFee = { type: "none", feeCurrencyMode: "source" };

const scenarios = [
  {
    inputRate: 86.45,
    expectedFormat: "source100_to_target",
    expectedNormalizedRate: 0.8645,
    expectedFinalAmount: 8645,
  },
  {
    inputRate: 0.8645,
    expectedFormat: "source1_to_target",
    expectedNormalizedRate: 0.8645,
    expectedFinalAmount: 8645,
  },
  {
    inputRate: 116.84,
    expectedFormat: "target100_to_source",
    expectedNormalizedRate: 100 / 116.84,
    expectedFinalAmount: 8558.712769599452,
  },
  {
    inputRate: 1.1684,
    expectedFormat: "target1_to_source",
    expectedNormalizedRate: 1 / 1.1684,
    expectedFinalAmount: 8558.712769599452,
  },
];

for (const scenario of scenarios) {
  const candidates = buildQuoteCandidates(scenario.inputRate, sourceCurrency, targetCurrency);
  assert(candidates.length === 4, `應建立四種候選格式：${scenario.inputRate}`);

  const detection = detectQuoteFormat(
    scenario.inputRate,
    sourceCurrency,
    targetCurrency,
    referenceRate,
  );
  assert(detection.format === scenario.expectedFormat, `格式判斷錯誤：${scenario.inputRate}`);
  assert(detection.confidence === "high_confidence", `信心等級錯誤：${scenario.inputRate}`);
  assert(detection.shouldCalculate === true, `應可自動計算：${scenario.inputRate}`);
  assertClose(detection.normalizedRate, scenario.expectedNormalizedRate, `normalizedRate 錯誤：${scenario.inputRate}`);

  const result = calculateFinalAmount(amount, detection.normalizedRate, noFee);
  assertClose(result.finalAmount, scenario.expectedFinalAmount, `finalAmount 錯誤：${scenario.inputRate}`);
}

const uncertainDetection = detectQuoteFormat(500, sourceCurrency, targetCurrency, referenceRate);
assert(uncertainDetection.confidence === "need_manual", "偏離參考匯率太多時應要求手動確認");
assert(uncertainDetection.shouldCalculate === false, "need_manual 不應自動計算");

const hkdToJpyDetection = detectQuoteFormat(2000, "HKD", "JPY", 20);
assert(hkdToJpyDetection.format === "source100_to_target", `HKD → JPY 2000 格式錯誤：${hkdToJpyDetection.format}`);
assertClose(hkdToJpyDetection.normalizedRate, 20, "HKD → JPY normalizedRate 錯誤");

const jpyToHkdDetection = detectQuoteFormat(5, "JPY", "HKD", 0.05);
assert(jpyToHkdDetection.format === "source100_to_target", `JPY → HKD 5 格式錯誤：${jpyToHkdDetection.format}`);
assertClose(jpyToHkdDetection.normalizedRate, 0.05, "JPY → HKD normalizedRate 錯誤");

const missingReferenceDetection = detectQuoteFormat(123, "EUR", "KRW", null);
assert(missingReferenceDetection.confidence === "need_manual", "缺少 referenceRate 時應進入 need_manual");
assert(missingReferenceDetection.shouldCalculate === false, "缺少 referenceRate 時不應自動計算");

const equivalentA = detectQuoteFormat(116.84, sourceCurrency, targetCurrency, referenceRate);
const equivalentB = detectQuoteFormat(1.1684, sourceCurrency, targetCurrency, referenceRate);
const ranked = rankQuotes([
  {
    id: "quote-a",
    inputRate: 116.84,
    finalAmount: calculateFinalAmount(amount, equivalentA.normalizedRate, noFee).finalAmount,
    confidence: equivalentA.confidence,
    shouldCalculate: equivalentA.shouldCalculate,
  },
  {
    id: "quote-b",
    inputRate: 1.1684,
    finalAmount: calculateFinalAmount(amount, equivalentB.normalizedRate, noFee).finalAmount,
    confidence: equivalentB.confidence,
    shouldCalculate: equivalentB.shouldCalculate,
  },
  {
    id: "manual-needed",
    inputRate: 500,
    finalAmount: null,
    confidence: "need_manual",
    shouldCalculate: false,
  },
]);

const rankedA = ranked.quotes.find((quote) => quote.id === "quote-a");
const rankedB = ranked.quotes.find((quote) => quote.id === "quote-b");
const manualNeeded = ranked.quotes.find((quote) => quote.id === "manual-needed");

assert(rankedA.isJointBest === true, "116.84 應顯示並列最佳");
assert(rankedB.isJointBest === true, "1.1684 應顯示並列最佳");
assert(rankedA.differenceAmount === 0, "並列最佳不應顯示少 0.00");
assert(rankedB.differenceAmount === 0, "並列最佳不應顯示少 0.00");
assert(manualNeeded.participatesInRanking === false, "need_manual 不應參與排名");

const directBetterRoute = calculateDirectRoute({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  quote: {
    inputRate: 1.16,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.16,
  },
});
const bridgeWorseRoute = calculateBridgeRoute({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuote: {
    inputRate: 1.08,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.16,
  },
  secondQuote: {
    inputRate: 1.03,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.03,
  },
});

assert(directBetterRoute.isValid === true, "直接兌換應有效");
assert(bridgeWorseRoute.isValid === true, "中轉兌換應有效");
assertClose(directBetterRoute.finalAmount, 11600, "直接兌換結果錯誤");
assertClose(bridgeWorseRoute.finalAmount, 11124, "中轉兌換結果錯誤");
assert(directBetterRoute.finalAmount > bridgeWorseRoute.finalAmount, "測試 1 應直接兌換較好");

const directWorseRoute = calculateDirectRoute({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  quote: {
    inputRate: 1.15,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.16,
  },
});
const bridgeBetterRoute = calculateBridgeRoute({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuote: {
    inputRate: 1.12,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.16,
  },
  secondQuote: {
    inputRate: 1.03,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.03,
  },
});

assertClose(directWorseRoute.finalAmount, 11500, "直接兌換較差案例結果錯誤");
assertClose(bridgeBetterRoute.finalAmount, 11536, "中轉較好案例結果錯誤");
assert(bridgeBetterRoute.finalAmount > directWorseRoute.finalAmount, "測試 2 應中轉兌換較好");

const tieDirectRoute = calculateDirectRoute({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  quote: {
    inputRate: 1.16,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.16,
  },
});
const tieBridgeRoute = calculateBridgeRoute({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuote: {
    inputRate: 1.126213592,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.16,
  },
  secondQuote: {
    inputRate: 1.03,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.03,
  },
});

assert(Math.abs(tieDirectRoute.finalAmount - tieBridgeRoute.finalAmount) < EPSILON_AMOUNT, "測試 3 應視為並列最佳");

const incompleteBridgeRoute = calculateBridgeRoute({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuote: {
    inputRate: 1.08,
    selectedFormat: "source1_to_target",
    feeConfig: noFee,
    referenceRate: 1.16,
  },
  secondQuote: {
    inputRate: "",
    selectedFormat: "auto",
    feeConfig: noFee,
    referenceRate: 1.03,
  },
});

assert(incompleteBridgeRoute.isValid === false, "第二段未輸入時中轉不應參與比較");
assert(incompleteBridgeRoute.invalidStep === "second", "第二段未輸入應定位到 second");

const needManualStep = calculateRouteStep({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "HKD",
  inputRate: 999,
  selectedFormat: "auto",
  feeConfig: noFee,
  referenceRate: 1.16,
});

assert(needManualStep.isValid === false, "need_manual 段落不應有效");
assert(needManualStep.confidence === "need_manual", "報價格式需確認時應返回 need_manual");

assertThrows(
  () => calculateFee(10000, { type: "percent_max", percent: 1, max: 0 }),
  "請輸入封頂金額",
  "percent_max max=0 時不應計算",
);

assertThrows(
  () => calculateFee(10000, { type: "percent_min_max", percent: 1, min: 10, max: 0 }),
  "請輸入封頂金額",
  "percent_min_max max=0 時不應計算",
);

const cappedFee = calculateFee(10000, { type: "percent_max", percent: 5, max: 300 });
assertClose(cappedFee, 300, "percent_max max=300 時應正常封頂");

const invalidFeeStep = calculateRouteStep({
  amount: 10000,
  sourceCurrency: "HKD",
  targetCurrency: "CNY",
  inputRate: 0.86,
  selectedFormat: "source1_to_target",
  feeConfig: { type: "percent_max", percent: 1, max: 0, feeCurrencyMode: "source" },
  referenceRate: 0.86,
});

assert(invalidFeeStep.isValid === false, "請補充手續費資料時 RouteStep 不應有效");
assert(invalidFeeStep.explanationText.includes("請補充手續費資料"), "請補充手續費資料時應給出明確提示");

const multiDirectBest = calculateMultiBridgeRoutes({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  directQuote: { inputRate: 1.16, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  bridgeRoutes: [
    {
      id: "hkd",
      bridgeCurrency: "HKD",
      firstQuote: { inputRate: 1.08, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
      secondQuote: { inputRate: 1.03, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.03 },
    },
  ],
});

assert(multiDirectBest.bestRoutes[0].type === "direct", "案例 1 應直接兌換最佳");
assertClose(multiDirectBest.bestRoutes[0].finalAmount, 11600, "多路徑直接最佳金額錯誤");

const multiHkdBest = calculateMultiBridgeRoutes({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  directQuote: { inputRate: 1.15, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  bridgeRoutes: [
    {
      id: "hkd",
      bridgeCurrency: "HKD",
      firstQuote: { inputRate: 1.12, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
      secondQuote: { inputRate: 1.03, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.03 },
    },
    {
      id: "usd",
      bridgeCurrency: "USD",
      firstQuote: { inputRate: 0.139, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 0.139 },
      secondQuote: { inputRate: 8.0, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 8.0 },
    },
  ],
});

assert(multiHkdBest.bestRoutes[0].bridgeCurrency === "HKD", "案例 2 應 HKD 中轉最佳");
assertClose(multiHkdBest.bestRoutes[0].finalAmount, 11536, "HKD 中轉最佳金額錯誤");

const multiUsdBest = calculateMultiBridgeRoutes({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  directQuote: { inputRate: 1.15, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  bridgeRoutes: [
    {
      id: "hkd",
      bridgeCurrency: "HKD",
      firstQuote: { inputRate: 1.10, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
      secondQuote: { inputRate: 1.03, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.03 },
    },
    {
      id: "usd",
      bridgeCurrency: "USD",
      firstQuote: { inputRate: 0.145, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 0.139 },
      secondQuote: { inputRate: 8.1, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 8.0 },
    },
  ],
});

assert(multiUsdBest.bestRoutes[0].bridgeCurrency === "USD", "案例 3 應 USD 中轉最佳");
assertClose(multiUsdBest.bestRoutes[0].finalAmount, 11745, "USD 中轉最佳金額錯誤");

const multiIncompleteBridge = calculateMultiBridgeRoutes({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  directQuote: { inputRate: 1.15, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  bridgeRoutes: [
    {
      id: "hkd",
      bridgeCurrency: "HKD",
      firstQuote: { inputRate: 1.12, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
      secondQuote: { inputRate: "", selectedFormat: "auto", feeConfig: noFee, referenceRate: 1.03 },
    },
  ],
});
const incompleteHkdRoute = multiIncompleteBridge.routes.find((route) => route.id === "hkd");

assert(incompleteHkdRoute.isValid === false, "案例 4 缺第二段時不應參與比較");
assert(incompleteHkdRoute.status === "待完成", "案例 4 缺第二段應顯示待完成");
assert(multiIncompleteBridge.bestRoutes[0].type === "direct", "案例 4 只有直接方案有效時直接應是最佳");

const duplicateBridgeValidation = validateBridgeCurrency({
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  bridgeCurrency: "HKD",
  existingBridgeCurrencies: ["HKD"],
});

assert(duplicateBridgeValidation === "該中轉幣種已存在", "案例 5 重複加入 HKD 應提示已存在");

const providerDirectBestGroup = calculateQuoteGroup({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  quotes: [
    { id: "bank-a", providerName: "銀行 A", inputRate: 1.15, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
    { id: "bank-b", providerName: "銀行 B", inputRate: 1.16, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  ],
});

assert(providerDirectBestGroup.bestQuotes[0].providerName === "銀行 B", "商家報價案例 1 應銀行 B 直接最佳");
assertClose(providerDirectBestGroup.bestQuotes[0].finalAmount, 11600, "商家報價案例 1 直接最佳金額錯誤");

const providerBridgeCase1 = calculateBestBridgeCombination({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuotes: [
    { id: "bank-c", providerName: "銀行 C", inputRate: 1.12, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  ],
  secondQuotes: [
    { id: "bank-d", providerName: "銀行 D", inputRate: 1.03, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.03 },
  ],
});
const providerComparisonCase1 = compareDirectAndBridge({
  directBestResult: providerDirectBestGroup.bestQuotes[0],
  bridgeBestResult: providerBridgeCase1,
});

assert(providerComparisonCase1.recommendationType === "direct", "商家報價案例 1 應建議直接兌換");
assert(providerComparisonCase1.suggestionText.includes("銀行 B"), "商家報價案例 1 建議應顯示銀行 B");
assertClose(providerComparisonCase1.differenceAmount, 64, "商家報價案例 1 直接應比中轉多 64 MOP");

const providerDirectCase2 = calculateQuoteGroup({
  amount: 10000,
  sourceCurrency: "CNY",
  targetCurrency: "MOP",
  quotes: [
    { id: "bank-a", providerName: "銀行 A", inputRate: 1.15, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
    { id: "bank-b", providerName: "銀行 B", inputRate: 1.155, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  ],
});
const providerBridgeCase2 = calculateBestBridgeCombination({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuotes: [
    { id: "bank-c", providerName: "銀行 C", inputRate: 1.12, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
    { id: "bank-d", providerName: "銀行 D", inputRate: 1.11, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  ],
  secondQuotes: [
    { id: "bank-e", providerName: "銀行 E", inputRate: 1.0315, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.03 },
    { id: "bank-f", providerName: "銀行 F", inputRate: 1.029, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.03 },
  ],
});
const providerComparisonCase2 = compareDirectAndBridge({
  directBestResult: providerDirectCase2.bestQuotes[0],
  bridgeBestResult: providerBridgeCase2,
});

assert(providerBridgeCase2.bestFirstQuote.providerName === "銀行 C", "商家報價案例 2 第一段應銀行 C 最佳");
assert(providerBridgeCase2.bestSecondQuote.providerName === "銀行 E", "商家報價案例 2 第二段應銀行 E 最佳");
assertClose(providerBridgeCase2.finalAmount, 11552.8, "商家報價案例 2 中轉金額錯誤");
assert(providerComparisonCase2.recommendationType === "bridge", "商家報價案例 2 應建議中轉兌換");
assert(providerComparisonCase2.strength === "tiny", "商家報價案例 2 差距應為 tiny");
assert(providerComparisonCase2.suggestionText.includes("差距很小"), "商家報價案例 2 應提示差距很小");

const hkdMopGroup = calculateQuoteGroup({
  amount: 10000,
  sourceCurrency: "HKD",
  targetCurrency: "MOP",
  quotes: [
    { id: "bank-a", providerName: "銀行 A", inputRate: 1.0315, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.03 },
    { id: "bank-b", providerName: "銀行 B", inputRate: 1.029, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.03 },
  ],
});

assert(hkdMopGroup.bestQuotes[0].providerName === "銀行 A", "商家報價案例 3 HKD → MOP 應銀行 A 最佳");

const providerBridgeFeeCase = calculateBestBridgeCombination({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuotes: [
    { id: "bank-c", providerName: "銀行 C", inputRate: 1.12, selectedFormat: "source1_to_target", feeConfig: { type: "fixed", fixed: 20, feeCurrencyMode: "source" }, referenceRate: 1.16 },
  ],
  secondQuotes: [
    { id: "bank-e", providerName: "銀行 E", inputRate: 1.0315, selectedFormat: "source1_to_target", feeConfig: { type: "fixed", fixed: 10, feeCurrencyMode: "source" }, referenceRate: 1.03 },
  ],
});

assertClose(providerBridgeFeeCase.intermediateAmount, 11177.6, "商家報價案例 4 第一段固定費扣除錯誤");
assertClose(providerBridgeFeeCase.finalAmount, 11519.3794, "商家報價案例 4 第二段固定費逐段扣除錯誤");

const providerBridgeInsufficient = calculateBestBridgeCombination({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuotes: [
    { id: "bank-c", providerName: "銀行 C", inputRate: 1.12, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  ],
  secondQuotes: [
    { id: "bank-empty", providerName: "銀行 E", inputRate: "", selectedFormat: "auto", feeConfig: noFee, referenceRate: 1.03 },
  ],
});
const providerInsufficientComparison = compareDirectAndBridge({
  directBestResult: null,
  bridgeBestResult: providerBridgeInsufficient,
});

assert(providerBridgeInsufficient.isValid === false, "商家報價案例 5 第二段未輸入時中轉組合無效");
assert(providerBridgeInsufficient.reason === providerBridgeInsufficient.message, "商家報價案例 5 reason 應與 message 一致");
assert(providerInsufficientComparison.recommendationType === "insufficient_data", "商家報價案例 5 應資料不足");
assert(providerInsufficientComparison.suggestionText.includes("請補充第二段 HKD → MOP 報價"), "商家報價案例 5 應提示補充第二段");

const providerBridgeFeeInvalid = calculateBestBridgeCombination({
  amount: 10000,
  sourceCurrency: "CNY",
  bridgeCurrency: "HKD",
  targetCurrency: "MOP",
  firstQuotes: [
    { id: "bank-c", providerName: "銀行 C", inputRate: 1.12, selectedFormat: "source1_to_target", feeConfig: noFee, referenceRate: 1.16 },
  ],
  secondQuotes: [
    { id: "bank-e", providerName: "銀行 E", inputRate: 1.03, selectedFormat: "source1_to_target", feeConfig: { type: "percent_max", percent: 1, max: 0, feeCurrencyMode: "source" }, referenceRate: 1.03 },
  ],
});

assert(providerBridgeFeeInvalid.isValid === false, "第二段手續費不完整時中轉組合應無效");
assert(providerBridgeFeeInvalid.reason === providerBridgeFeeInvalid.message, "請補充手續費資料時 reason 應與 message 一致");
assert(providerBridgeFeeInvalid.reason.includes("請補充手續費資料"), "請補充手續費資料時應保留具體原因");

assert(
  validateCurrencyCombination({
    sourceCurrency: "CNY",
    targetCurrency: "CNY",
    bridgeCurrency: "HKD",
  }) === "匯出幣種和接收幣種不能相同",
  "商家組合貨幣測試 1 應禁止來源和目標相同",
);

assert(
  validateCurrencyCombination({
    sourceCurrency: "CNY",
    targetCurrency: "MOP",
    bridgeCurrency: "CNY",
  }) === "請選擇不同的匯出、接收和中轉幣種",
  "商家組合貨幣測試 2 應禁止中轉等於來源",
);

assert(
  validateCurrencyCombination({
    sourceCurrency: "CNY",
    targetCurrency: "MOP",
    bridgeCurrency: "MOP",
  }) === "請選擇不同的匯出、接收和中轉幣種",
  "商家組合貨幣測試 3 應禁止中轉等於目標",
);

assert(
  validateCurrencyCombination({
    sourceCurrency: "CNY",
    targetCurrency: "CNY",
    bridgeCurrency: "CNY",
  }) === "匯出幣種、接收幣種和中轉幣種不能相同",
  "商家組合貨幣測試 4 應禁止三個貨幣相同",
);

console.log("exchange core tests passed");
