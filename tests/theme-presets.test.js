import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio,
  customButtonTextColor,
  customThemeError,
  DEFAULT_CUSTOM_THEME,
  THEME_PRESETS,
} from '../src/utils/themePresets.js';

test('theme presets have unique ids and complete visual previews', () => {
  const ids = THEME_PRESETS.map((theme) => theme.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['soft-pastel', 'cozy-bear', 'calm-ocean', 'warm-study', 'lavender-focus', 'mint-garden', 'high-contrast', 'custom']) {
    assert.ok(ids.includes(id), `Missing theme: ${id}`);
  }
  assert.ok(THEME_PRESETS.every((theme) => theme.swatches.length >= 3));
});

test('custom theme validates readable text, accent, border, and button colors', () => {
  assert.equal(customThemeError(DEFAULT_CUSTOM_THEME), '');
  assert.ok(contrastRatio(DEFAULT_CUSTOM_THEME.text, DEFAULT_CUSTOM_THEME.surface) >= 4.5);
  assert.ok(contrastRatio(DEFAULT_CUSTOM_THEME.border, DEFAULT_CUSTOM_THEME.surface) >= 3);
  assert.ok(['#FFFFFF', '#1D2333'].includes(customButtonTextColor(DEFAULT_CUSTOM_THEME.button)));
});

test('custom theme rejects insufficient contrast and malformed colors', () => {
  assert.match(customThemeError({ ...DEFAULT_CUSTOM_THEME, text: '#EEEEEE' }), /4\.5:1/);
  assert.match(customThemeError({ ...DEFAULT_CUSTOM_THEME, border: '#FFFFFF' }), /3:1/);
  assert.match(customThemeError({ ...DEFAULT_CUSTOM_THEME, accent: 'purple' }), /valid color/);
  assert.equal(contrastRatio('#FFFFFF', 'not-a-color'), 0);
});

test('button text color chooses the readable black or white option', () => {
  for (const buttonColor of ['#193D70', '#F2C34E']) {
    const foreground = customButtonTextColor(buttonColor);
    assert.ok(contrastRatio(foreground, buttonColor) >= 4.5);
  }
});
