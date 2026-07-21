import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import TransactionsPage from "@/pages/TransactionsPage/TransactionsPage";
import BudgetsPage from "@/pages/BudgetsPage/BudgetsPage";
import DashboardPage from "@/pages/DashboardPage/DashboardPage";
import AccountsPage from "@/pages/AccountsPage/AccountsPage";
import ForecastPage from "@/pages/ForecastPage/ForecastPage";
import CreditDebtPage from "@/pages/CreditDebtPage/CreditDebtPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TransactionsPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="credit-debt" element={<CreditDebtPage />} />
        <Route path="accounts" element={<AccountsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
