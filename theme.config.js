/**
 * ألوان ونس من دليل الهوية البصرية v1.0 (نوفمبر 2026).
 * داكن: خلفية #000000 · سطح #111116 · سطح ثاني #1B1B22 · حدود #2A2A33 · نص #FFFFFF · ثانوي #9A9AA6 · ذهبي #E8C96A
 * فاتح: خلفية #FAF8F3 · سطح #FFFFFF · سطح ثاني #F1EDE2 · حدود #E2DCCB · نص #14141A · ثانوي #6B6B76 · ذهبي للنص #8A6A12
 * @type {const}
 */
const themeColors = {
  primary: { light: '#8A6A12', dark: '#E8C96A' },
  background: { light: '#FAF8F3', dark: '#000000' },
  surface: { light: '#FFFFFF', dark: '#111116' },
  foreground: { light: '#14141A', dark: '#FFFFFF' },
  muted: { light: '#6B6B76', dark: '#9A9AA6' },
  border: { light: '#E2DCCB', dark: '#2A2A33' },
  success: { light: '#5BC98A', dark: '#5BC98A' },
  warning: { light: '#E8A25A', dark: '#E8A25A' },
  error: { light: '#D93B3B', dark: '#E5484D' },
  accentSoft: { light: '#F1EDE2', dark: '#2B2616' },
};

module.exports = { themeColors };
