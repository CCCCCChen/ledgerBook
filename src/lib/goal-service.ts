export interface SavingsGoal {
  targetAmount: number;
  deadline: string;
  createdAt: string;
}

const STORAGE_KEY = 'ledgerbook_savings_goal_v1';

export function loadSavingsGoal(): SavingsGoal | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.targetAmount === 'number' &&
      typeof parsed.deadline === 'string' &&
      parsed.targetAmount > 0
    ) {
      return parsed as SavingsGoal;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSavingsGoal(goal: SavingsGoal): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goal));
}

export function deleteSavingsGoal(): void {
  localStorage.removeItem(STORAGE_KEY);
}
