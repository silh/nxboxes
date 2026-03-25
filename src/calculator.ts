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
  rate2: number,
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
    vpbTier1Threshold,
    vpbTier1Rate,
    vpbTier2Rate,
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

    const balanceAfterReturn = balanceBeforeReturn + totalReturn;

    let grossWithdrawal = 0;
    let withdrawalTax = 0;
    let vpbTax = 0;
    let dividendGross = 0;
    let dividendTax = 0;
    let dividendNet = 0;

    if (
      !inAccumulation &&
      targetNetWithdrawalPerYear > 0 &&
      balanceAfterReturn > 0
    ) {
      const maxGrossWithdrawal = balanceAfterReturn;

      // Evaluate the net cash to the shareholder for a candidate gross withdrawal,
      // while taxing VPB on the full amount and dividend tax only on the profit portion.
      const evalForGross = (candidateGrossWithdrawal: number): {
        netCash: number;
        vpbTax: number;
        dividendGross: number;
        dividendTax: number;
      } => {
        if (candidateGrossWithdrawal <= 0) {
          return { netCash: 0, vpbTax: 0, dividendGross: 0, dividendTax: 0 };
        }

        // Principal available for this year before any withdrawal is the "cost basis".
        const principalAvailable = costBasisBeforeReturn;

        // Withdraw principal first: any remaining withdrawal is treated as profit/return.
        const principalWithdrawn = Math.min(candidateGrossWithdrawal, principalAvailable);
        const profitWithdrawn = Math.max(0, candidateGrossWithdrawal - principalWithdrawn);
        const profitShare = candidateGrossWithdrawal > 0 ? profitWithdrawn / candidateGrossWithdrawal : 0;

        const vpb = twoTierTax(
          candidateGrossWithdrawal,
          vpbTier1Threshold,
          vpbTier1Rate,
          vpbTier2Rate,
        );
        const afterVPB = candidateGrossWithdrawal - vpb;

        // Allocate the post-VPB cash between principal and profit in the same ratio,
        // then apply dividend tax only to the profit part.
        const dividendBase = profitShare * afterVPB;
        const divTax = twoTierTax(
          dividendBase,
          box2Threshold,
          box2Tier1Rate,
          box2Tier2Rate,
        );

        const netCash = afterVPB - divTax;
        return {
          netCash: Math.max(0, netCash),
          vpbTax: vpb,
          dividendGross: Math.max(0, dividendBase),
          dividendTax: divTax,
        };
      };

      const evalMax = evalForGross(maxGrossWithdrawal);
      const targetNet = targetNetWithdrawalPerYear;

      if (evalMax.netCash < targetNet) {
        // Not enough profit/principal to reach the target net withdrawal.
        grossWithdrawal = maxGrossWithdrawal;
        vpbTax = evalMax.vpbTax;
        dividendGross = evalMax.dividendGross;
        dividendTax = evalMax.dividendTax;
        dividendNet = evalMax.netCash;
        withdrawalTax = vpbTax + dividendTax;
        totalNetDividends += dividendNet;
        totalTax += withdrawalTax;
      } else {
        // Binary search for a gross withdrawal that yields the target net cash.
        let low = 0;
        let high = maxGrossWithdrawal;

        // 60-80 iterations is plenty for JS double precision.
        for (let i = 0; i < 70; i += 1) {
          const mid = (low + high) / 2;
          const { netCash } = evalForGross(mid);
          if (netCash >= targetNet) {
            high = mid;
          } else {
            low = mid;
          }
        }

        const evalLow = evalForGross(low);
        const evalHigh = evalForGross(high);
        const useHigh =
          Math.abs(evalHigh.netCash - targetNet) <= Math.abs(evalLow.netCash - targetNet);
        const chosen = useHigh ? evalHigh : evalLow;

        grossWithdrawal = useHigh ? high : low;
        vpbTax = chosen.vpbTax;
        dividendGross = chosen.dividendGross;
        dividendTax = chosen.dividendTax;
        dividendNet = chosen.netCash;
        withdrawalTax = vpbTax + dividendTax;
        totalNetDividends += dividendNet;
        totalTax += withdrawalTax;
      }
    }

    
    const endingBalance = Math.max(0, balanceAfterReturn - grossWithdrawal);

    // Track remaining cost basis assuming principal is withdrawn first.
    const principalWithdrawn = Math.min(grossWithdrawal, costBasisBeforeReturn);
    previousCostBasis = Math.max(0, costBasisBeforeReturn - principalWithdrawn);
    previousEnding = endingBalance;

    rows.push({
      yearIndex: year,
      startingBalance,
      contribution,
      totalReturn,
      vpbTax: inAccumulation ? 0 : vpbTax,
      dividendGross: inAccumulation ? 0 : dividendGross,
      dividendTax: inAccumulation ? 0 : dividendTax,
      dividendNet: inAccumulation ? 0 : dividendNet,
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
