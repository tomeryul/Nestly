export const AREAS = {
  shopping: "ניהול קניות",
  cooking: "ניהול בישולים",
  schedule: "ניהול לוז",
  cleaning: "ניהול ניקיון",
} as const;

export type AreaKey = keyof typeof AREAS;

export const CATEGORIES = [
  "כללי",
  "ירקות ופירות",
  "מוצרי חלב",
  "בשר ודגים",
  "מאפייה",
  "יבשים",
  "קפואים",
  "ניקיון",
  "טואלטיקה",
] as const;

// Sunday-first, matching Postgres extract(dow) 0..6
export const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;
export const DAYS_HE_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

export const MEAL_TYPES = {
  breakfast: "בוקר",
  lunch: "צהריים",
  dinner: "ערב",
  other: "אחר",
} as const;

export const TASK_CATEGORIES = {
  general: { label: "כללי", color: "#64748b" },
  shopping: { label: "קניות", color: "#0d9488" },
  cooking: { label: "בישול", color: "#ea580c" },
  custom: { label: "מותאם", color: "#7c3aed" },
} as const;

export type TaskCategory = keyof typeof TASK_CATEGORIES;
