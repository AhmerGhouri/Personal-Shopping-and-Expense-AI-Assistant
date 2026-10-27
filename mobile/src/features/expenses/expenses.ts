import { useCallback, useEffect, useRef, useState } from 'react';
import { Dirs, FileSystem } from 'react-native-file-access';

export const CATEGORIES = ['Shopping', 'Food', 'Groceries', 'Transport', 'Travel', 'Bills', 'Health', 'Entertainment', 'Education', 'Other'] as const;
export type Category = typeof CATEGORIES[number];

export const categoryColors: Record<Category, string> = {
  Shopping: '#7C8CFF', Food: '#FF9F6B', Groceries: '#4ADE9A', Transport: '#5CC8FF', Travel: '#3DD6B5', Bills: '#F5C46B',
  Health: '#FF7A85', Entertainment: '#C58CFF', Education: '#6BE3D6', Other: '#8E9AB0',
};

export type Expense = {
  id: string;
  title: string;
  amount: number;
  category: Category;
  /** ISO timestamp. */
  date: string;
  source: 'purchase' | 'booking' | 'assistant' | 'manual';
  store?: string;
  link?: string;
  thumbnail?: string;
  note?: string;
};

export type NewExpense = Omit<Expense, 'id' | 'date'> & { date?: string };

const expensesPath = `${Dirs.DocumentDir}/expenses.json`;

/** "Rs 1,234,567" without relying on Intl, which Hermes may ship without full locale data. */
export function formatMoney(amount: number): string {
  const [whole, fraction] = Math.abs(amount).toFixed(amount % 1 ? 2 : 0).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}Rs ${grouped}${fraction ? `.${fraction}` : ''}`;
}

export function parsePrice(price: string): number | undefined {
  const digits = price.replace(/[^\d.]/g, '');
  const value = Number(digits);
  return digits && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function asCategory(value: unknown): Category {
  return CATEGORIES.find(category => category === value) ?? 'Other';
}

/** Expenses are stored only on this phone, as a small JSON file. */
export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef<Expense[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (await FileSystem.exists(expensesPath)) {
          const saved = JSON.parse(await FileSystem.readFile(expensesPath));
          if (Array.isArray(saved) && active) { latest.current = saved; setExpenses(saved); }
        }
      } catch { /* A damaged file starts a fresh list rather than crashing the app. */ }
      if (active) setLoaded(true);
    })();
    return () => { active = false; };
  }, []);

  const persist = useCallback((next: Expense[]) => {
    latest.current = next;
    setExpenses(next);
    void FileSystem.writeFile(expensesPath, JSON.stringify(next)).catch(() => {});
  }, []);

  const add = useCallback((expense: NewExpense) => {
    const entry: Expense = {
      ...expense, title: expense.title.trim(), date: expense.date ?? new Date().toISOString(),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    persist([entry, ...latest.current].sort((a, b) => b.date.localeCompare(a.date)));
    return entry;
  }, [persist]);

  const remove = useCallback((id: string) => persist(latest.current.filter(expense => expense.id !== id)), [persist]);

  return { expenses, loaded, add, remove };
}
