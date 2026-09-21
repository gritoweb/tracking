// The shared tokens switch on a .dark class; the popup follows the browser's colour scheme.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const apply = () => document.documentElement.classList.toggle("dark", dark.matches);
apply();
dark.addEventListener("change", apply);
