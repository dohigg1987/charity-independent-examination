import {
  createLightTheme,
  type BrandVariants,
  type Theme,
} from "@fluentui/react-components";

/**
 * Clarity's teal scale expressed as a Fluent 2 brand ramp. Keeping the brand
 * in Fluent tokens means controls, focus states and interactive states share
 * one accessible colour system instead of component-specific hex values.
 */
export const clarityBrand: BrandVariants = {
  10: "#020D0D",
  20: "#062222",
  30: "#093535",
  40: "#0A4848",
  50: "#095B5B",
  60: "#006D6D",
  70: "#007C7C",
  80: "#008B8B",
  90: "#159A99",
  100: "#2BA9A7",
  110: "#42B8B5",
  120: "#5BC6C3",
  130: "#78D3D0",
  140: "#98DFDC",
  150: "#BCEAE8",
  160: "#E2F6F5",
};

const generatedTheme = createLightTheme(clarityBrand);

export const clarityLightTheme: Theme = {
  ...generatedTheme,
  colorNeutralBackground1: "#FFFFFF",
  colorNeutralBackground2: "#F7F9FA",
  colorNeutralBackground3: "#F1F4F5",
  colorNeutralForeground1: "#20333E",
  colorNeutralForeground2: "#4B5F6A",
  colorNeutralForeground3: "#687A83",
  colorNeutralStroke1: "#D7E1E3",
  colorNeutralStroke2: "#E5EBEC",
  colorBrandForeground1: "#006D6D",
  colorBrandForeground2: "#007C7C",
  colorBrandBackground: "#007C7C",
  colorBrandBackgroundHover: "#006D6D",
  colorBrandBackgroundPressed: "#095B5B",
  colorBrandStroke1: "#007C7C",
  colorCompoundBrandForeground1: "#007C7C",
  colorCompoundBrandForeground1Hover: "#006D6D",
  colorCompoundBrandForeground1Pressed: "#095B5B",
  colorCompoundBrandStroke: "#007C7C",
  colorCompoundBrandStrokeHover: "#006D6D",
  colorCompoundBrandStrokePressed: "#095B5B",
  fontFamilyBase:
    '"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  fontFamilyMonospace:
    '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  borderRadiusSmall: "4px",
  borderRadiusMedium: "6px",
  borderRadiusLarge: "8px",
  borderRadiusXLarge: "12px",
  shadow4: "0 1px 2px rgba(15, 37, 46, 0.08)",
  shadow8: "0 2px 8px rgba(15, 37, 46, 0.10)",
  shadow16: "0 8px 24px rgba(15, 37, 46, 0.12)",
  shadow28: "0 14px 40px rgba(15, 37, 46, 0.16)",
};
