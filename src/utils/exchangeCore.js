export const EPSILON_AMOUNT = 0.01;

export function toNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return NaN;
  }

  return Number(value);
}

export function calculateNormalizedRate(inputRate, selectedFormat) {
  const numericRate = toNumber(inputRate);

  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    throw new Error("匯率必須大於 0");
  }

  switch (selectedFormat) {
    case "source100_to_target":
      return numericRate / 100;
    case "source1_to_target":
      return numericRate;
    case "target100_to_source":
      return 100 / numericRate;
    case "target1_to_source":
      return 1 / numericRate;
    default:
      throw new Error("未知報價格式");
  }
}

export function buildQuoteCandidates(inputRate, sourceCurrency, targetCurrency) {
  const numericRate = toNumber(inputRate);

  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return [];
  }

  return [
    {
      format: "source100_to_target",
      normalizedRate: numericRate / 100,
      description: `100 ${sourceCurrency} 可換 ${numericRate} ${targetCurrency}`,
    },
    {
      format: "source1_to_target",
      normalizedRate: numericRate,
      description: `1 ${sourceCurrency} 可換 ${numericRate} ${targetCurrency}`,
    },
    {
      format: "target100_to_source",
      normalizedRate: 100 / numericRate,
      description: `100 ${targetCurrency} 需要 ${numericRate} ${sourceCurrency}`,
    },
    {
      format: "target1_to_source",
      normalizedRate: 1 / numericRate,
      description: `1 ${targetCurrency} 需要 ${numericRate} ${sourceCurrency}`,
    },
  ];
}

export function calculateRateDeviation(normalizedRate, referenceRate) {
  if (!Number.isFinite(normalizedRate) || !Number.isFinite(referenceRate) || referenceRate <= 0) {
    return null;
  }

  return Math.abs(normalizedRate - referenceRate) / referenceRate;
}

export function detectQuoteFormat(inputRate, sourceCurrency, targetCurrency, referenceRate) {
  const candidates = buildQuoteCandidates(inputRate, sourceCurrency, targetCurrency);

  if (!candidates.length) {
    return {
      format: null,
      normalizedRate: null,
      deviation: null,
      confidence: "need_manual",
      lowConfidence: true,
      shouldCalculate: false,
      participatesInRanking: false,
      reason: "invalid_rate",
      candidates,
    };
  }

  if (!Number.isFinite(referenceRate) || referenceRate <= 0) {
    return {
      ...candidates[0],
      deviation: null,
      confidence: "need_manual",
      lowConfidence: true,
      shouldCalculate: false,
      participatesInRanking: false,
      reason: "missing_reference_rate",
      candidates,
    };
  }

  const scoredCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      deviation: calculateRateDeviation(candidate.normalizedRate, referenceRate),
    }))
    .sort((a, b) => a.deviation - b.deviation);

  const best = scoredCandidates[0];

  if (best.deviation <= 0.08) {
    return {
      ...best,
      confidence: "high_confidence",
      lowConfidence: false,
      shouldCalculate: true,
      participatesInRanking: true,
      reason: "reference_rate",
      referenceRate,
      candidates: scoredCandidates,
    };
  }

  if (best.deviation <= 0.15) {
    return {
      ...best,
      confidence: "low_confidence",
      lowConfidence: true,
      shouldCalculate: true,
      participatesInRanking: true,
      reason: "reference_rate",
      referenceRate,
      candidates: scoredCandidates,
    };
  }

  return {
    ...best,
    confidence: "need_manual",
    lowConfidence: true,
    shouldCalculate: false,
    participatesInRanking: false,
    reason: "reference_rate",
    referenceRate,
    candidates: scoredCandidates,
  };
}

function readFeeValue(value, label) {
  const numericValue = toNumber(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`${label}必須大於或等於 0`);
  }

  return numericValue;
}

function readRequiredPositiveFeeValue(value, label) {
  const numericValue = toNumber(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error(`請補充手續費資料：請輸入${label}`);
  }

  return numericValue;
}

