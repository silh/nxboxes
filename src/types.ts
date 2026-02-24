export type HouseholdType = "single" | "couple";

export interface CommonSimulationParams {
  initialAmount: number;
  yearsAccumulating: number;
  yearsWithdrawing: number;
  monthlyContribution: number;
  /** Target amount (net of tax) the user wants to receive per year during withdrawal phase. */
  targetNetWithdrawalPerYear: number;
  annualReturnRate: number; // decimal, e.g. 0.05
}

export interface Box3Params extends CommonSimulationParams {
  box3TaxRate: number; // decimal, e.g. 0.36
  allowancePerPerson: number; // e.g. 1800
  householdType: HouseholdType;
}

export interface Box2Params extends CommonSimulationParams {
  /** Box 2: single/couple affects threshold (couple = 2× threshold). */
  householdType: HouseholdType;
  vpbTier1Threshold: number;
  vpbTier1Rate: number; // decimal, e.g. 0.19
  vpbTier2Rate: number; // decimal, e.g. 0.258
  /** Box 2 tier 1 threshold in € (per person; doubled for couple). */
  box2Tier1Threshold: number;
  /** Box 2 tier 1 rate (decimal). */
  box2Tier1Rate: number;
  /** Box 2 tier 2 rate (decimal). */
  box2Tier2Rate: number;
}

export interface Box3YearRow {
  yearIndex: number;
  startingBalance: number;
  contribution: number;
  returnBeforeTax: number;
  taxFreeAllowance: number;
  taxableReturn: number;
  tax: number;
  withdrawal: number;
  endingBalance: number;
}

export interface Box2YearRow {
  yearIndex: number;
  startingBalance: number;
  contribution: number;
  totalReturn: number;
  dividendGross: number;
  dividendTax: number;
  dividendNet: number;
  /** Gross amount withdrawn from Box 2 (dividend/distribution). */
  withdrawal: number;
  /** Box 2 tax on the withdrawal (two-tier bracket). */
  withdrawalTax: number;
  endingBalance: number;
}

export interface CombinedYearRow {
  yearIndex: number;
  box3: Box3YearRow;
  box2: Box2YearRow;
}

export interface SimulationResult {
  rows: CombinedYearRow[];
  box3TotalTax: number;
  box2TotalTax: number;
  box2TotalNetDividends: number;
}

