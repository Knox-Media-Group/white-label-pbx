import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Phone, Users, Shield, BarChart3, Settings, Headphones, LogIn } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const adminLogin = trpc.auth.adminLogin.useMutation({
    onSuccess: () => {
      window.location.href = "/admin";
    },
    onError: (err) => {
      setError(err.message || "Invalid credentials");
    },
  });

  // Redirect authenticated users to appropriate dashboard
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (user.role === 'admin') {
        setLocation('/admin');
      } else if (user.customerId) {
        setLocation('/portal');
      }
    }
  }, [loading, isAuthenticated, user, setLocation]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    adminLogin.mutate({ username, password });
  };

  const features = [
    {
      icon: Users,
      title: "Multi-Tenant Architecture",
      description: "Manage 100+ customers with isolated PBX environments, each with their own Telnyx connection."
    },
    {
      icon: Phone,
      title: "SIP Endpoint Management",
      description: "Create, configure, and manage SIP endpoints with automated provisioning via Telnyx API."
    },
    {
      icon: Headphones,
      title: "Ring Groups & Routing",
      description: "Configure ring groups with multiple strategies and intelligent call routing rules."
    },
    {
      icon: BarChart3,
      title: "Usage Analytics",
      description: "Track call volumes, minutes, and active resources with detailed usage statistics."
    },
    {
      icon: Shield,
      title: "Custom Branding",
      description: "Customize logo, colors, and company name for each customer's portal experience."
    },
    {
      icon: Settings,
      title: "AI-Powered Features",
      description: "LLM-generated call flows, intelligent routing suggestions, and automated call summaries."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-6 w-6 text-indigo-600" />
            <span className="text-xl font-semibold text-slate-900">KLT Connect</span>
          </div>
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="h-9 w-20 bg-slate-200 animate-pulse rounded-md" />
            ) : isAuthenticated ? (
              <Button onClick={() => setLocation(user?.role === 'admin' ? '/admin' : '/portal')}>
                Go to Dashboard
              </Button>
            ) : (
              <Button onClick={() => setShowLogin(!showLogin)}>
                <LogIn className="mr-2 h-4 w-4" />
                Admin Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Admin Login Modal */}
      {showLogin && !isAuthenticated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLogin(false)}>
          <Card className="w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-indigo-600" />
                Admin Login
              </CardTitle>
              <CardDescription>Sign in to the admin dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={adminLogin.isPending}>
                  {adminLogin.isPending ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
              Enterprise Cloud PBX
              <span className="block text-indigo-600">Management Platform</span>
            </h1>
            <p className="mt-6 text-lg text-slate-600 leading-relaxed">
              A comprehensive multi-tenant telephony solution powered by Telnyx.
              Manage hundreds of customers with isolated PBX environments, automated provisioning,
              and AI-powered call management features.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              {isAuthenticated ? (
                <Button size="lg" onClick={() => setLocation(user?.role === 'admin' ? '/admin' : '/portal')}>
                  Go to Dashboard
                </Button>
              ) : (
                <Button size="lg" onClick={() => setShowLogin(true)}>
                  Get Started
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Powerful Features</h2>
            <p className="mt-4 text-lg text-slate-600">Everything you need to manage your cloud PBX service</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-slate-200 hover:border-indigo-200 hover:shadow-lg transition-all">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-indigo-100 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-indigo-600" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-indigo-600">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8 text-center text-white">
            <div>
              <div className="text-4xl font-bold">100+</div>
              <div className="mt-2 text-indigo-200">Customers Supported</div>
            </div>
            <div>
              <div className="text-4xl font-bold">&infin;</div>
              <div className="mt-2 text-indigo-200">SIP Endpoints</div>
            </div>
            <div>
              <div className="text-4xl font-bold">24/7</div>
              <div className="mt-2 text-indigo-200">Call Handling</div>
            </div>
            <div>
              <div className="text-4xl font-bold">AI</div>
              <div className="mt-2 text-indigo-200">Powered Routing</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-slate-900 text-slate-400">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-indigo-400" />
              <span className="text-white font-semibold">KLT Connect</span>
            </div>
            <p className="text-sm">Powered by Telnyx</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
