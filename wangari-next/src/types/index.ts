export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: string;
  avatar?: string;
  createdAt: string;
}

export interface Farm {
  id: number;
  name: string;
  location?: string;
  county?: string;
  farmType?: string;
  ownerId: number;
  createdAt: string;
}

export interface Flock {
  id: number;
  farmId: number;
  name: string;
  breed?: string;
  initialCount: number;
  currentCount: number;
  mortality: number;
  hatchDate?: string;
  status: string;
  type?: string;
  createdBy?: number;
  createdAt: string;
}

export interface DailyProduction {
  id: number;
  flockId: number;
  farmId: number;
  date: string;
  eggsCollected: number;
  mortality: number;
  feedUsed: number;
  notes?: string;
  createdAt: string;
}

export interface Vaccination {
  id: number;
  flockId: number;
  vaccineName: string;
  scheduledDate: string;
  completedDate?: string;
  status: string;
  notes?: string;
  createdAt: string;
}

export interface Transaction {
  id: number;
  farmId: number;
  type: string;
  category?: string;
  amount: number;
  description?: string;
  date: string;
  paymentMethod?: string;
  reference?: string;
  createdBy?: number;
  createdAt: string;
}

export interface InventoryItem {
  id: number;
  farmId: number;
  itemName: string;
  category?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  reorderLevel: number;
  supplier?: string;
  createdAt: string;
}

export interface Customer {
  id: number;
  farmId: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  totalCredit: number;
  createdAt: string;
}

export interface Sale {
  id: number;
  farmId: number;
  customerId?: number;
  items: SaleItem[];
  totalAmount: number;
  paymentStatus: string;
  amountPaid: number;
  saleDate: string;
  createdBy?: number;
  createdAt: string;
  customer?: Customer;
}

export interface SaleItem {
  item: string;
  qty: number;
  price: number;
}

export interface Credit {
  id: number;
  saleId?: number;
  customerId: number;
  farmId: number;
  amountOwed: number;
  amountPaid: number;
  dueDate?: string;
  status: string;
  createdAt: string;
}

export interface Worker {
  id: number;
  farmId: number;
  name: string;
  phone?: string;
  role?: string;
  dailyWage?: number;
  status: string;
  hiredDate?: string;
  createdBy?: number;
  createdAt: string;
}

export interface Attendance {
  id: number;
  workerId: number;
  farmId: number;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  notes?: string;
  createdAt: string;
}

export interface DashboardData {
  totalFlocks: number;
  totalBirds: number;
  eggsToday: number;
  mortalityToday: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  /** Last six calendar months for the Revenue Overview, keyed YYYY-MM. */
  revenueSeries?: { key: string; income: number; expenses: number }[];
  pendingVaccinations: number;
  lowStockItems: number;
  recentTransactions: Transaction[];
  upcomingVaccinations: Vaccination[];
}

export interface ApiError {
  error: string;
  details?: string;
}
