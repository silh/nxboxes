import { runSimulation } from "./calculator";
import { Box2Params, Box3Params, HouseholdType } from "./types";

const ALLOWANCE_PER_PERSON = 1800;

/** Idle time after typing before re-running the simulation (ms). */
const IDLE_MS = 300;

function getInputElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing element with id "${id}"`);
  }
  return el as T;
}

function getNumberValue(id: string, defaultValue: number): number {
  const el = getInputElement<HTMLInputElement>(id);
  const value = parseFloat(el.value.replace(",", "."));
  if (Number.isNaN(value)) {
    return defaultValue;
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseFormValues() {
  const initialAmount = Math.max(0, getNumberValue("initial-amount", 0));
  const yearsAccumulating = Math.max(0, Math.floor(getNumberValue("years-accumulating", 0)));
  const yearsWithdrawing = Math.max(0, Math.floor(getNumberValue("years-withdrawing", 0)));

  const annualReturnPercent = getNumberValue("expected-return", 8);
  const annualReturnRate = clamp(annualReturnPercent / 100, -1, 1);

  const monthlyContribution = Math.max(0, getNumberValue("monthly-contribution", 0));
  const targetNetWithdrawalPerYear = Math.max(0, getNumberValue("target-net-withdrawal", 0));

  const householdTypeSelect = getInputElement<HTMLSelectElement>("household-type");
  const householdType = (householdTypeSelect.value as HouseholdType) ?? "single";

  const box3TaxPercent = getNumberValue("box3-tax-rate", 36);
  const box3TaxRate = clamp(box3TaxPercent / 100, 0, 1);

  const vpbTier1Threshold = Math.max(0, getNumberValue("vpb-tier1-threshold", 200000));
  const vpbTier1Rate = clamp(getNumberValue("vpb-tier1-rate", 19) / 100, 0, 1);
  const vpbTier2Rate = clamp(getNumberValue("vpb-tier2-rate", 25.8) / 100, 0, 1);

  const box2Tier1Threshold = Math.max(0, getNumberValue("box2-tier1-threshold", 67804));
  const box2Tier1Rate = clamp(getNumberValue("box2-tier1-rate", 24.5) / 100, 0, 1);
  const box2Tier2Rate = clamp(getNumberValue("box2-tier2-rate", 31) / 100, 0, 1);

  const common = {
    initialAmount,
    yearsAccumulating,
    yearsWithdrawing,
    monthlyContribution,
    targetNetWithdrawalPerYear,
    annualReturnRate,
  };

  const box3Params: Box3Params = {
    ...common,
    box3TaxRate,
    allowancePerPerson: ALLOWANCE_PER_PERSON,
    householdType,
  };

  const box2Params: Box2Params = {
    ...common,
    vpbTier1Threshold,
    vpbTier1Rate,
    vpbTier2Rate,
    householdType,
    box2Tier1Threshold,
    box2Tier1Rate,
    box2Tier2Rate,
  };

  return { box3Params, box2Params };
}

function showValidationError(message: string) {
  // For now, log only; can extend with inline validation UI later.
  // eslint-disable-next-line no-console
  console.warn(message);
}

export async function initialiseApp() {
  const form = getInputElement<HTMLFormElement>("investment-form");
  const summaryContainer = getInputElement<HTMLDivElement>("summary");
  const tableContainer = getInputElement<HTMLDivElement>("table-container");
  const chartCanvas = getInputElement<HTMLCanvasElement>("results-chart");

  const { renderSummary, renderTable, renderChart } = await import("./render");

  let debouncedRunTimeout: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    const { box3Params, box2Params } = parseFormValues();
    const totalYears = box3Params.yearsAccumulating + box3Params.yearsWithdrawing;
    if (totalYears <= 0) {
      showValidationError("Total years must be greater than 0.");
      summaryContainer.innerHTML = "<p>Please enter at least one year of simulation.</p>";
      tableContainer.innerHTML = "";
      return;
    }

    const result = runSimulation(box3Params, box2Params);
    renderSummary(result, summaryContainer);
    renderTable(result, tableContainer);
    renderChart(result, chartCanvas);
  };

  const cancelDebouncedRun = () => {
    if (debouncedRunTimeout !== null) {
      clearTimeout(debouncedRunTimeout);
      debouncedRunTimeout = null;
    }
  };

  const scheduleDebouncedRun = () => {
    cancelDebouncedRun();
    debouncedRunTimeout = setTimeout(() => {
      debouncedRunTimeout = null;
      run();
    }, IDLE_MS);
  };

  form.addEventListener("input", () => {
    scheduleDebouncedRun();
  });
  form.addEventListener("change", () => {
    scheduleDebouncedRun();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    cancelDebouncedRun();
    run();
  });

  // Run once on load with defaults.
  run();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initialiseApp().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to initialise app", error);
    });
  });
} else {
  initialiseApp().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to initialise app", error);
  });
}

