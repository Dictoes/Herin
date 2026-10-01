export const DEFAULT_CUSTOM_THEME = {
  background: '#F7F3FF',
  surface: '#FFF9F0',
  text: '#493B3B',
  secondaryText: '#6B6078',
  accent: '#51416F',
  border: '#877792',
  button: '#51416F',
};

export const THEME_PRESETS = [
  { id: 'soft-pastel', label: 'Soft Pastel', swatches: ['#F7F3FF', '#F4C6D7', '#C7E8D2', '#C7E3F5'] },
  { id: 'cozy-bear', label: 'Cozy Bear', swatches: ['#FFF4E8', '#B8764D', '#F3C5A5', '#A4C9AE'] },
  { id: 'calm-ocean', label: 'Calm Ocean', swatches: ['#EEF8FB', '#39758A', '#A6D9D2', '#B9DCEB'] },
  { id: 'warm-study', label: 'Warm Study', swatches: ['#FBF4E9', '#85583E', '#DFA68E', '#C98F91'] },
  { id: 'lavender-focus', label: 'Lavender Focus', swatches: ['#F5F1FC', '#655184', '#B8A5D8', '#B9CBEA'] },
  { id: 'mint-garden', label: 'Mint Garden', swatches: ['#F1F8EE', '#426B50', '#A8CBB0', '#E3D590'] },
  { id: 'high-contrast', label: 'High-Contrast Study', swatches: ['#FFFFFF', '#193D70', '#F0F4FA', '#26384D'] },
  { id: 'ocean', label: 'Ocean', swatches: ['#F7F8FB', '#355C85', '#EAF0F7', '#D7E1EF'] },
  { id: 'forest', label: 'Forest', swatches: ['#F1F8F1', '#49785D', '#E5F1E7', '#D7E5D6'] },
  { id: 'plum', label: 'Plum', swatches: ['#F7F2FB', '#71558C', '#EEE5F4', '#E5D7E8'] },
  { id: 'custom', label: 'Custom Theme', swatches: ['#F7F3FF', '#FFF9F0', '#51416F', '#877792'] },
];

function parseHexColor(value) {
  if (!/^#[\da-f]{6}$/i.test(value)) return null;
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function luminance(color) {
  const channels = parseHexColor(color);
  if (!channels) return null;
  return channels
    .map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

export function contrastRatio(first, second) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  if (firstLuminance === null || secondLuminance === null) return 0;
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

export function customThemeError(theme) {
  const colors = Object.values(theme || {});
  if (colors.length !== Object.keys(DEFAULT_CUSTOM_THEME).length || colors.some((color) => !parseHexColor(color))) {
    return 'Choose a valid color for each custom theme setting.';
  }
  for (const foreground of ['text', 'secondaryText', 'accent']) {
    for (const background of ['background', 'surface']) {
      if (contrastRatio(theme[foreground], theme[background]) < 4.5) {
        return 'Text and accent colors must have at least 4.5:1 contrast on both backgrounds.';
      }
    }
  }
  if (contrastRatio(theme.border, theme.background) < 3 || contrastRatio(theme.border, theme.surface) < 3) {
    return 'The border color must have at least 3:1 contrast against both backgrounds.';
  }
  if (Math.max(contrastRatio('#FFFFFF', theme.button), contrastRatio('#1D2333', theme.button)) < 4.5) {
    return 'Choose a button color that provides at least 4.5:1 contrast with white or dark button text.';
  }
  return '';
}

export function customButtonTextColor(buttonColor) {
  return contrastRatio('#FFFFFF', buttonColor) >= contrastRatio('#1D2333', buttonColor) ? '#FFFFFF' : '#1D2333';
}
