/**
 * 插件设置的数据模型。
 *
 * Milestone 0–2：面板全局开关与防抖延迟。模板、白名单、路径规则等字段将在
 * 后续里程碑中逐步加入（见 README Roadmap）。
 */
export interface AutoHeadingsSettings {
	/** 面板全局开关：是否对任何文件启用自动编号。持久化于 data.json。 */
	enabled: boolean;
	/** 防抖延迟（毫秒）。可配置范围 50–2000；设置 GUI 滑块留待 Milestone 6。 */
	debounceMs: number;
}

/** 默认设置：默认启用自动编号，防抖 300 ms。 */
export const DEFAULT_SETTINGS: AutoHeadingsSettings = {
	enabled: true,
	debounceMs: 300,
};

/** 防抖延迟的合法范围（毫秒）。 */
export const DEBOUNCE_MIN_MS = 50;
export const DEBOUNCE_MAX_MS = 2000;

/** 将任意输入夹到合法的防抖范围内。 */
export function clampDebounce(ms: number): number {
	if (!Number.isFinite(ms)) return DEFAULT_SETTINGS.debounceMs;
	return Math.min(DEBOUNCE_MAX_MS, Math.max(DEBOUNCE_MIN_MS, Math.round(ms)));
}
