import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("DEFAULT_SETTINGS", () => {
	it("默认启用自动编号", () => {
		expect(DEFAULT_SETTINGS.enabled).toBe(true);
	});
});