export function calculateFee(amount, feeConfig) {
  const baseAmount = toNumber(amount);
  const config = feeConfig || { type: "none" };
  const type = config.type || "none";

  if (!Number.isFinite(baseAmount) || baseAmount < 0) {
    throw new Error("手續費計算金額必須大於或等於 0");
  }

  if (type === "none") {
    return 0;
  }

  switch (type) {
    case "fixed":
      return readRequiredPositiveFeeValue(config.fixed, "固定費");
    case "percent": {
      const percent = readRequiredPositiveFeeValue(config.percent, "比例");
      return baseAmount * percent / 100;
    }
    case "percent_min": {
      const percent = readRequiredPositiveFeeValue(config.percent, "比例");
      const min = readFeeValue(config.min || 0, "最低收費");
      return Math.max(baseAmount * percent / 100, min);
    }
    case "percent_max": {
      const percent = readRequiredPositiveFeeValue(config.percent, "比例");
      const max = readRequiredPositiveFeeValue(config.max, "封頂金額");
      return Math.min(baseAmount * percent / 100, max);
    }
    case "percent_min_max": {
      const percent = readRequiredPositiveFeeValue(config.percent, "比例");
      const min = readFeeValue(config.min || 0, "最低收費");
      const max = readRequiredPositiveFeeValue(config.max, "封頂金額");
      return Math.min(Math.max(baseAmount * percent / 100, min), max);
    }
    default:
      throw new Error("未知收費模式");
  }
}

export function calculateFinalAmount(amount, normalizedRate, feeConfig) {
  const numericAmount = toNumber(amount);
  const numericRate = toNumber(normalizedRate);
  const config = feeConfig || { type: "none", feeCurrencyMode: "source" };
  const feeCurrencyMode = config.feeCurrencyMode || "source";

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("匯出金額必須大於 0");
  }

  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    throw new Error("實際匯率必須大於 0");
  }

  if (feeCurrencyMode === "source") {
    const feeAmount = calculateFee(numericAmount, config);
    const netSourceAmount = numericAmount - feeAmount;

    if (netSourceAmount < 0) {
      throw new Error("匯出幣種手續費不能大於匯出金額");
    }

    return {
      feeAmount,
      feeCurrencyMode,
      grossTargetAmount: numericAmount * numericRate,
      finalAmount: netSourceAmount * numericRate,
      netSourceAmount,
    };
  }

  if (feeCurrencyMode === "target") {
    const grossTargetAmount = numericAmount * numericRate;
    const feeAmount = calculateFee(grossTargetAmount, config);
    const finalAmount = grossTargetAmount - feeAmount;

    if (finalAmount < 0) {
      throw new Error("接收幣種手續費不能大於兌換金額");
    }

    return {
      feeAmount,
      feeCurrencyMode,
      grossTargetAmount,
      finalAmount,
      netSourceAmount: numericAmount,
    };
  }

  throw new Error("未知扣費幣種");
}

function getQuoteInputRate(quote) {
  return quote?.inputRate ?? quote?.rate ?? "";
}

function getQuoteSelectedFormat(quote) {
  return quote?.selectedFormat ?? quote?.format ?? "auto";
}

