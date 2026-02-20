import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Admin Pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminCustomers from "./pages/admin/Customers";
import AdminCustomerDetail from "./pages/admin/CustomerDetail";
import AdminSettings from "./pages/admin/Settings";
import AdminPhoneNumbers from "./pages/admin/PhoneNumbers";
import AdminSipEndpoints from "./pages/admin/SipEndpoints";
import AdminViirtueImport from "./pages/admin/ViirtueImport";

// Customer Portal Pages
import CustomerDashboard from "./pages/customer/Dashboard";
import CustomerEndpoints from "./pages/customer/Endpoints";
import CustomerPhoneNumbers from "./pages/customer/PhoneNumbers";
import CustomerRingGroups from "./pages/customer/RingGroups";
import CustomerCallRoutes from "./pages/customer/CallRoutes";
import CustomerRecordings from "./pages/customer/Recordings";
import CustomerBranding from "./pages/customer/Branding";
import CustomerSettings from "./pages/customer/Settings";

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      
      {/* Admin Routes */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/customers" component={AdminCustomers} />
      <Route path="/admin/customers/:id" component={AdminCustomerDetail} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/phone-numbers" component={AdminPhoneNumbers} />
      <Route path="/admin/sip-endpoints" component={AdminSipEndpoints} />
      <Route path="/admin/import" component={AdminViirtueImport} />

      {/* Customer Portal Routes */}
      <Route path="/portal" component={CustomerDashboard} />
      <Route path="/portal/endpoints" component={CustomerEndpoints} />
      <Route path="/portal/phone-numbers" component={CustomerPhoneNumbers} />
      <Route path="/portal/ring-groups" component={CustomerRingGroups} />
      <Route path="/portal/call-routes" component={CustomerCallRoutes} />
      <Route path="/portal/recordings" component={CustomerRecordings} />
      <Route path="/portal/branding" component={CustomerBranding} />
      <Route path="/portal/settings" component={CustomerSettings} />
      
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
