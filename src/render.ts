import { CombinedYearRow, SimulationResult } from "./types";

declare const Chart: any;

let chartInstance: any | null = null;

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "€0";
  const rounded = Math.round(value);
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(rounded);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function renderSummary(result: SimulationResult, container: HTMLElement): void {
  const { rows, box3TotalTax, box2TotalTax, box2TotalNetDividends } = result;
  if (rows.length === 0) {
    container.innerHTML = "<p>No data. Please run a simulation.</p>";
    return;
  }

  const last = rows[rows.length - 1];
  const box3Final = last.box3.endingBalance;
  const box2Final = last.box2.endingBalance;
  const box2TotalValue = box2Final + box2TotalNetDividends;
  const diff = box2TotalValue - box3Final;

  const diffClass = diff >= 0 ? "summary-highlight" : "summary-highlight negative";
  const diffLabel = diff >= 0 ? "higher" : "lower";

  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <h3>Box 3 final balance</h3>
        <div class="summary-value">${formatCurrency(box3Final)}</div>
        <div class="summary-sub">Total tax paid: ${formatCurrency(box3TotalTax)}</div>
      </div>
      <div class="summary-card">
        <h3>Box 2 final balance</h3>
        <div class="summary-value">${formatCurrency(box2Final)}</div>
        <div class="summary-sub">Tax paid: ${formatCurrency(
          box2TotalTax,
        )}, net dividends: ${formatCurrency(box2TotalNetDividends)}</div>
      </div>
      <div class="summary-card">
        <h3>Comparison</h3>
        <div class="summary-value ${diffClass}">${formatCurrency(Math.abs(diff))}</div>
        <div class="summary-sub">
          Under these assumptions, Box 2 total value (balance + net dividends) is
          <span class="${diffClass}">${diffLabel}</span> than Box 3 after ${
            rows.length
          } years.
        </div>
      </div>
    </div>
  `;
}

export function renderTable(result: SimulationResult, container: HTMLElement): void {
  const { rows } = result;
  if (rows.length === 0) {
    container.innerHTML = "<p>No data to display.</p>";
    return;
  }

  const header = `
    <thead>
      <tr>
        <th>Year</th>
        <th>Box 3 start</th>
        <th>Box 3 contrib</th>
        <th>Box 3 return</th>
        <th>Box 3 tax</th>
        <th>Box 3 withdraw (net)</th>
        <th>Box 3 end</th>
        <th>Box 2 start</th>
        <th>Box 2 contrib</th>
        <th>Box 2 return</th>
        <th>VPB</th>
        <th>Div. net</th>
        <th>Growth tax</th>
        <th>Box 2 withdraw (gross)</th>
        <th>Box 2 withdraw tax</th>
        <th>Box 2 end</th>
      </tr>
    </thead>
  `;

  const bodyRows = rows
    .map((row: CombinedYearRow) => {
      const { box3, box2 } = row;
      return `
        <tr>
          <td>${row.yearIndex}</td>
          <td>${formatNumber(box3.startingBalance)}</td>
          <td>${formatNumber(box3.contribution)}</td>
          <td>${formatNumber(box3.returnBeforeTax)}</td>
          <td>${formatNumber(box3.tax)}</td>
          <td>${formatNumber(box3.withdrawal)}</td>
          <td>${formatNumber(box3.endingBalance)}</td>
          <td>${formatNumber(box2.startingBalance)}</td>
          <td>${formatNumber(box2.contribution)}</td>
          <td>${formatNumber(box2.totalReturn)}</td>
          <td>${formatNumber(box2.vpbTax)}</td>
          <td>${formatNumber(box2.dividendNet)}</td>
          <td>${formatNumber(box2.growthTax)}</td>
          <td>${formatNumber(box2.withdrawal)}</td>
          <td>${formatNumber(box2.withdrawalTax)}</td>
          <td>${formatNumber(box2.endingBalance)}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <table>
      ${header}
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  `;
}

export function renderChart(result: SimulationResult, canvas: HTMLCanvasElement): void {
  const { rows } = result;
  if (!rows.length) return;

  const labels = rows.map((row) => `Year ${row.yearIndex}`);
  const box3Data = rows.map((row) => Math.round(row.box3.endingBalance));
  const box2Data = rows.map((row) => Math.round(row.box2.endingBalance));

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const data = {
    labels,
    datasets: [
      {
        label: "Box 3 balance",
        data: box3Data,
        borderColor: "rgba(96, 165, 250, 1)",
        backgroundColor: "rgba(96, 165, 250, 0.25)",
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 0,
      },
      {
        label: "Box 2 balance",
        data: box2Data,
        borderColor: "rgba(74, 222, 128, 1)",
        backgroundColor: "rgba(74, 222, 128, 0.25)",
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#e5e7eb",
          font: { size: 11 },
        },
      },
      tooltip: {
        callbacks: {
          label(context: any) {
            const value = context.parsed.y;
            return `${context.dataset.label}: ${formatCurrency(value)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#9ca3af",
        },
        grid: {
          color: "rgba(55, 65, 81, 0.4)",
        },
      },
      y: {
        ticks: {
          color: "#9ca3af",
          callback(value: any) {
            if (typeof value === "number") {
              return formatNumber(value);
            }
            return value;
          },
        },
        grid: {
          color: "rgba(55, 65, 81, 0.3)",
        },
      },
    },
  };

  if (chartInstance) {
    chartInstance.data = data;
    chartInstance.options = options;
    chartInstance.update();
  } else {
    chartInstance = new Chart(ctx, {
      type: "line",
      data,
      options,
    });
  }
}

