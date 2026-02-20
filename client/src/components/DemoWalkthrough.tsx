import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  BookOpen,
  Settings,
  Users,
  Phone,
  Headphones,
  Hash,
  Bot,
  ArrowLeftRight,
  MessageSquare,
  Ship,
  Rocket,
} from "lucide-react";

const STORAGE_KEY = "demo-walkthrough-completed";

interface WalkthroughStep {
  title: string;
  description: string;
  icon: React.ElementType;
  actionHint?: string;
}

const steps: WalkthroughStep[] = [
  {
    title: "Welcome",
    description:
      "Welcome to KLT Connect PBX! This tour will walk you through setting up your platform.",
    icon: Rocket,
  },
  {
    title: "Settings First",
    description:
      "Start by configuring your API keys in Settings. Add your Telnyx API key and SIP Connection ID to connect to the phone network.",
    icon: Settings,
    actionHint: "Navigate to Settings in the sidebar",
  },
  {
    title: "Add a Customer",
    description:
      "Go to Customers and click 'Add Customer'. Enter their details, select a service plan, and optionally assign a phone number.",
    icon: Users,
    actionHint: "Navigate to Customers in the sidebar",
  },
  {
    title: "Phone Numbers",
    description:
      "Use the Phone Numbers page to search for available numbers, purchase them from Telnyx, and assign them to customers.",
    icon: Phone,
    actionHint: "Navigate to Phone Numbers in the sidebar",
  },
  {
    title: "SIP Endpoints",
    description:
      "Configure SIP endpoints for each customer. These are the credentials used by IP phones and softphones.",
    icon: Headphones,
    actionHint: "Navigate to SIP Endpoints in the sidebar",
  },
  {
    title: "Extensions",
    description:
      "Set up extensions to organize customer phone systems with internal dialing.",
    icon: Hash,
    actionHint: "Navigate to Extensions in the customer portal",
  },
  {
    title: "AI Agents",
    description:
      "Configure Retell AI voice agents to handle calls automatically. Create agents and assign them to phone numbers.",
    icon: Bot,
    actionHint: "Navigate to AI Agents in the sidebar",
  },
  {
    title: "Call Routing",
    description:
      "Set up call routing rules for each customer in their portal - forwarding, ring groups, time-based routing.",
    icon: ArrowLeftRight,
    actionHint: "Configure in each customer's portal",
  },
  {
    title: "SMS Messaging",
    description:
      "Send and receive text messages through the Messaging page using Telnyx messaging API.",
    icon: MessageSquare,
    actionHint: "Navigate to Messaging in the customer portal",
  },
  {
    title: "Number Porting",
    description:
      "Port existing numbers from other carriers using the Number Porting page. Track port order status in real-time.",
    icon: Ship,
    actionHint: "Navigate to Number Porting in the sidebar",
  },
  {
    title: "All Set!",
    description:
      "You're ready to go! Check the Setup Guide for detailed documentation on each feature.",
    icon: CheckCircle2,
    actionHint: "Navigate to Setup Guide in the sidebar",
  },
];

// ---- Shared state for the hook ----

type Listener = (open: boolean) => void;

let _tourOpen = false;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach((fn) => fn(_tourOpen));
}

function openTour() {
  _tourOpen = true;
  notify();
}

function closeTour() {
  _tourOpen = false;
  notify();
}

// ---- Public hook ----

export function useDemoWalkthrough() {
  const [showTour, setShowTour] = useState(_tourOpen);

  useEffect(() => {
    const handler: Listener = (open) => setShowTour(open);
    _listeners.add(handler);
    return () => {
      _listeners.delete(handler);
    };
  }, []);

  return {
    showTour,
    startTour: openTour,
  };
}

// ---- Component ----

export default function DemoWalkthrough() {
  const { showTour } = useDemoWalkthrough();
  const [currentStep, setCurrentStep] = useState(0);
  const [hasAutoShown, setHasAutoShown] = useState(false);

  // Auto-show on first visit if not completed
  useEffect(() => {
    if (hasAutoShown) return;
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setHasAutoShown(true);
      openTour();
    } else {
      setHasAutoShown(true);
    }
  }, [hasAutoShown]);

  // Reset to step 0 whenever the tour opens
  useEffect(() => {
    if (showTour) {
      setCurrentStep(0);
    }
  }, [showTour]);

  const step = steps[currentStep];
  const StepIcon = step.icon;
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  function handleNext() {
    if (isLast) {
      completeTour();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function handlePrevious() {
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  function handleSkip() {
    completeTour();
  }

  function completeTour() {
    localStorage.setItem(STORAGE_KEY, "true");
    closeTour();
  }

  return (
    <Dialog open={showTour} onOpenChange={(open) => { if (!open) completeTour(); }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <StepIcon className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  {step.title}
                </DialogTitle>
                <Badge variant="secondary" className="mt-1">
                  Step {currentStep + 1} of {steps.length}
                </Badge>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={handleSkip}
              aria-label="Close tour"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <DialogDescription className="text-sm text-muted-foreground pt-2">
          {step.description}
        </DialogDescription>

        {step.actionHint && (
          <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>{step.actionHint}</span>
          </div>
        )}

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStep(idx)}
              aria-label={`Go to step ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${
                idx === currentStep
                  ? "w-6 bg-indigo-600"
                  : idx < currentStep
                    ? "w-2 bg-indigo-300"
                    : "w-2 bg-gray-300"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex items-center gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Skip Tour
          </Button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={handlePrevious}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {isLast ? (
                <>
                  Finish
                  <CheckCircle2 className="ml-1 h-4 w-4" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