export function calculateRouteStep({
  amount,
  sourceCurrency,
  targetCurrency,
  inputRate,
  selectedFormat = "auto",
  feeConfig,
  referenceRate,
}) {
  const numericAmount = toNumber(amount);
  const numericRate = toNumber(inputRate);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      sourceCurrency,
      targetCurrency,
      inputAmount: amount,
      inputRate,
      detectedFormat: null,
      normalizedRate: null,
      confidence: "need_manual",
      feeAmount: null,
      grossAmount: null,
      finalAmount: null,
      isValid: false,
      shouldCalculate: false,
      participatesInRanking: false,
      formulaText: "",
      explanationText: "匯出金額必須大於 0",
      reason: "invalid_amount",
    };
  }

  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return {
      sourceCurrency,
      targetCurrency,
      inputAmount: numericAmount,
      inputRate,
      detectedFormat: null,
      normalizedRate: null,
      confidence: "need_manual",
      feeAmount: null,
      grossAmount: null,
      finalAmount: null,
      isValid: false,
      shouldCalculate: false,
      participatesInRanking: false,
      formulaText: "",
      explanationText: "請先輸入商家報價",
      reason: "empty_rate",
    };
  }

  try {
    const isManualFormat = selectedFormat !== "auto";
    const detection = isManualFormat
      ? {
        format: selectedFormat,
        normalizedRate: calculateNormalizedRate(numericRate, selectedFormat),
        deviation: calculateRateDeviation(calculateNormalizedRate(numericRate, selectedFormat), referenceRate),
        confidence: "manual",
        lowConfidence: false,
        shouldCalculate: true,
        participatesInRanking: true,
        reason: "manual",
      }
      : detectQuoteFormat(numericRate, sourceCurrency, targetCurrency, referenceRate);

    if (!detection.shouldCalculate) {
      return {
        sourceCurrency,
        targetCurrency,
        inputAmount: numericAmount,
        inputRate: numericRate,
        detectedFormat: detection.format,
        normalizedRate: null,
        deviation: detection.deviation,
        referenceRate,
        confidence: detection.confidence,
        feeAmount: null,
        grossAmount: null,
        finalAmount: null,
        isValid: false,
        shouldCalculate: false,
        participatesInRanking: false,
        formulaText: "",
        explanationText: detection.reason === "missing_reference_rate"
          ? "缺少參考匯率，請手動選擇格式"
          : "請確認報價格式",
        reason: detection.reason,
      };
    }

    const amountResult = calculateFinalAmount(numericAmount, detection.normalizedRate, feeConfig);

    return {
      sourceCurrency,
      targetCurrency,
      inputAmount: numericAmount,
      inputRate: numericRate,
      detectedFormat: detection.format,
      normalizedRate: detection.normalizedRate,
      deviation: detection.deviation,
      referenceRate,
      confidence: detection.confidence,
      feeAmount: amountResult.feeAmount,
      feeCurrencyMode: amountResult.feeCurrencyMode,
      grossAmount: amountResult.grossTargetAmount,
      finalAmount: amountResult.finalAmount,
      netSourceAmount: amountResult.netSourceAmount,
      isValid: true,
      shouldCalculate: true,
      participatesInRanking: true,
      formulaText: getRouteFormulaText(numericAmount, detection.format, numericRate),
      explanationText: getRouteExplanationText(detection.format, sourceCurrency, targetCurrency, numericRate),
      reason: detection.reason,
    };
  } catch (error) {
    return {
      sourceCurrency,
      targetCurrency,
      inputAmount: numericAmount,
      inputRate: numericRate,
      detectedFormat: null,
      normalizedRate: null,
      confidence: "need_manual",
      feeAmount: null,
      grossAmount: null,
      finalAmount: null,
      isValid: false,
      shouldCalculate: false,
      participatesInRanking: false,
      formulaText: "",
      explanationText: error.message,
      reason: "calculation_error",
    };
  }
}

export function calculateDirectRoute({
  amount,
  sourceCurrency,
  targetCurrency,
  quote,
}) {
  const step = calculateRouteStep({
    amount,
    sourceCurrency,
    targetCurrency,
    inputRate: getQuoteInputRate(quote),
    selectedFormat: getQuoteSelectedFormat(quote),
    feeConfig: quote?.feeConfig,
    referenceRate: quote?.referenceRate,
  });

  return {
    type: "direct",
    sourceCurrency,
    targetCurrency,
    finalAmount: step.isValid ? step.finalAmount : null,
    isValid: step.isValid,
    invalidStep: step.isValid ? null : "direct",
    steps: [step],
    reason: step.reason,
    message: step.isValid ? "" : step.explanationText,
  };
}

export function calculateBridgeRoute({
  amount,
  sourceCurrency,
  bridgeCurrency,
  targetCurrency,
  firstQuote,
  secondQuote,
}) {
  const firstStep = calculateRouteStep({
    amount,
    sourceCurrency,
    targetCurrency: bridgeCurrency,
    inputRate: getQuoteInputRate(firstQuote),
    selectedFormat: getQuoteSelectedFormat(firstQuote),
    feeConfig: firstQuote?.feeConfig,
    referenceRate: firstQuote?.referenceRate,
  });

  if (!firstStep.isValid) {
    return {
      type: "bridge",
      sourceCurrency,
      bridgeCurrency,
      targetCurrency,
      intermediateAmount: null,
      finalAmount: null,
      isValid: false,
      invalidStep: "first",
      steps: [firstStep],
      reason: firstStep.reason,
      message: firstStep.explanationText,
    };
  }

  const secondStep = calculateRouteStep({
    amount: firstStep.finalAmount,
    sourceCurrency: bridgeCurrency,
    targetCurrency,
    inputRate: getQuoteInputRate(secondQuote),
    selectedFormat: getQuoteSelectedFormat(secondQuote),
    feeConfig: secondQuote?.feeConfig,
    referenceRate: secondQuote?.referenceRate,
  });

  return {
    type: "bridge",
    sourceCurrency,
    bridgeCurrency,
    targetCurrency,
    intermediateAmount: firstStep.finalAmount,
    finalAmount: secondStep.isValid ? secondStep.finalAmount : null,
    isValid: secondStep.isValid,
    invalidStep: secondStep.isValid ? null : "second",
    steps: [firstStep, secondStep],
    reason: secondStep.isValid ? null : secondStep.reason,
    message: secondStep.isValid ? "" : secondStep.explanationText,
  };
}

