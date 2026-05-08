import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import DashboardLayout from "./components/DashboardLayout";
import ProjectsPage from "./pages/ProjectsPage";
import PipelineDetailPage from "./pages/PipelineDetailPage";
import SettingsPage from "./pages/SettingsPage";
import UsageDashboardPage from "./pages/UsageDashboardPage";
import { ChatProvider } from "./contexts/ChatContext";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"}>
        {() => <DashboardLayout><ProjectsPage /></DashboardLayout>}
      </Route>
      <Route path={"/dashboard/pipeline/:pipelineId"}>
        {(params) => <DashboardLayout><PipelineDetailPage /></DashboardLayout>}
      </Route>
      <Route path={"/dashboard/pipeline/:pipelineId/usage"}>
        {(params) => <DashboardLayout><UsageDashboardPage /></DashboardLayout>}
      </Route>
      <Route path={"/dashboard/settings"}>
        {() => <DashboardLayout><SettingsPage /></DashboardLayout>}
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <ChatProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ChatProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
