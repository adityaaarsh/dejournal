import {
  Baby,
  Book,
  Bus,
  Car,
  CircleDot,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PawPrint,
  Pill,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  Smartphone,
  Utensils,
  Wifi,
  type LucideIcon,
} from 'lucide-react'

/** Icon names stored on ExpenseCategory.icon → lucide components. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  bus: Bus,
  'shopping-bag': ShoppingBag,
  'graduation-cap': GraduationCap,
  receipt: Receipt,
  clapperboard: Clapperboard,
  'heart-pulse': HeartPulse,
  'circle-dot': CircleDot,
  car: Car,
  coffee: Coffee,
  gift: Gift,
  house: House,
  plane: Plane,
  shirt: Shirt,
  smartphone: Smartphone,
  wifi: Wifi,
  dumbbell: Dumbbell,
  'paw-print': PawPrint,
  baby: Baby,
  fuel: Fuel,
  pill: Pill,
  book: Book,
}

/** Icons offered when creating a custom category. */
export const PICKABLE_ICONS = ['coffee', 'car', 'fuel', 'house', 'wifi', 'smartphone', 'shirt', 'gift', 'plane', 'dumbbell', 'pill', 'book', 'paw-print', 'baby', 'circle-dot']

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || CircleDot
}

export function CategoryIcon({ name, size = 16, className }: { name?: string; size?: number; className?: string }) {
  const Icon = categoryIcon(name)
  return <Icon size={size} strokeWidth={1.8} className={className} aria-hidden />
}