export function validateBridgeCurrency({
  sourceCurrency,
  targetCurrency,
  bridgeCurrency,
  existingBridgeCurrencies = [],
}) {
  if (!bridgeCurrency) {
    return "請選擇中轉幣種";
  }

  if (bridgeCurrency === sourceCurrency) {
    return "中轉幣種不能等於匯出幣種";
  }

  if (bridgeCurrency === targetCurrency) {
    return "中轉幣種不能等於接收幣種";
  }

  if (existingBridgeCurrencies.includes(bridgeCurrency)) {
    return "該中轉幣種已存在";
  }

  return "";
}

export function validateCurrencyCombination({
  sourceCurrency,
  targetCurrency,
  bridgeCurrency,
}) {
  if (sourceCurrency === targetCurrency && targetCurrency === bridgeCurrency) {
    return "匯出幣種、接收幣種和中轉幣種不能相同";
  }

  if (sourceCurrency === targetCurrency) {
    return "匯出幣種和接收幣種不能相同";
  }

  if (bridgeCurrency === sourceCurrency || bridgeCurrency === targetCurrency) {
    return "請選擇不同的匯出、接收和中轉幣種";
  }

  return "";
}

export function calculateMultiBridgeRoutes({
  amount,
  sourceCurrency,
  targetCurrency,
  directQuote,
  bridgeRoutes = [],
}) {
  const directRoute = {
    id: "direct",
    type: "direct",
    currencies: [sourceCurrency, targetCurrency],
    label: `${sourceCurrency} → ${targetCurrency}`,
    ...calculateDirectRoute({
      amount,
      sourceCurrency,
      targetCurrency,
      quote: directQuote,
    }),
  };

  const calculatedBridgeRoutes = bridgeRoutes.map((route) => {
    const validationMessage = validateBridgeCurrency({
      sourceCurrency,
      targetCurrency,
      bridgeCurrency: route.bridgeCurrency,
      existingBridgeCurrencies: [],
    });

    if (validationMessage) {
      return {
        id: route.id || route.bridgeCurrency,
        type: "bridge",
        bridgeCurrency: route.bridgeCurrency,
        currencies: [sourceCurrency, route.bridgeCurrency, targetCurrency],
        label: `${sourceCurrency} → ${route.bridgeCurrency} → ${targetCurrency}`,
        isValid: false,
        finalAmount: null,
        intermediateAmount: null,
        invalidStep: "bridge",
        steps: [],
        status: "待完成",
        message: validationMessage,
        reason: "invalid_bridge_currency",
      };
    }

    const bridgeResult = calculateBridgeRoute({
      amount,
      sourceCurrency,
      bridgeCurrency: route.bridgeCurrency,
      targetCurrency,
      firstQuote: route.firstQuote,
      secondQuote: route.secondQuote,
    });

    const missingSecondRate = bridgeResult.invalidStep === "second" && bridgeResult.reason === "empty_rate";
    const message = missingSecondRate
      ? `請輸入第二段 ${route.bridgeCurrency} → ${targetCurrency} 報價`
      : bridgeResult.message;

    return {
      id: route.id || route.bridgeCurrency,
      bridgeCurrency: route.bridgeCurrency,
      currencies: [sourceCurrency, route.bridgeCurrency, targetCurrency],
      label: `${sourceCurrency} → ${route.bridgeCurrency} → ${targetCurrency}`,
      ...bridgeResult,
      status: bridgeResult.isValid ? "" : "待完成",
      message,
      reason: bridgeResult.isValid ? "" : message,
    };
  });

  const routes = [directRoute, ...calculatedBridgeRoutes];
  const validRoutes = routes.filter((route) => route.isValid && Number.isFinite(route.finalAmount));
  const bestFinalAmount = validRoutes.length
    ? Math.max(...validRoutes.map((route) => route.finalAmount))
    : null;
  const bestRoutes = bestFinalAmount === null
    ? []
    : validRoutes.filter((route) => isSameAmountWithinTolerance(route.finalAmount, bestFinalAmount));
  const hasTie = bestRoutes.length > 1;
  const secondBestRoute = validRoutes
    .filter((route) => !bestRoutes.includes(route))
    .sort((a, b) => b.finalAmount - a.finalAmount)[0] || null;

  const routesWithStatus = routes.map((route) => {
    if (!route.isValid || !Number.isFinite(route.finalAmount) || bestFinalAmount === null) {
      return {
        ...route,
        status: route.status || "待完成",
        differenceAmount: null,
        percentGap: null,
        isBest: false,
        isJointBest: false,
      };
    }

    if (bestRoutes.includes(route)) {
      return {
        ...route,
        status: hasTie ? "並列最佳" : "最佳",
        differenceAmount: 0,
        percentGap: 0,
        isBest: true,
        isJointBest: hasTie,
      };
    }

    const differenceAmount = bestFinalAmount - route.finalAmount;

    return {
      ...route,
      status: "落後",
      differenceAmount,
      percentGap: route.finalAmount > 0 ? (differenceAmount / route.finalAmount) * 100 : null,
      isBest: false,
      isJointBest: false,
    };
  });

  return {
    routes: routesWithStatus,
    bestRoutes: routesWithStatus.filter((route) => route.isBest),
    secondBestRoute,
    hasTie,
    bestFinalAmount,
  };
}

