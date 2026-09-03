export const CATEGORIES = [
  "Tech", "Gaming", "Lifestyle", "Fashion", "Beauty", "Fitness", "Health",
  "Wellness", "Food", "Coffee", "Travel", "Pets", "Parenting", "Dad",
  "Home", "Design", "DIY", "Garden", "Outdoors", "Sports", "Auto",
  "Finance", "Business", "Legal", "Real Estate", "Education", "Music",
  "Comedy", "Entertainment", "Photography", "Art", "Books", "Wedding",
  "Baby", "Sustainability", "Luxury", "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

const CATEGORY_SYNONYMS: Record<string, Category> = {
  dog: "Pets", dogs: "Pets", cat: "Pets", cats: "Pets", puppy: "Pets",
  kitten: "Pets", pet: "Pets", pets: "Pets", animal: "Pets", animals: "Pets",
  mom: "Parenting", mother: "Parenting", motherhood: "Parenting",
  momlife: "Parenting", family: "Parenting", kids: "Parenting",
  toddler: "Parenting", newborn: "Baby", pregnancy: "Baby", nursery: "Baby",
  dadlife: "Dad", father: "Dad", fatherhood: "Dad", dads: "Dad", girldad: "Dad",
  interior: "Design", "interior design": "Design", decor: "Design",
  decorating: "Design", architecture: "Design", graphic: "Design",
  furniture: "Home", organization: "Home", organizing: "Home", cleaning: "Home",
  "home improvement": "DIY", renovation: "DIY", reno: "DIY",
  woodworking: "DIY", contractor: "DIY", tools: "DIY",
  plants: "Garden", gardening: "Garden", vanlife: "Travel", hotel: "Travel",
  flight: "Travel", camping: "Outdoors", hiking: "Outdoors",
  adventure: "Outdoors", fishing: "Outdoors", hunting: "Outdoors",
  cooking: "Food", recipe: "Food", recipes: "Food", baking: "Food",
  chef: "Food", restaurant: "Food", barista: "Coffee", espresso: "Coffee",
  makeup: "Beauty", skincare: "Beauty", hair: "Beauty", nails: "Beauty",
  style: "Fashion", outfit: "Fashion", ootd: "Fashion", thrift: "Fashion",
  gym: "Fitness", workout: "Fitness", running: "Fitness", yoga: "Fitness",
  nutrition: "Health", "mental health": "Wellness", selfcare: "Wellness",
  money: "Finance", investing: "Finance", crypto: "Finance",
  budgeting: "Finance", realtor: "Real Estate", property: "Real Estate",
  mortgage: "Real Estate", lawyer: "Legal", attorney: "Legal", law: "Legal",
  entrepreneur: "Business", startup: "Business", marketing: "Business",
  photo: "Photography", videography: "Photography", filmmaking: "Photography",
  painting: "Art", craft: "Art", crafts: "Art", dance: "Entertainment",
  movie: "Entertainment", film: "Entertainment", book: "Books",
  reading: "Books", booktok: "Books", bride: "Wedding", eco: "Sustainability",
  sustainable: "Sustainability", zerowaste: "Sustainability",
  car: "Auto", cars: "Auto", truck: "Auto", golf: "Sports",
  basketball: "Sports", football: "Sports", soccer: "Sports",
};

/** Fuzzy-match free text to a category; defaults to "Other". */
export function matchCategory(text: string | null | undefined): Category {
  const t = (text || "").toString().trim().toLowerCase();
  if (!t) return "Other";
  for (const c of CATEGORIES) if (c.toLowerCase() === t) return c;
  for (const c of CATEGORIES) {
    const cl = c.toLowerCase();
    if (cl.indexOf(t) === 0 || t.indexOf(cl) === 0) return c;
  }
  if (Object.prototype.hasOwnProperty.call(CATEGORY_SYNONYMS, t)) return CATEGORY_SYNONYMS[t];
  let best: Category | "" = "", bestLen = 0;
  for (const k of Object.keys(CATEGORY_SYNONYMS)) {
    if (k.length > bestLen && t.includes(k)) { best = CATEGORY_SYNONYMS[k]; bestLen = k.length; }
  }
  if (best) return best;
  for (const c of CATEGORIES) {
    const cl = c.toLowerCase();
    if (cl !== "other" && t.includes(cl)) return c;
  }
  return "Other";
}
