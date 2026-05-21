import { useState } from "react";
import { Download, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { exportDatabase, importDatabase } from "@/lib/backup";

export function BackupCard() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    try {
      setBusy(true);
      const result = await exportDatabase();
      if (!result) return;
      toast.success(`Exported ${formatBytes(result.bytes)} to your filesystem.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    try {
      setBusy(true);
      const result = await importDatabase();
      if (!result) return;
      toast.success(
        `Imported ${formatBytes(result.bytes)}. Restart the app to load it.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>
          Export your library and meal plans to a single SQLite file, or import
          one from a previous backup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={handleExport}
            disabled={busy}
          >
            <Download className="h-4 w-4" />
            Export database
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            <Upload className="h-4 w-4" />
            Import database
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The database lives at <code>~/Library/Application Support/com.paperplate.app/paperplate.db</code>.
          Importing replaces the current database; the existing file is renamed
          to <code>paperplate.db.bak</code> next to it.
        </p>
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Replace the current database?
            </DialogTitle>
            <DialogDescription>
              Your current data will be saved as a <code>.bak</code> file next
              to it, but you'll need to restart Paperplate to see the imported
              library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleImport}
              disabled={busy}
            >
              {busy ? "Importing…" : "Choose file & import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
