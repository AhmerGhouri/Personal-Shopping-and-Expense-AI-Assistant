import { ApiError } from './assistant.ts';

export const EXPENSE_CATEGORIES = ['Shopping', 'Food', 'Groceries', 'Transport', 'Travel', 'Bills', 'Health', 'Entertainment', 'Education', 'Other'] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

/** Expenses live on the phone; the app sends recent ones so the assistant can answer spending questions. */
export interface Expense {
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
}

const MAX_EXPENSES = 150;

export function validateExpenses(value: unknown): Expense[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_EXPENSES) throw new ApiError(400, `expenses must be a list of at most ${MAX_EXPENSES} items.`);
  return value.map(item => {
    const expense = item as Partial<Expense> | null;
    if (!expense || typeof expense.title !== 'string' || !expense.title.trim() ||
        typeof expense.amount !== 'number' || !Number.isFinite(expense.amount) || expense.amount < 0 ||
        !EXPENSE_CATEGORIES.includes(expense.category as ExpenseCategory) ||
        typeof expense.date !== 'string' || Number.isNaN(Date.parse(expense.date))) {
      throw new ApiError(400, 'Invalid expense.');
    }
    return { title: expense.title.trim().slice(0, 120), amount: expense.amount, category: expense.category!, date: expense.date.slice(0, 10) };
  });
}

export function describeExpenses(expenses: Expense[]): string {
  if (!expenses.length) return 'The user has not logged any expenses yet.';
  return expenses.map(expense => `${expense.date} | ${expense.category} | ${expense.title} | ${expense.amount}`).join('\n');
}

export function normalizeCategory(value: unknown): ExpenseCategory {
  const match = EXPENSE_CATEGORIES.find(category => typeof value === 'string' && category.toLowerCase() === value.trim().toLowerCase());
  return match ?? 'Other';
}
