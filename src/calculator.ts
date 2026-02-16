import {
  Box2Params,
  Box2YearRow,
  Box3Params,
  Box3YearRow,
  CombinedYearRow,
  SimulationResult,
} from "./types";

/** Tax on amount using two-tier bracket. */
function twoTierTax(
  amount: number,
  threshold: number,
  rate1: number,
  rate2: number
): number {
  if (amount <= 0) return 0;
  const first = Math.min(amount, threshold);
  const second = Math.max(0, amount - threshold);
  return first * rate1 + second * rate2;
}

/** Gross amount needed so that after two-tier tax the net is targetNet. */
function grossFromNet(
  targetNet: number,
  threshold: number,
  rate1: number,
  rate2: number
): { gross: number; tax: number } {
  if (targetNet <= 0) return { gross: 0, tax: 0 };
  const gross1 = targetNet / (1 - rate1);
  if (gross1 <= threshold) {
    const tax = gross1 * rate1;
    return { gross: gross1, tax };
  }
  const gross2 = (targetNet - threshold * (rate2 - rate1)) / (1 - rate2);
  const tax = threshold * rate1 + (gross2 - threshold) * rate2;
  return { gross: gross2, tax };
}

function simulateBox3(params: Box3Params): {
  rows: Box3YearRow[];
  totalTax: number;
} {
  const {
    initialAmount,
    yearsAccumulating,
    yearsWithdrawing,
    monthlyContribution,
    targetNetWithdrawalPerYear,
    annualReturnRate,
    box3TaxRate,
    allowancePerPerson,
    householdType,
  } = params;

  const totalYears = yearsAccumulating + yearsWithdrawing;
  const yearlyContribution = monthlyContribution * 12;
  // Box 3: no extra tax on withdrawal; to get target net we withdraw that amount.
  const yearlyWithdrawal = targetNetWithdrawalPerYear;
  const persons = householdType === "couple" ? 2 : 1;
  const annualAllowance = allowancePerPerson * persons;

  const rows: Box3YearRow[] = [];
  let previousEnding = initialAmount;
  let totalTax = 0;

  for (let year = 1; year <= totalYears; year += 1) {
    const inAccumulation = year <= yearsAccumulating;
    const contribution = inAccumulation ? yearlyContribution : 0;
    const withdrawal = !inAccumulation ? yearlyWithdrawal : 0;

    const startingBalance = previousEnding;
    const balanceBeforeReturn = startingBalance + contribution;
    const returnBeforeTax = startingBalance * annualReturnRate;

    const taxableReturn = Math.max(0, returnBeforeTax - annualAllowance);
    const tax = taxableReturn * box3TaxRate;
    totalTax += tax;

    const endingBalanceRaw =
      balanceBeforeReturn + returnBeforeTax - tax - withdrawal;
    const endingBalance = Math.max(0, endingBalanceRaw);

    rows.push({
      yearIndex: year,
      startingBalance,
      contribution,
      returnBeforeTax,
      taxFreeAllowance: annualAllowance,
      taxableReturn,
      tax,
      withdrawal,
      endingBalance,
    });

    previousEnding = endingBalance;
  }

  return { rows, totalTax };
}

function simulateBox2(params: Box2Params): {
  rows: Box2YearRow[];
  totalTax: number;
  totalNetDividends: number;
} {
  const {
    initialAmount,
    yearsAccumulating,
    yearsWithdrawing,
    monthlyContribution,
    targetNetWithdrawalPerYear,
    annualReturnRate,
    householdType,
    box2Tier1Threshold,
    box2Tier1Rate,
    box2Tier2Rate,
  } = params;

  const totalYears = yearsAccumulating + yearsWithdrawing;
  const yearlyContribution = monthlyContribution * 12;
  const box2Threshold =
    householdType === "couple" ? 2 * box2Tier1Threshold : box2Tier1Threshold;

  const rows: Box2YearRow[] = [];
  let previousEnding = initialAmount;
  let previousCostBasis = initialAmount;
  let totalTax = 0;
  let totalNetDividends = 0;

  for (let year = 1; year <= totalYears; year += 1) {
    const inAccumulation = year <= yearsAccumulating;
    const contribution = inAccumulation ? yearlyContribution : 0;

    const startingBalance = previousEnding;
    const costBasisBeforeReturn = previousCostBasis + contribution;
    const balanceBeforeReturn = startingBalance + contribution;
    const totalReturn = startingBalance * annualReturnRate;

    const dividendGross = 0;

    const dividendTax = dividendGross * box2Tier1Rate;
    const dividendNet = dividendGross - dividendTax;

    const balanceAfterReturn = balanceBeforeReturn + totalReturn;

    let grossWithdrawal = 0;
    let withdrawalTax = 0;

    if (
      !inAccumulation &&
      targetNetWithdrawalPerYear > 0 &&
      balanceAfterReturn > 0
    ) {
      const { gross, tax } = grossFromNet(
        targetNetWithdrawalPerYear,
        box2Threshold,
        box2Tier1Rate,
        box2Tier2Rate
      );
      grossWithdrawal = Math.min(gross, balanceAfterReturn);
      withdrawalTax = twoTierTax(
        grossWithdrawal,
        box2Threshold,
        box2Tier1Rate,
        box2Tier2Rate
      );
    }

    totalTax += dividendTax + withdrawalTax;
    totalNetDividends += dividendNet;

    const endingBalance = Math.max(0, balanceAfterReturn - grossWithdrawal);
    const costBasisWithdrawn =
      balanceAfterReturn > 0
        ? costBasisBeforeReturn * (grossWithdrawal / balanceAfterReturn)
        : 0;
    previousCostBasis = Math.max(0, costBasisBeforeReturn - costBasisWithdrawn);
    previousEnding = endingBalance;

    rows.push({
      yearIndex: year,
      startingBalance,
      contribution,
      totalReturn,
      dividendGross,
      dividendTax,
      dividendNet,
      withdrawal: grossWithdrawal,
      withdrawalTax,
      endingBalance,
    });
  }

  return { rows, totalTax, totalNetDividends };
}

export function runSimulation(
  box3Params: Box3Params,
  box2Params: Box2Params
): SimulationResult {
  const box3 = simulateBox3(box3Params);
  const box2 = simulateBox2(box2Params);

  const totalYears = Math.max(box3.rows.length, box2.rows.length);
  const rows: CombinedYearRow[] = [];

  for (let index = 0; index < totalYears; index += 1) {
    const yearIndex = index + 1;
    const box3Year =
      box3.rows[index] ??
      ({
        yearIndex,
        startingBalance: 0,
        contribution: 0,
        returnBeforeTax: 0,
        taxFreeAllowance: 0,
        taxableReturn: 0,
        tax: 0,
        withdrawal: 0,
        endingBalance: 0,
      } as Box3YearRow);

    const box2Year =
      box2.rows[index] ??
      ({
        yearIndex,
        startingBalance: 0,
        contribution: 0,
        totalReturn: 0,
        vpbTax: 0,
        dividendGross: 0,
        dividendTax: 0,
        dividendNet: 0,
        growthTax: 0,
        withdrawal: 0,
        withdrawalTax: 0,
        endingBalance: 0,
      } as Box2YearRow);

    rows.push({
      yearIndex,
      box3: box3Year,
      box2: box2Year,
    });
  }

  return {
    rows,
    box3TotalTax: box3.totalTax,
    box2TotalTax: box2.totalTax,
    box2TotalNetDividends: box2.totalNetDividends,
  };
}
