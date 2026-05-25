import { useCallback, useEffect, useRef, useState } from "react";
import { EventsOn } from "../../../wailsjs/runtime/runtime";

interface QuickNoteDialogProps {
  vaultRoot: string | null;
  onSave: (note: { title: string; content: string }) => Promise<void>;
}

export function QuickNoteDialog({ vaultRoot, onSave }: QuickNoteDialogProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await EventsOn("hotkey://quick-note", () => {
        setOpen(true);
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Auto-save after 5 seconds of inactivity
  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!value.trim() || !vaultRoot) return;
      timerRef.current = setTimeout(async () => {
        await doSave(value);
      }, 5000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultRoot],
  );

  const doSave = useCallback(
    async (text: string) => {
      if (!text.trim() || !vaultRoot) return;
      const firstLine = text.trim().split("\n")[0].slice(0, 60);
      const title = firstLine || `quick-note-${Date.now()}`;
      await onSave({
        title: title.replace(/[^a-zA-Z0-9 _-]/g, ""),
        content: text.trim(),
      });
    },
    [vaultRoot, onSave],
  );

  const handleSave = useCallback(async () => {
    await doSave(content);
    setOpen(false);
    setContent("");
  }, [content, doSave]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setContent("");
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSave();
    },
    [handleCancel, handleSave],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg rounded-lg border bg-white p-4 shadow-xl">
        <h2 className="mb-2 text-sm font-medium text-gray-500">
          Quick Note  &mdash;  Ctrl+Enter to save, Esc to cancel
        </h2>

        <textarea
          ref={inputRef}
          className="min-h-[120px] w-full resize-none rounded-md border border-gray-200 bg-gray-50 p-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          placeholder="Start typing..."
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Auto-saves after 5s of inactivity
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
