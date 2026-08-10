import { Outlet } from "react-router-dom";
import Header from "@/components/Header";

export function Layout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
