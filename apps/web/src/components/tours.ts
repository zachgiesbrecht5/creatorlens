import type { TourStep } from "@/components/Tour";
export const HOME_TOUR: TourStep[] = [
  { key: "search", title: "Print any creator", body: "Type a handle or a name. In about twenty seconds you get every brand that has paid them, the post that proves it, and who to email." },
  { key: "brand", title: "Or start from a brand", body: "See who a brand books, how often, and when. Good for a brand you already know is spending." },
  { key: "journey", title: "Four steps to your first pitch", body: "Add your roster, meet the neighborhood, pitch a brand, then print anyone. This rail follows you until you're through." },
  { key: "drop", title: "Your morning drop", body: "Three prints in your lane, picked overnight from your roster. New every day, free to open." },
];
export const PRINT_TOUR: TourStep[] = [
  { key: "actions", title: "Re-print, watch, neighbors", body: "Re-print pulls a fresh scan. Watch re-prints weekly and flags new brands. Neighbors finds three creators next to this one and prints them free." },
  { key: "map", title: "The map", body: "Two years of deals by brand. A line means a repeat partner. Hover a dot for why the brand booked them then." },
  { key: "rows", title: "Click a brand", body: "The row opens with the contact, the evidence post, and a Pitch button. The email lands in your Gmail drafts, written for your creator." },
];
export const START_TOUR: TourStep[] = [
  { key: "add", title: "Who do you represent?", body: "Type a creator's handle. We fill in the name, size and photo from the platform." },
  { key: "machine", title: "Then the printer goes looking", body: "Three creators in their lane, printed for free. Each card shows how many brands pay them." },
];

export const CREATOR_TOUR: TourStep[] = [
  { key: "map", title: "Who has paid them", body: "Two years of their disclosed deals. Hover a dot for why the brand booked them then." },
  { key: "lane", title: "Missing opportunities", body: "Brands paying other creators in this lane that haven't paid yours. Ranked by how many lane creators they book. Green means a contact is already on file." },
  { key: "row", title: "Open a row to pitch", body: "The proof creators, the contact, and Pitch, with your creator already selected. Two clicks to a Gmail draft." },
];
