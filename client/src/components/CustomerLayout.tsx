import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import {
  LayoutDashboard, LogOut, Phone, PhoneCall, Users,
  Route, Mic, Palette, Settings, Monitor, ArrowRightLeft
} from "lucide-react";
import { CSSProperties, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/portal" },
  { icon: Phone, label: "SIP Endpoints", path: "/portal/endpoints" },
  { icon: PhoneCall, label: "Phone Numbers", path: "/portal/phone-numbers" },
  { icon: Monitor, label: "VoIP Phones", path: "/portal/voip-phones" },
  { icon: Users, label: "Ring Groups", path: "/portal/ring-groups" },
  { icon: Route, label: "Call Routes", path: "/portal/call-routes" },
  { icon: Mic, label: "Recordings", path: "/portal/recordings" },
  { icon: ArrowRightLeft, label: "Port Orders", path: "/portal/port-orders" },
  { icon: Palette, label: "Branding", path: "/portal/branding" },
  { icon: Settings, label: "Settings", path: "/portal/settings" },
];

export default function CustomerLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const [sidebarWidth] = useState(280);
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <div className="w-64 border-r bg-slate-50 p-4">
          <Skeleton className="h-8 w-32 mb-8" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <Phone className="h-12 w-12 text-indigo-600" />
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign In Required
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to the customer portal requires authentication.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  // For demo purposes, allow any authenticated user to access customer portal
  // In production, you'd check user.customerId

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar>
        <SidebarHeader className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Phone className="h-6 w-6 text-indigo-600" />
            <span className="font-semibold">PBX Portal</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location === item.path}
                  onClick={() => setLocation(item.path)}
                  className="w-full"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-indigo-100 text-indigo-600">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{user.name || 'User'}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-white px-6">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold">{title || 'Dashboard'}</h1>
        </header>
        <main className="flex-1 p-6 bg-slate-50">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
