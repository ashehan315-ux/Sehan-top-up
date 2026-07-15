export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  bgDark: string;
  bgCard: string;
  accent: string;
  accentHover: string;
  accentGlow: string;
  accentLight: string;
  accentText: string;
  textGlow: string;
  secondary: string;
  
  // Immersive Look and Feel modifiers
  fontFamily: string;
  borderRadius: string;
  textColor: string;
  textMuted: string;
  borderColor: string;
  glassBlur: string;
  shadowGlow: string;
  crtEffect: "none" | "scanline";
  cardClass: string;
  buttonClass: string;
  tagClass: string;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "cyberpunk",
    name: "⚡ Cyberpunk Neon",
    description: "Sleek synthwave dark mode with glowing cyan and hot pink neon highlights.",
    bgDark: "#04040a",
    bgCard: "#0c0c14",
    accent: "#06b6d4",
    accentHover: "#22d3ee",
    accentGlow: "rgba(6,182,212,0.4)",
    accentLight: "rgba(6,182,212,0.15)",
    accentText: "#000000",
    textGlow: "rgba(6,182,212,0.5)",
    secondary: "#ec4899",
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
    borderRadius: "14px",
    textColor: "#f1f5f9",
    textMuted: "#94a3b8",
    borderColor: "rgba(255, 255, 255, 0.08)",
    glassBlur: "8px",
    shadowGlow: "0 0 20px rgba(6,182,212,0.15)",
    crtEffect: "none",
    cardClass: "bg-[#0c0c14]/90 backdrop-blur-md border border-white/10 hover:border-cyan-500/30 transition-all duration-300 shadow-[0_4px_24px_rgba(0,0,0,0.6)]",
    buttonClass: "bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all",
    tagClass: "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold",
  },
  {
    id: "retro-arcade",
    name: "👾 Retro Arcade 80s",
    description: "An immersive 8-bit visual experience with scanning lines, sharp edges, and 100% solid colors.",
    bgDark: "#000000",
    bgCard: "#080808",
    accent: "#39ff14",
    accentHover: "#7eff44",
    accentGlow: "rgba(57,255,20,0.6)",
    accentLight: "rgba(57,255,20,0.15)",
    accentText: "#000000",
    textGlow: "rgba(57,255,20,0.8)",
    secondary: "#f000ff",
    fontFamily: "'JetBrains Mono', monospace",
    borderRadius: "0px",
    textColor: "#39ff14",
    textMuted: "#888888",
    borderColor: "#39ff14",
    glassBlur: "0px",
    shadowGlow: "none",
    crtEffect: "scanline",
    cardClass: "bg-black border-2 border-[#39ff14] hover:bg-[#39ff14]/5 transition-colors shadow-[4px_4px_0px_#f000ff]",
    buttonClass: "bg-black border-2 border-[#39ff14] hover:bg-[#39ff14] hover:text-black text-[#39ff14] font-black uppercase tracking-wider transition-colors shadow-[3px_3px_0px_#f000ff]",
    tagClass: "border-2 border-dashed border-[#f000ff] text-[#f000ff] font-bold uppercase",
  },
  {
    id: "luxury-gold",
    name: "⚜️ Royal Gold & Velvet",
    description: "Elegant luxury theme featuring classic serif typography, golden accents, and warm velvet tones.",
    bgDark: "#0d0b09",
    bgCard: "#16130f",
    accent: "#eab308",
    accentHover: "#facc15",
    accentGlow: "rgba(234,179,8,0.3)",
    accentLight: "rgba(234,179,8,0.12)",
    accentText: "#000000",
    textGlow: "rgba(234,179,8,0.4)",
    secondary: "#d97706",
    fontFamily: "'Playfair Display', 'Inter', serif",
    borderRadius: "24px",
    textColor: "#fef3c7",
    textMuted: "#d97706",
    borderColor: "rgba(234,179,8,0.2)",
    glassBlur: "4px",
    shadowGlow: "0 8px 30px rgba(234,179,8,0.08)",
    crtEffect: "none",
    cardClass: "bg-[#16130f] border border-amber-500/20 rounded-[24px] hover:border-amber-400/40 transition-all shadow-[0_12px_40px_rgba(0,0,0,0.5)]",
    buttonClass: "bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-extrabold shadow-[0_4px_15px_rgba(234,179,8,0.2)] transition-all",
    tagClass: "bg-amber-500/10 border border-amber-500/30 text-amber-400 font-serif font-bold italic",
  },
  {
    id: "frost-glass",
    name: "❄️ Glacier Frost Glass",
    description: "Immersive frosted glassmorphism style with heavy blurring, floating orbs, and arctic accents.",
    bgDark: "#020712",
    bgCard: "rgba(15, 23, 42, 0.45)",
    accent: "#38bdf8",
    accentHover: "#7dd3fc",
    accentGlow: "rgba(56,189,248,0.4)",
    accentLight: "rgba(56,189,248,0.1)",
    accentText: "#010409",
    textGlow: "rgba(56,189,248,0.3)",
    secondary: "#a855f7",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "18px",
    textColor: "#f0f9ff",
    textMuted: "#a5f3fc",
    borderColor: "rgba(255, 255, 255, 0.12)",
    glassBlur: "18px",
    shadowGlow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
    crtEffect: "none",
    cardClass: "bg-white/5 backdrop-blur-[18px] border border-white/10 hover:bg-white/8 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
    buttonClass: "bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold backdrop-blur-md shadow-lg transition-all",
    tagClass: "bg-white/5 border border-white/10 text-[#38bdf8] font-bold",
  },
  {
    id: "light-premium",
    name: "🍦 Minimalist Light Premium",
    description: "A bright, highly readable style with pure white cards, crisp shadows, and a clean luxury aesthetic.",
    bgDark: "#f4f5f7",
    bgCard: "#ffffff",
    accent: "#0f172a",
    accentHover: "#334155",
    accentGlow: "rgba(15,23,42,0.15)",
    accentLight: "rgba(15,23,42,0.06)",
    accentText: "#ffffff",
    textGlow: "rgba(15,23,42,0.1)",
    secondary: "#4f46e5",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "12px",
    textColor: "#0f172a",
    textMuted: "#475569",
    borderColor: "#e2e8f0",
    glassBlur: "0px",
    shadowGlow: "0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05)",
    crtEffect: "none",
    cardClass: "bg-white border border-slate-200 hover:border-slate-300 transition-all shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05)] text-slate-800",
    buttonClass: "bg-[#0f172a] hover:bg-[#334155] text-white font-bold transition-all shadow-[0_2px_8px_rgba(15,23,42,0.15)]",
    tagClass: "bg-slate-100 border border-slate-200 text-slate-800 font-bold",
  }
];

