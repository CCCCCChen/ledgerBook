import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import TransactionsPage from "@/pages/TransactionsPage/TransactionsPage";
import BudgetsPage from "@/pages/BudgetsPage/BudgetsPage";
import StatisticsPage from "@/pages/StatisticsPage/StatisticsPage";
import AccountsPage from "@/pages/AccountsPage/AccountsPage";
import ForecastPage from "@/pages/ForecastPage/ForecastPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TransactionsPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="accounts" element={<AccountsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
