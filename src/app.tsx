import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import TransactionsPage from "@/pages/TransactionsPage/TransactionsPage";
import BudgetsPage from "@/pages/BudgetsPage/BudgetsPage";
import StatisticsPage from "@/pages/StatisticsPage/StatisticsPage";
import AccountsPage from "@/pages/AccountsPage/AccountsPage";
import ForecastPage from "@/pages/ForecastPage/ForecastPage";
import CreditDebtPage from "@/pages/CreditDebtPage/CreditDebtPage";
import CashFlowPage from "@/pages/CashFlowPage/CashFlowPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TransactionsPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="credit-debt" element={<CreditDebtPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="cash-flow" element={<CashFlowPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