export function applyTheme(themeId: string) {
  const selected = THEMES.find(t => t.id === themeId) || THEMES[0];
  const root = document.documentElement;
  
  root.style.setProperty("--theme-bg-dark", selected.bgDark);
  root.style.setProperty("--theme-bg-card", selected.bgCard);
  root.style.setProperty("--theme-accent", selected.accent);
  root.style.setProperty("--theme-accent-hover", selected.accentHover);
  root.style.setProperty("--theme-accent-glow", selected.accentGlow);
  root.style.setProperty("--theme-accent-light", selected.accentLight);
  root.style.setProperty("--theme-accent-text", selected.accentText);
  root.style.setProperty("--theme-text-glow", selected.textGlow);
  root.style.setProperty("--theme-secondary", selected.secondary);
  
  // Apply full appearance variables
  root.style.setProperty("--theme-font-family", selected.fontFamily);
  root.style.setProperty("--theme-border-radius", selected.borderRadius);
  root.style.setProperty("--theme-text-primary", selected.textColor);
  root.style.setProperty("--theme-text-muted", selected.textMuted);
  root.style.setProperty("--theme-border-color", selected.borderColor);
  root.style.setProperty("--theme-glass-blur", selected.glassBlur);
  root.style.setProperty("--theme-shadow-glow", selected.shadowGlow);
}
