/**
 * 插件设置的数据模型。
 *
 * Milestone 0 仅包含面板全局开关；模板、白名单、路径规则、防抖延迟等
 * 字段将在后续里程碑中逐步加入（见 README Roadmap）。
 */
export interface AutoHeadingsSettings {
	/** 面板全局开关：是否对任何文件启用自动编号。持久化于 data.json。 */
	enabled: boolean;
}

/** 默认设置：默认启用自动编号。 */
export const DEFAULT_SETTINGS: AutoHeadingsSettings = {
	enabled: true,
};
