export interface GamePackage {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  value: number; // e.g. 86 (diamonds/crystals)
  unit: string;  // e.g. "Diamonds", "UC", "Crystals"
  popular?: boolean;
}

export interface GameInfo {
  id: string;
  name: string;
  category: string; // "Mobile Games", "PC Games", etc.
  bannerUrl: string;
  iconUrl: string;
  idLabel: string; // e.g. "User ID"
  zoneLabel?: string; // e.g. "Zone ID"
  idPlaceholder: string;
  zonePlaceholder?: string;
  packages: GamePackage[];
}

export type PaymentType = "wallet" | "bank" | "card" | "qr";

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentType;
  logo: string;
  instructions?: string;
  accountNumber?: string;
  accountName?: string;
  feePercentage: number;
}

export type OrderStatus = "awaiting_payment" | "verifying" | "processing" | "completed" | "failed";

export interface Order {
  id: string;
  gameId: string;
  gameName: string;
  playerId: string;
  playerZoneId?: string;
  packageId: string;
  packageName: string;
  price: number;
  paymentMethodId: string;
  paymentMethodName: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  transactionId?: string; // Proof of payment
  senderNumber?: string;  // For wallets
  recipientNumber?: string; // Target store number
  cardLast4?: string;
  receiptUrl?: string; // Uploaded payment receipt / proof of payment
  estimatedDelivery?: string;
  userId?: string;
  username?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  walletBalance?: number; // Optional or default to 0
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
}

export interface CarouselItem {
  id: string;
  type: "image" | "video";
  url: string;
  title?: string;
  subtitle?: string;
  linkUrl?: string;
  active: boolean;
  order: number;
}

