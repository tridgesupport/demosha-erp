// Categorical palette from the dataviz skill's validated default (light mode —
// this app has no dark mode anywhere yet, so charts stay light-only for
// consistency). Fixed hue order — never cycled/reassigned when a filter
// changes which series are present, so a series' color always means the same
// thing across renders.
export const CATEGORICAL_COLORS = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

// Grades observed in the source data, in a fixed display/color order.
// Anything else (an unexpected grade, or nulls normalized to "Ungraded" by
// the API) falls through to the next unused slot in GRADE_COLORS below.
export const KNOWN_GRADES = ['A1', 'S1', 'S2', 'S3', 'F.B.', 'Ungraded'];

export const GRADE_COLORS: Record<string, string> = Object.fromEntries(
  KNOWN_GRADES.map((g, i) => [g, CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]])
);

export function colorForGrade(grade: string): string {
  return GRADE_COLORS[grade] ?? CATEGORICAL_COLORS[CATEGORICAL_COLORS.length - 1];
}

// Rough numeric-label width estimate (px) for a given font size, used to size
// chart margins so axis labels never get clipped by the SVG viewport. Numeric
// strings (digits, comma, dot) are fairly uniform width, so a per-character
// average is close enough without measuring actual glyphs.
export function estimateLabelWidth(text: string, fontSize = 10): number {
  return text.length * fontSize * 0.62;
}

// Chart chrome tokens (this app is light-only; see note above).
export const CHART_INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  surface: '#ffffff',
};