export function calculateQuoteGroup({
  amount,
  sourceCurrency,
  targetCurrency,
  quotes = [],
}) {
  const calculatedQuotes = quotes.map((quote, index) => {
    const step = calculateRouteStep({
      amount,
      sourceCurrency,
      targetCurrency,
      inputRate: getQuoteInputRate(quote),
      selectedFormat: getQuoteSelectedFormat(quote),
      feeConfig: quote.feeConfig,
      referenceRate: quote.referenceRate,
    });

    return {
      ...quote,
      id: quote.id || `quote-${index}`,
      providerName: quote.providerName || `商家 ${index + 1}`,
      sourceCurrency,
      targetCurrency,
      step,
      finalAmount: step.isValid ? step.finalAmount : null,
      feeAmount: step.feeAmount,
      isValid: step.isValid,
      status: step.isValid ? "" : "待完成",
      message: step.isValid ? "" : step.explanationText,
      reason: step.isValid ? "" : step.explanationText,
    };
  });

  const validQuotes = calculatedQuotes.filter((quote) => quote.isValid && Number.isFinite(quote.finalAmount));
  const bestFinalAmount = validQuotes.length
    ? Math.max(...validQuotes.map((quote) => quote.finalAmount))
    : null;
  const bestQuotes = bestFinalAmount === null
    ? []
    : validQuotes.filter((quote) => isSameAmountWithinTolerance(quote.finalAmount, bestFinalAmount));
  const secondBestQuote = validQuotes
    .filter((quote) => !bestQuotes.includes(quote))
    .sort((a, b) => b.finalAmount - a.finalAmount)[0] || null;

  return {
    quotes: calculatedQuotes,
    validQuotes,
    bestQuotes,
    secondBestQuote,
    hasTie: bestQuotes.length > 1,
    bestFinalAmount,
  };
}

function getQuoteGroupInvalidMessage(group, fallbackMessage) {
  const nonEmptyInvalidQuote = group.quotes.find((quote) => (
    String(quote.inputRate ?? quote.rate ?? "").trim() !== "" &&
    !quote.isValid
  ));

  return nonEmptyInvalidQuote?.reason || nonEmptyInvalidQuote?.message || fallbackMessage;
}

