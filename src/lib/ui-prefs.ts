/**
 * Browser-saved UI preferences, applied to <html> before first paint.
 * Kept out of the 'use client' toggles so the server layout can inline the script as plain text.
 */
/** Light is the default theme; v2 drops choices saved while dark was the default. */
export const THEME_KEY = 'tier2-theme-v2';
export const SIDEBAR_KEY = 'tier2-sidebar';
export const bootScript =
  `try{var d=document.documentElement;` +
  `if(localStorage.getItem('${THEME_KEY}')==='dark')delete d.dataset.theme;` +
  `if(localStorage.getItem('${SIDEBAR_KEY}')==='collapsed')d.dataset.sidebar='collapsed'}catch(e){}`;
