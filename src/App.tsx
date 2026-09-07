import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HashRouter, Routes, Route } from "react-router-dom";
import Study from "./pages/Study";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/AdminDashboard";

const App = () => {
  // A plain-path /admin visit (no hash) is redirected to the hash route so it
  // works on static hosting.
  useEffect(() => {
    if (window.location.pathname === '/admin' && !window.location.hash) {
      window.location.replace('/#/admin');
    }
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Study />} />
          {/* AdminDashboard gates itself: it asks for the admin API key and
              verifies it against the backend before showing any data */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  );
};

export default App;