export function calculateBestBridgeCombination({
  amount,
  sourceCurrency,
  bridgeCurrency,
  targetCurrency,
  firstQuotes = [],
  secondQuotes = [],
}) {
  const firstGroup = calculateQuoteGroup({
    amount,
    sourceCurrency,
    targetCurrency: bridgeCurrency,
    quotes: firstQuotes,
  });
  const bestFirstQuote = firstGroup.bestQuotes[0] || null;

  if (!bestFirstQuote) {
    const message = getQuoteGroupInvalidMessage(
      firstGroup,
      `請補充第一段 ${sourceCurrency} → ${bridgeCurrency} 報價`,
    );

    return {
      type: "bridge",
      sourceCurrency,
      bridgeCurrency,
      targetCurrency,
      isValid: false,
      invalidStep: "first",
      firstGroup,
      secondGroup: null,
      bestFirstQuote: null,
      bestSecondQuote: null,
      intermediateAmount: null,
      finalAmount: null,
      message,
      reason: message,
    };
  }

  const secondGroup = calculateQuoteGroup({
    amount: bestFirstQuote.finalAmount,
    sourceCurrency: bridgeCurrency,
    targetCurrency,
    quotes: secondQuotes,
  });
  const bestSecondQuote = secondGroup.bestQuotes[0] || null;

  if (!bestSecondQuote) {
    const message = getQuoteGroupInvalidMessage(
      secondGroup,
      `請補充第二段 ${bridgeCurrency} → ${targetCurrency} 報價`,
    );

    return {
      type: "bridge",
      sourceCurrency,
      bridgeCurrency,
      targetCurrency,
      isValid: false,
      invalidStep: "second",
      firstGroup,
      secondGroup,
      bestFirstQuote,
      bestSecondQuote: null,
      intermediateAmount: bestFirstQuote.finalAmount,
      finalAmount: null,
      message,
      reason: message,
    };
  }

  return {
    type: "bridge",
    sourceCurrency,
    bridgeCurrency,
    targetCurrency,
    isValid: true,
    invalidStep: null,
    firstGroup,
    secondGroup,
    bestFirstQuote,
    bestSecondQuote,
    intermediateAmount: bestFirstQuote.finalAmount,
    finalAmount: bestSecondQuote.finalAmount,
    message: "",
    reason: "",
  };
}

export function compareDirectAndBridge({
  directBestResult,
  bridgeBestResult,
}) {
  const directValid = directBestResult?.isValid && Number.isFinite(directBestResult.finalAmount);
  const bridgeValid = bridgeBestResult?.isValid && Number.isFinite(bridgeBestResult.finalAmount);

  if (!directValid && !bridgeValid) {
    return {
      recommendationType: "insufficient_data",
      bestFinalAmount: null,
      differenceAmount: null,
      differencePercent: null,
      strength: "tiny",
      suggestionText: bridgeBestResult?.reason || bridgeBestResult?.message || "無法給出完整建議，請補充直接兌換或中轉兌換報價",
    };
  }

  if (directValid && !bridgeValid) {
    return {
      recommendationType: "direct",
      bestFinalAmount: directBestResult.finalAmount,
      differenceAmount: null,
      differencePercent: null,
      strength: "clear",
      suggestionText: `建議：使用直接兌換。商家：${directBestResult.providerName}`,
    };
  }

  if (!directValid && bridgeValid) {
    return {
      recommendationType: "bridge",
      bestFinalAmount: bridgeBestResult.finalAmount,
      differenceAmount: null,
      differencePercent: null,
      strength: "clear",
      suggestionText: `建議：使用中轉兌換。第一段：${bridgeBestResult.bestFirstQuote.providerName}，第二段：${bridgeBestResult.bestSecondQuote.providerName}`,
    };
  }

  const differenceAmount = Math.abs(directBestResult.finalAmount - bridgeBestResult.finalAmount);
  const loserAmount = Math.min(directBestResult.finalAmount, bridgeBestResult.finalAmount);
  const differencePercent = loserAmount > 0 ? differenceAmount / loserAmount * 100 : 0;
  const strength = differencePercent < 0.1
    ? "tiny"
    : differencePercent <= 0.5
      ? "slight"
      : "clear";

  if (differenceAmount < EPSILON_AMOUNT) {
    return {
      recommendationType: "tie",
      bestFinalAmount: directBestResult.finalAmount,
      differenceAmount: 0,
      differencePercent: 0,
      strength: "tiny",
      suggestionText: "直接兌換與中轉兌換結果相同，可優先選擇操作較方便的一方。",
    };
  }

  const bridgeBetter = bridgeBestResult.finalAmount > directBestResult.finalAmount;
  const convenienceText = strength === "tiny"
    ? "兩種方式差距很小，可優先選擇操作較方便、現金供應更穩定或手續費更低的一方。"
    : "";

  if (bridgeBetter) {
    return {
      recommendationType: "bridge",
      bestFinalAmount: bridgeBestResult.finalAmount,
      differenceAmount,
      differencePercent,
      strength,
      suggestionText: `建議：使用中轉兌換。第一段：${bridgeBestResult.bestFirstQuote.providerName}，第二段：${bridgeBestResult.bestSecondQuote.providerName}。${convenienceText}`,
    };
  }

  return {
    recommendationType: "direct",
    bestFinalAmount: directBestResult.finalAmount,
    differenceAmount,
    differencePercent,
    strength,
    suggestionText: `建議：使用直接兌換。商家：${directBestResult.providerName}。${convenienceText || "直接兌換已經較優，無需分兩段換幣。"}`,
  };
}

