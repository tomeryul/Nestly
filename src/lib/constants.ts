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

// Meals in the order of a day, and how a day's meal is named on its own
// (the schedule shows "ארוחת ערב: שקשוקה").
export const MEAL_ORDER = ["breakfast", "lunch", "dinner", "other"] as const;
/** What a dish is eaten as. A dish set to neither (null) is eaten as either. */
export const DISH_MEALS = { lunch: "צהריים", dinner: "ערב" } as const;
export type DishMeal = keyof typeof DISH_MEALS;
/** Whether a dish belongs at a meal. Only lunch and dinner are told apart; any dish fits any other meal. */
export const dishFits = (dish: { meal_type?: string | null }, meal: string | null | undefined) =>
  !dish.meal_type || !(meal === "lunch" || meal === "dinner") || dish.meal_type === meal;
/**
 * Whether the dishes table has its meal_type column yet (migration 0042): rows
 * read with select("*") carry the key once it does. Until then the app neither
 * shows the setting nor writes it, so nothing fails in the meantime. Ask it of
 * rows read from the database, not of rows made on the phone.
 */
export const hasDishMeal = (dishes: object[]) => dishes.some((d) => "meal_type" in d);
export const MEAL_LABEL: Record<string, string> = { breakfast: "ארוחת בוקר", lunch: "ארוחת צהריים", dinner: "ארוחת ערב", other: "ארוחה" };

export const TASK_CATEGORIES = {
  general: { label: "כללי", color: "#64748b" },
  shopping: { label: "קניות", color: "#0d9488" },
  cooking: { label: "בישול", color: "#ea580c" },
  custom: { label: "מותאם", color: "#7c3aed" },
} as const;

export type TaskCategory = keyof typeof TASK_CATEGORIES;
