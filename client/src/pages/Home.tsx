import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Plane, Users, TrendingUp, MapPin, Shield, Zap } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      if (user?.role === "customer") {
        setLocation("/customer/dashboard");
      } else if (user?.role === "pilot") {
        setLocation("/pilot/dashboard");
      } else if (user?.role === "admin") {
        setLocation("/admin/dashboard");
      }
    } else {
      window.location.href = getLoginUrl();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Plane className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold text-foreground">UAV Dispatch</span>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted-foreground">Welcome, {user?.name}</span>
                <Button variant="outline" size="sm" onClick={handleGetStarted}>
                  Dashboard
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => (window.location.href = getLoginUrl())}>
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      <section className="container py-20 md:py-32">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold text-foreground">
              Professional UAV Dispatch
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-600">
                Platform
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Connect skilled drone pilots with customers. Manage tasks, track flights, and ensure quality service delivery.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={handleGetStarted} className="text-lg px-8">
              Get Started
            </Button>
            <Button variant="outline" size="lg" className="text-lg px-8">
              Learn More
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          {[
            { icon: Users, label: "Active Pilots", value: "500+" },
            { icon: TrendingUp, label: "Tasks Completed", value: "10K+" },
            { icon: Shield, label: "Success Rate", value: "99.8%" },
          ].map((stat, idx) => (
            <div key={idx} className="card p-8 text-center hover:shadow-lg transition-shadow">
              <stat.icon className="w-12 h-12 text-primary mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">{stat.label}</p>
              <p className="text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white dark:bg-slate-800 py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">Powerful Features</h2>
            <p className="text-lg text-muted-foreground">Everything you need to manage UAV operations</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: MapPin, title: "Smart Dispatch", description: "AI-powered task allocation" },
              { icon: Zap, title: "Real-time Tracking", description: "Monitor flights in real-time" },
              { icon: Shield, title: "Compliance & Safety", description: "Built-in safety protocols" },
              { icon: TrendingUp, title: "Analytics", description: "Comprehensive insights" },
              { icon: Users, title: "Pilot Management", description: "Certification tracking" },
              { icon: Plane, title: "Flight Data", description: "Automatic log storage" },
            ].map((feature, idx) => (
              <div key={idx} className="card p-8 hover:shadow-lg transition-shadow">
                <feature.icon className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="bg-gradient-to-r from-blue-600 to-teal-600 rounded-2xl p-12 text-center text-white">
          <h2 className="text-4xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg mb-8 opacity-90">Join hundreds of professionals using our platform</p>
          <Button size="lg" variant="secondary" onClick={handleGetStarted} className="text-lg px-8">
            Launch Platform
          </Button>
        </div>
      </section>

      <footer className="bg-slate-900 text-white py-12 mt-20">
        <div className="container text-center text-sm text-gray-400">
          <p>&copy; 2026 UAV Dispatch Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
