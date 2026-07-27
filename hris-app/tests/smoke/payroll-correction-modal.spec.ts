import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke: payroll correction multi-day submit rules with Time In / Time Out.
 * Mounts a lightweight harness that reuses the pure form helpers (same rules as the React panel).
 */

const harnessHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Payroll correction harness</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; }
      .row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
      button:disabled { opacity: 0.5; pointer-events: none; }
      .err { color: #b91c1c; font-size: 12px; }
      input[type="time"] { width: 110px; }
    </style>
  </head>
  <body>
    <h1>Payroll correction harness</h1>
    <div id="days"></div>
    <label>Reason <textarea id="reason" data-testid="payroll-correction-reason"></textarea></label>
    <div id="errors"></div>
    <button type="button" id="submit" data-testid="payroll-correction-submit">Submit correction request</button>
    <pre id="payload" data-testid="payroll-correction-payload"></pre>
    <script type="module">
      // Inline the same rules as app/lib/utils/payroll-correction-form.ts
      function parseClockToMinutes(value) {
        if (!value) return null;
        const m = String(value).trim().match(/^(\\d{1,2}):(\\d{2})$/);
        if (!m) return null;
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
        return h * 60 + min;
      }
      function durationMinutesFromClocks(timeIn, timeOut) {
        const inM = parseClockToMinutes(timeIn);
        const outM = parseClockToMinutes(timeOut);
        if (inM === null || outM === null) return "";
        let diff = outM - inM;
        if (diff <= 0) diff += 24 * 60;
        return diff;
      }
      function hasDayDelta(row) {
        if (row.afterMinutes === "") return false;
        const inV = String(row.timeIn || "").trim();
        const outV = String(row.timeOut || "").trim();
        if ((inV && !outV) || (!inV && outV)) return false;
        return Number(row.afterMinutes) !== Number(row.beforeMinutes);
      }
      function getChangedSelectedDays(rows) {
        return rows.filter((r) => r.selected && r.date && hasDayDelta(r));
      }
      function evaluatePayrollCorrectionSubmit({ reason, rows }) {
        const trimmed = String(reason || "").trim();
        const selected = rows.filter((r) => r.selected && r.date);
        const changedDays = getChangedSelectedDays(rows);
        return {
          canSubmit: trimmed.length > 0 && changedDays.length > 0,
          changedDays,
          errors: {
            reasonRequired: trimmed.length === 0,
            noChangedDays: changedDays.length === 0,
            selectedWithoutChange: selected.length > 0 && changedDays.length === 0,
          },
        };
      }
      function buildPayload({ reason, rows }) {
        const e = evaluatePayrollCorrectionSubmit({ reason, rows });
        if (!e.canSubmit) return { ok: false, errors: e.errors };
        return {
          ok: true,
          payload: {
            reason: String(reason || "").trim(),
            dayDeltas: e.changedDays.map((r) => ({
              date: r.date,
              hoursType: r.hoursType,
              beforeMinutes: r.beforeMinutes,
              afterMinutes: r.afterMinutes,
              deltaMinutes: r.afterMinutes - r.beforeMinutes,
              timeIn: r.timeIn || undefined,
              timeOut: r.timeOut || undefined,
            })),
          },
        };
      }

      const state = {
        reason: "",
        rows: [
          { date: "2026-06-01", selected: false, hoursType: "OT", beforeMinutes: 0, afterMinutes: "", timeIn: "", timeOut: "" },
          { date: "2026-06-02", selected: false, hoursType: "REGULAR", beforeMinutes: 480, afterMinutes: 480, timeIn: "08:00", timeOut: "16:00" },
          { date: "2026-06-03", selected: false, hoursType: "OT", beforeMinutes: 0, afterMinutes: "", timeIn: "", timeOut: "" },
        ],
      };

      const daysEl = document.getElementById("days");
      const reasonEl = document.getElementById("reason");
      const errorsEl = document.getElementById("errors");
      const submitEl = document.getElementById("submit");
      const payloadEl = document.getElementById("payload");

      function applyClocks(index, patch) {
        const row = state.rows[index];
        if (patch.timeIn !== undefined) row.timeIn = patch.timeIn;
        if (patch.timeOut !== undefined) row.timeOut = patch.timeOut;
        row.afterMinutes = durationMinutesFromClocks(row.timeIn, row.timeOut);
      }

      function render() {
        daysEl.innerHTML = "";
        state.rows.forEach((row, index) => {
          const wrap = document.createElement("div");
          wrap.className = "row";
          wrap.dataset.testid = "payroll-correction-day-" + row.date;

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = row.selected;
          cb.dataset.testid = "payroll-correction-select-" + row.date;
          cb.addEventListener("change", () => {
            state.rows[index].selected = cb.checked;
            render();
          });

          const label = document.createElement("span");
          label.textContent = row.date + " paid " + row.beforeMinutes + "m";

          const timeIn = document.createElement("input");
          timeIn.type = "time";
          timeIn.value = row.timeIn || "";
          timeIn.disabled = !row.selected;
          timeIn.dataset.testid = "payroll-correction-time-in-" + row.date;
          timeIn.addEventListener("input", () => {
            applyClocks(index, { timeIn: timeIn.value });
            render();
          });

          const timeOut = document.createElement("input");
          timeOut.type = "time";
          timeOut.value = row.timeOut || "";
          timeOut.disabled = !row.selected;
          timeOut.dataset.testid = "payroll-correction-time-out-" + row.date;
          timeOut.addEventListener("input", () => {
            applyClocks(index, { timeOut: timeOut.value });
            render();
          });

          const delta = document.createElement("span");
          const after = row.afterMinutes === "" ? null : Number(row.afterMinutes);
          const d = after === null ? null : after - row.beforeMinutes;
          delta.textContent = d === null ? "—" : ((d > 0 ? "+" : "") + d + "m");
          delta.dataset.testid = "payroll-correction-delta-" + row.date;

          wrap.append(cb, label, timeIn, timeOut, delta);
          daysEl.appendChild(wrap);
        });

        reasonEl.value = state.reason;
      }

      reasonEl.addEventListener("input", () => {
        state.reason = reasonEl.value;
      });

      submitEl.addEventListener("click", () => {
        const built = buildPayload({ reason: state.reason, rows: state.rows });
        errorsEl.innerHTML = "";
        if (!built.ok) {
          if (built.errors.reasonRequired) {
            const p = document.createElement("p");
            p.className = "err";
            p.dataset.testid = "payroll-correction-error-reason";
            p.textContent = "Reason is required.";
            errorsEl.appendChild(p);
          }
          if (built.errors.selectedWithoutChange) {
            const p = document.createElement("p");
            p.className = "err";
            p.dataset.testid = "payroll-correction-error-no-delta";
            p.textContent = "Adjust Time In / Time Out on at least one selected day.";
            errorsEl.appendChild(p);
          }
          payloadEl.textContent = "";
          return;
        }
        payloadEl.textContent = JSON.stringify(built.payload);
      });

      render();
      window.__payrollHarness = { state, buildPayload, evaluatePayrollCorrectionSubmit };
    </script>
  </body>
</html>`;

async function mountHarness(page: Page) {
	await page.setContent(harnessHtml, { waitUntil: "domcontentloaded" });
}

test.describe("payroll correction multi-day submit", () => {
	test("submit stays clickable and accepts multi-select when only some days change", async ({
		page,
	}) => {
		await mountHarness(page);

		// Select three days
		await page.getByTestId("payroll-correction-select-2026-06-01").check();
		await page.getByTestId("payroll-correction-select-2026-06-02").check();
		await page.getByTestId("payroll-correction-select-2026-06-03").check();

		// Set Time In / Time Out only on two of them (duration change)
		// 2026-06-01: empty → 2h OT window (120m)
		await page.getByTestId("payroll-correction-time-in-2026-06-01").fill("17:00");
		await page.getByTestId("payroll-correction-time-out-2026-06-01").fill("19:00");
		// 2026-06-03: empty → 45m
		await page.getByTestId("payroll-correction-time-in-2026-06-03").fill("18:00");
		await page.getByTestId("payroll-correction-time-out-2026-06-03").fill("18:45");
		// 2026-06-02 intentionally left equal to paid (08:00–16:00 = 480)

		await page.getByTestId("payroll-correction-reason").fill("Missed OT on two days");

		const submit = page.getByTestId("payroll-correction-submit");
		await expect(submit).toBeEnabled();
		await expect(submit).toBeVisible();
		await submit.click();

		const payloadText = await page.getByTestId("payroll-correction-payload").innerText();
		expect(payloadText).toBeTruthy();
		const payload = JSON.parse(payloadText);
		expect(payload.reason).toBe("Missed OT on two days");
		expect(payload.dayDeltas).toHaveLength(2);
		expect(payload.dayDeltas.map((d: { date: string }) => d.date)).toEqual([
			"2026-06-01",
			"2026-06-03",
		]);
		expect(payload.dayDeltas[0].deltaMinutes).toBe(120);
		expect(payload.dayDeltas[0].timeIn).toBe("17:00");
		expect(payload.dayDeltas[0].timeOut).toBe("19:00");
		expect(payload.dayDeltas[1].deltaMinutes).toBe(45);
	});

	test("shows validation when selected days have no duration change", async ({ page }) => {
		await mountHarness(page);

		await page.getByTestId("payroll-correction-select-2026-06-02").check();
		// leave 08:00–16:00 = paid 480
		await page.getByTestId("payroll-correction-reason").fill("No real change");

		await page.getByTestId("payroll-correction-submit").click();

		await expect(page.getByTestId("payroll-correction-error-no-delta")).toBeVisible();
		await expect(page.getByTestId("payroll-correction-payload")).toHaveText("");
	});

	test("shows validation when reason is missing", async ({ page }) => {
		await mountHarness(page);

		await page.getByTestId("payroll-correction-select-2026-06-01").check();
		await page.getByTestId("payroll-correction-time-in-2026-06-01").fill("09:00");
		await page.getByTestId("payroll-correction-time-out-2026-06-01").fill("09:30");

		await page.getByTestId("payroll-correction-submit").click();

		await expect(page.getByTestId("payroll-correction-error-reason")).toBeVisible();
	});
});
