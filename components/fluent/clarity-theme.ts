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
  colorNeutralBackground1Hover: "#F5F5F5",
  colorNeutralBackground1Pressed: "#EBEBEB",
  colorNeutralBackground1Selected: "#F0F8F7",
  colorNeutralBackground2: "#F5F5F5",
  colorNeutralBackground2Hover: "#EBEBEB",
  colorNeutralBackground2Pressed: "#E0E0E0",
  colorNeutralBackground3: "#FAFAFA",
  colorNeutralBackground4: "#F0F0F0",
  colorNeutralForeground1: "#242424",
  colorNeutralForeground2: "#424242",
  colorNeutralForeground3: "#616161",
  colorNeutralForeground4: "#707070",
  colorNeutralStroke1: "#D1D1D1",
  colorNeutralStroke2: "#E0E0E0",
  colorNeutralStroke3: "#EBEBEB",
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
  borderRadiusSmall: "2px",
  borderRadiusMedium: "4px",
  borderRadiusLarge: "6px",
  borderRadiusXLarge: "8px",
  shadow4: "0 1px 2px rgba(0, 0, 0, 0.08)",
  shadow8: "0 2px 6px rgba(0, 0, 0, 0.10)",
  shadow16: "0 6px 18px rgba(0, 0, 0, 0.12)",
  shadow28: "0 14px 36px rgba(0, 0, 0, 0.16)",
};
