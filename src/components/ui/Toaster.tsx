import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/components/theme/ThemeProvider";

export function Toaster() {
  const { resolved } = useTheme();
  return (
    <SonnerToaster
      theme={resolved}
      richColors
      closeButton
      position="bottom-left"
      toastOptions={{
        classNames: {
          toast: "border bg-background text-foreground shadow-elevated",
        },
      }}
    />
  );
}
