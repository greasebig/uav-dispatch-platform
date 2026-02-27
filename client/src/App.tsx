import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import Home from "./pages/Home";

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Home} />

      {/* Customer routes */}
      {user?.role === "customer" && (
        <>
          <Route path="/customer/dashboard" component={() => <div>Customer Dashboard</div>} />
          <Route path="/customer/publish" component={() => <div>Publish Task</div>} />
          <Route path="/customer/tasks" component={() => <div>My Tasks</div>} />
        </>
      )}

      {/* Pilot routes */}
      {user?.role === "pilot" && (
        <>
          <Route path="/pilot/dashboard" component={() => <div>Pilot Dashboard</div>} />
          <Route path="/pilot/tasks" component={() => <div>Available Tasks</div>} />
          <Route path="/pilot/profile" component={() => <div>My Profile</div>} />
        </>
      )}

      {/* Admin routes */}
      {user?.role === "admin" && (
        <>
          <Route path="/admin/dashboard" component={() => <div>Admin Dashboard</div>} />
          <Route path="/admin/users" component={() => <div>User Management</div>} />
          <Route path="/admin/tasks" component={() => <div>Task Management</div>} />
        </>
      )}

      {/* Fallback */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
