import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("five-device credential convergence operational scope", () => {
	it("freezes exactly B/A/F/D/E and explicitly excludes Main C and TEST panels", () => {
		const prompt = readFileSync(
			join(
				process.cwd(),
				"../docs/00-product/AGENT-PROMPT-five-device-full-credential-convergence.md",
			),
			"utf8",
		);
		const includeSection = prompt.slice(
			prompt.indexOf("Include exactly:"),
			prompt.indexOf("Exclude:"),
		);
		const expected = [
			["Main Entrance Device B", "cmpxw13hx002h7zwso7dyedrn", "10.184.37.20"],
			["Main Entrance Device A", "cmrht5s2w00ei7zgsre8y3o5n", "10.184.37.21"],
			["Main Entrance Device F", "cmrim1zop05ik7zp4zgm2sm4k", "10.184.37.25"],
			["Main Entrance Device D", "cmripjwkw00ffl0013lfxcbxw", "10.184.37.23"],
			["Main Entrance Device E", "cmriu5ab102goi001x9o7nfct", "10.184.37.24"],
		];
		for (const [name, id, target] of expected) {
			expect(includeSection).to.include(`| ${name} | \`${id}\` | \`${target}\` |`);
		}
		expect(includeSection.match(/\| Main Entrance Device [A-F] \|/g)).to.have.length(5);
		for (const excludedId of [
			"cmripjwbx00ewl001ihcke210",
			"cmrlgqsjv000oob01165tbd8n",
			"cmrv02vam004cnxekd57dsjh8",
		]) {
			expect(includeSection).not.to.include(excludedId);
			expect(prompt.slice(prompt.indexOf("Exclude:"))).to.include(excludedId);
		}
	});
});