function getRouteFormulaText(amount, format, rate) {
  switch (format) {
    case "source100_to_target":
      return `${amount} × ${rate} ÷ 100`;
    case "source1_to_target":
      return `${amount} × ${rate}`;
    case "target100_to_source":
      return `${amount} × 100 ÷ ${rate}`;
    case "target1_to_source":
      return `${amount} ÷ ${rate}`;
    default:
      return "";
  }
}

function getRouteExplanationText(format, sourceCurrency, targetCurrency, rate) {
  switch (format) {
    case "source100_to_target":
      return `100 ${sourceCurrency} 可換 ${rate} ${targetCurrency}`;
    case "source1_to_target":
      return `1 ${sourceCurrency} 可換 ${rate} ${targetCurrency}`;
    case "target100_to_source":
      return `100 ${targetCurrency} 需要 ${rate} ${sourceCurrency}`;
    case "target1_to_source":
      return `1 ${targetCurrency} 需要 ${rate} ${sourceCurrency}`;
    default:
      return "";
  }
}

export function isSameAmountWithinTolerance(finalAmount, bestFinalAmount, epsilon = EPSILON_AMOUNT) {
  return (
    Number.isFinite(finalAmount) &&
    Number.isFinite(bestFinalAmount) &&
    Math.abs(finalAmount - bestFinalAmount) < epsilon
  );
}

export function rankQuotes(quotes) {
  const normalizedQuotes = quotes.map((quote) => ({
    ...quote,
    participatesInRanking:
      quote.participatesInRanking !== false &&
      quote.shouldCalculate !== false &&
      Number.isFinite(quote.finalAmount),
  }));
  const rankableQuotes = normalizedQuotes.filter((quote) => quote.participatesInRanking);
  const bestFinalAmount = rankableQuotes.length
    ? Math.max(...rankableQuotes.map((quote) => quote.finalAmount))
    : null;
  const bestTieCount = bestFinalAmount === null
    ? 0
    : rankableQuotes.filter((quote) => isSameAmountWithinTolerance(quote.finalAmount, bestFinalAmount)).length;

  const quotesWithRankStatus = normalizedQuotes.map((quote) => {
    if (!quote.participatesInRanking || bestFinalAmount === null) {
      return {
        ...quote,
        isBest: false,
        isJointBest: false,
        differenceAmount: null,
        percentGap: null,
        rankStatus: quote.confidence === "need_manual" ? "待確認" : "-",
      };
    }

    if (isSameAmountWithinTolerance(quote.finalAmount, bestFinalAmount)) {
      return {
        ...quote,
        isBest: true,
        isJointBest: bestTieCount > 1,
        differenceAmount: 0,
        percentGap: 0,
        rankStatus: bestTieCount > 1 ? "並列最佳" : "最佳",
      };
    }

    const differenceAmount = bestFinalAmount - quote.finalAmount;

    return {
      ...quote,
      isBest: false,
      isJointBest: false,
      differenceAmount,
      percentGap: quote.finalAmount > 0 ? (differenceAmount / quote.finalAmount) * 100 : null,
      rankStatus: "落後",
    };
  });

  return {
    bestFinalAmount,
    bestTieCount,
    rankedQuotes: [...quotesWithRankStatus]
      .filter((quote) => quote.participatesInRanking)
      .sort((a, b) => b.finalAmount - a.finalAmount),
    quotes: quotesWithRankStatus,
  };
}
