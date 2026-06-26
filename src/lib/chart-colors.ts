// EXPORTS: CHART_COLORS

/**
 * 图表配色常量 — 与 tailwind-theme.css 中 chart-1..5 完全一致
 * 用于 ECharts / recharts 等图表库的 color / fill / stroke 属性
 * 图表库走 SVG/Canvas 原生 attribute，不解析 CSS var()，必须用 hex 字面量
 */
export const CHART_COLORS = [
  '#2BA7A0', // chart-1: hsl(175 55% 38%) → teal
  '#4D9FCC', // chart-2: hsl(200 50% 55%) → sky blue
  '#5C6BC0', // chart-3: hsl(235 40% 55%) → indigo
  '#6BA539', // chart-4: hsl(85 35% 48%) → olive green
  '#7DC4B8', // chart-5: hsl(175 30% 68%) → light teal
] as const;
