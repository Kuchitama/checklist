import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui の部品が使うクラス結合。Tailwind の競合するクラスは後勝ちで解決する */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
