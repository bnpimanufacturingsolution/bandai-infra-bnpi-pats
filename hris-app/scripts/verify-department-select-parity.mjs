import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const storybookUrl = process.env.STORYBOOK_URL || "http://127.0.0.1:6006";
const outputDir = path.resolve("tmp/department-select-parity");

const stories = [
	"datatable-department-open",
	"datatable-manager-open",
	"datatable-department-selected",
	"datatable-manager-selected",
	"datatable-department-submenu-open",
	"timesheet-department-open",
	"timesheet-manager-open",
	"report-department-open",
	"report-manager-open",
	"long-labels-side-by-side",
	"scroll-heavy-side-by-side",
	"benefits-toolbar-default",
	"benefits-toolbar-department-open",
	"benefits-toolbar-manager-open",
	"benefits-toolbar-narrow-wrapped",
	"payroll-active-toolbar-default",
	"payroll-active-department-open",
	"payroll-active-manager-open",
	"payroll-past-toolbar-default",
	"payroll-past-narrow-wrapped",
];

const styleProperties = [
	"height",
	"minHeight",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"borderRadius",
	"fontSize",
	"fontWeight",
	"color",
	"backgroundColor",
	"boxShadow",
];

function storyUrl(storyId) {
	return `${storybookUrl}/iframe.html?id=hr-filters-department-selects--${storyId}`;
}

async function captureElement(page, selector) {
	const locator = page.locator(selector).first();
	if (!(await locator.count())) return null;
	return locator.evaluate((element, properties) => {
		const rect = element.getBoundingClientRect();
		const styles = window.getComputedStyle(element);
		return {
			selector: element.getAttribute("data-ui") || element.getAttribute("role") || selector,
			text: element.textContent?.trim().replace(/\s+/g, " ") || "",
			rect: {
				x: Math.round(rect.x * 100) / 100,
				y: Math.round(rect.y * 100) / 100,
				width: Math.round(rect.width * 100) / 100,
				height: Math.round(rect.height * 100) / 100,
			},
			styles: Object.fromEntries(properties.map((property) => [property, styles[property]])),
		};
	}, styleProperties);
}

async function captureStory(page, storyId) {
	await page.goto(storyUrl(storyId), { waitUntil: "networkidle" });
	await page.waitForSelector("body");
	await page.waitForTimeout(350);

	const snapshot = {
		storyId,
		url: storyUrl(storyId),
		overflow: await page.locator("body").evaluate(() => {
			const tolerance = 1;
			const elements = Array.from(
				document.querySelectorAll(
					"button, [role='combobox'], [data-ui='timesheet-department-trigger'], input",
				),
			);
			const rects = elements
				.map((element, index) => {
					const rect = element.getBoundingClientRect();
					return {
						index,
						text: element.textContent?.trim().replace(/\s+/g, " ") || "",
						left: rect.left,
						right: rect.right,
						top: rect.top,
						bottom: rect.bottom,
						width: rect.width,
						height: rect.height,
					};
				})
				.filter((rect) => rect.width > 0 && rect.height > 0);
			const overlaps = [];
			for (let i = 0; i < rects.length; i += 1) {
				for (let j = i + 1; j < rects.length; j += 1) {
					const a = rects[i];
					const b = rects[j];
					const horizontal = a.left < b.right - tolerance && a.right > b.left + tolerance;
					const vertical = a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
					if (horizontal && vertical) overlaps.push([a, b]);
				}
			}
			return {
				bodyScrollWidth: document.body.scrollWidth,
				viewportWidth: window.innerWidth,
				hasHorizontalOverflow: document.body.scrollWidth > window.innerWidth + tolerance,
				overlapCount: overlaps.length,
				overlaps: overlaps.slice(0, 10),
			};
		}),
		elements: {
			departmentTrigger: await captureElement(page, "[data-ui='timesheet-department-trigger']"),
			managerTrigger: await captureElement(page, "[data-ui='timesheet-manager-trigger']"),
			departmentContent: await captureElement(page, "[data-ui='timesheet-department-popup']"),
			managerContent: await captureElement(page, "[data-ui='timesheet-manager-popup']"),
			departmentItem: await captureElement(page, "[data-ui='timesheet-department-item']"),
			managerItem: await captureElement(page, "[data-ui='timesheet-manager-item']"),
			departmentSubTrigger: await captureElement(
				page,
				"[data-ui='timesheet-department-sub-trigger']",
			),
			departmentSubContent: await captureElement(
				page,
				"[data-ui='timesheet-department-sub-content']",
			),
		},
		dom: await page.locator("body").evaluate((body) => body.innerHTML.slice(0, 20000)),
		aria: await page.locator("body").ariaSnapshot().catch(() => null),
	};

	await page.screenshot({
		path: path.join(outputDir, `${storyId}.png`),
		fullPage: true,
	});
	await fs.writeFile(
		path.join(outputDir, `${storyId}.json`),
		JSON.stringify(snapshot, null, 2),
	);
	return snapshot;
}

async function main() {
	await fs.mkdir(outputDir, { recursive: true });
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
	const snapshots = [];

	for (const storyId of stories) {
		snapshots.push(await captureStory(page, storyId));
	}

	await fs.writeFile(
		path.join(outputDir, "summary.json"),
		JSON.stringify(
			snapshots.map((snapshot) => ({
				storyId: snapshot.storyId,
				overflow: snapshot.overflow,
				elements: snapshot.elements,
			})),
			null,
			2,
		),
	);
	await browser.close();
	const overflowFailures = snapshots.filter(
		(snapshot) =>
			snapshot.overflow?.hasHorizontalOverflow || snapshot.overflow?.overlapCount > 0,
	);
	if (overflowFailures.length > 0) {
		console.error(
			`Overflow or overlap detected in ${overflowFailures
				.map((snapshot) => snapshot.storyId)
				.join(", ")}`,
		);
		process.exit(1);
	}
	console.log(`Department/select parity evidence written to ${outputDir}`);
}

main().catch(async (error) => {
	console.error(error);
	process.exit(1);
});
