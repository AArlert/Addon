/**
 * 插件设置的数据模型。
 *
 * Milestone 2 在面板全局开关之外引入防抖延迟字段（供 onChange 监听器使用）。
 * 模板、白名单、路径规则的设置项，以及防抖延迟的滑块 UI 将在后续里程碑加入
 * （见 README Roadmap）。
 */
export interface AutoHeadingsSettings {
	/** 面板全局开关：是否对任何文件启用自动编号。持久化于 data.json。 */
	enabled: boolean;
	/** 实时编辑的防抖延迟（毫秒）。可配置范围 50–2000，默认 300（滑块 UI 见 Milestone 6）。 */
	debounceDelay: number;
}

/** 防抖延迟的边界与默认值（见 README 3.9）。 */
export const DEBOUNCE_MIN = 50;
export const DEBOUNCE_MAX = 2000;
export const DEBOUNCE_DEFAULT = 300;

/** 默认设置：默认启用自动编号，防抖延迟 300 ms。 */
export const DEFAULT_SETTINGS: AutoHeadingsSettings = {
	enabled: true,
	debounceDelay: DEBOUNCE_DEFAULT,
};

/** 将防抖延迟夹到合法范围 [50, 2000]，非数字回退到默认值。 */
export function clampDebounceDelay(value: number): number {
	if (!Number.isFinite(value)) {
		return DEBOUNCE_DEFAULT;
	}
	return Math.min(DEBOUNCE_MAX, Math.max(DEBOUNCE_MIN, Math.round(value)));
}
