import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChefHat, Calendar, ShoppingBasket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";

const ONBOARDING_KEY = "paperplate.onboarded";

export function OnboardingDialog() {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_KEY) !== "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      window.localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      // ignore (private mode, etc.)
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Welcome to Paperplate
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <Step
            icon={<ChefHat className="h-5 w-5" />}
            title="Catalog your recipes"
            body="Paste any recipe URL — we'll pull the ingredients and steps. Or enter one by hand."
          />
          <Step
            icon={<Calendar className="h-5 w-5" />}
            title="Plan a week (or any range)"
            body="Drag recipes onto a calendar, override servings per slot, and lock favorites in place."
          />
          <Step
            icon={<Sparkles className="h-5 w-5" />}
            title="Auto-fill the rest"
            body="Let Paperplate balance ingredient overlap and perishable waste while keeping cuisines from clustering."
          />
          <Step
            icon={<ShoppingBasket className="h-5 w-5" />}
            title="Print a clean shopping list"
            body="Aggregated, aisle-grouped, check-off ready. Copy to clipboard or print to PDF."
          />
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="ghost" onClick={dismiss}>
            Skip
          </Button>
          <Button asChild onClick={dismiss}>
            <Link to="/import">Add my first recipe</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
