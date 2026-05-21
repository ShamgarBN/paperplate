/**
 * Tiny rich-text editor for recipe step instructions.
 *
 * Scope (locked by user feedback):
 *   - Bold / italic / underline
 *   - 8-color palette + "clear color"
 *   - Steps only — ingredients stay plain text so they're parseable.
 *
 * Implementation:
 *   - contenteditable div for input.
 *   - Bold/italic/underline use document.execCommand (deprecated but
 *     still supported in every shipping browser engine; we accept the
 *     debt because the alternative is reimplementing the editing
 *     model and the surface area is tiny).
 *   - Color is applied manually via the Selection API so we can wrap
 *     selections in our class-based palette instead of inline style.
 *   - Paste is sanitized: we read pasted HTML, run it through
 *     `sanitizeStepHtml`, and insert with execCommand('insertHTML').
 *   - On change we re-sanitize before propagating so the parent never
 *     sees anything our render path wouldn't accept.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Bold, Italic, Underline, Palette, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { cn } from "@/lib/cn";
import {
  RICH_TEXT_PALETTE,
  isRichTextEmpty,
  sanitizeStepHtml,
  toRenderableHtml,
} from "@/lib/richtext";

export interface RichTextFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  "aria-label"?: string;
}

export function RichTextField({
  value,
  onChange,
  placeholder,
  className,
  rows = 3,
  ...rest
}: RichTextFieldProps) {
  const ariaLabel = rest["aria-label"];
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  // Latest value we either rendered or accepted from the user. Used
  // to skip the "sync external value into the DOM" effect when the
  // user is mid-typing — otherwise React would clobber the caret.
  const lastRenderedRef = useRef<string>(value);

  // Sync external value changes (e.g. parent re-hydration) into the
  // contenteditable DOM. We deliberately skip when focused because
  // the user is the source of truth in that case. We route through
  // `toRenderableHtml` so legacy plain-text values containing "<" or
  // "&" survive round-tripping through the sanitizer.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (isFocused) return;
    if (value === lastRenderedRef.current) return;
    el.innerHTML = toRenderableHtml(value || "");
    lastRenderedRef.current = value;
  }, [value, isFocused]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = toRenderableHtml(value || "");
    lastRenderedRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const raw = el.innerHTML;
    const safe = sanitizeStepHtml(raw);
    lastRenderedRef.current = safe;
    onChange(safe);
  }, [onChange]);

  const exec = useCallback(
    (command: "bold" | "italic" | "underline") => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      // execCommand is deprecated but still works and is the only
      // sanctioned way to roundtrip B/I/U into the DOM without a
      // dependency. Result will be sanitized by emit().
      document.execCommand(command, false);
      emit();
    },
    [emit],
  );

  const applyColor = useCallback(
    (className: string | null) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;
      if (!isRangeInside(el, range)) return;

      // Clear any color spans inside the selection first so toggling
      // a new color (or clearing) works cleanly.
      stripColorSpansInRange(el, range);

      if (className) {
        const span = document.createElement("span");
        span.className = className;
        try {
          span.appendChild(range.extractContents());
          range.insertNode(span);
          // Move caret to end of the inserted span so subsequent
          // typing doesn't extend the colored region.
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.selectNodeContents(span);
          newRange.collapse(false);
          sel.addRange(newRange);
        } catch {
          // surroundContents/extractContents can throw on partial
          // selections that cross element boundaries; we no-op in
          // that case rather than corrupt the DOM.
        }
      }
      emit();
    },
    [emit],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const data = event.clipboardData;
      const html = data.getData("text/html");
      const text = data.getData("text/plain");
      if (html) {
        const safe = sanitizeStepHtml(html);
        document.execCommand("insertHTML", false, safe);
      } else if (text) {
        // Escape plain text manually because insertHTML doesn't.
        const escaped = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        document.execCommand("insertHTML", false, escaped);
      }
      emit();
    },
    [emit],
  );

  const showPlaceholder = !isFocused && isRichTextEmpty(value);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1 flex items-center gap-1 rounded-md border border-input bg-muted/40 px-1 py-1">
        <ToolbarButton
          label="Bold"
          icon={<Bold className="h-3.5 w-3.5" />}
          onClick={() => exec("bold")}
          shortcut="⌘B"
        />
        <ToolbarButton
          label="Italic"
          icon={<Italic className="h-3.5 w-3.5" />}
          onClick={() => exec("italic")}
          shortcut="⌘I"
        />
        <ToolbarButton
          label="Underline"
          icon={<Underline className="h-3.5 w-3.5" />}
          onClick={() => exec("underline")}
          shortcut="⌘U"
        />
        <div className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ColorPicker onPick={applyColor} />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={emit}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          emit();
        }}
        style={{ minHeight: `${rows * 1.5}rem` }}
        className={cn(
          "relative w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          showPlaceholder && "before:pointer-events-none before:text-muted-foreground",
        )}
        data-placeholder={showPlaceholder ? placeholder : undefined}
      />
      {showPlaceholder && placeholder ? (
        <div
          aria-hidden
          className="pointer-events-none -mt-[calc(1.5rem*var(--rows,3)+0.75rem)] px-3 py-2 text-sm text-muted-foreground"
          style={
            { ["--rows" as never]: rows } as React.CSSProperties
          }
        >
          {placeholder}
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  icon,
  onClick,
  shortcut,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0"
      onMouseDown={(event) => {
        // Prevent the editor from losing selection on click.
        event.preventDefault();
      }}
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}

function ColorPicker({
  onPick,
}: {
  onPick: (className: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2"
          onMouseDown={(event) => event.preventDefault()}
          aria-label="Text color"
          title="Text color"
        >
          <Palette className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-5 gap-1.5">
          {RICH_TEXT_PALETTE.map((color) => {
            const isClear = color.id === "default";
            return (
              <button
                key={color.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(color.className);
                  setOpen(false);
                }}
                title={color.label}
                aria-label={color.label}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border border-border/60 transition hover:scale-110",
                )}
                style={isClear ? undefined : { color: color.swatch }}
              >
                {isClear ? (
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: color.swatch }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * True when every endpoint of the range sits inside (or on) `root`.
 * We use this to refuse cross-component color application — a user
 * could otherwise create a selection that starts in our editor and
 * ends in some other contenteditable on the page and we'd happily
 * try to mutate that other element.
 */
function isRangeInside(root: HTMLElement, range: Range): boolean {
  return (
    root.contains(range.startContainer) && root.contains(range.endContainer)
  );
}

/**
 * Strip any of our palette color spans that overlap with `range`.
 * We don't try to be surgical; we just unwrap the spans entirely.
 * If the user wanted to keep coloring on text outside the selection
 * they're going to re-apply it. This keeps the model simple and
 * prevents accumulating nested span debris.
 */
function stripColorSpansInRange(root: HTMLElement, range: Range): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (!(node instanceof HTMLSpanElement)) return NodeFilter.FILTER_SKIP;
      if (!node.className.startsWith("rt-color-"))
        return NodeFilter.FILTER_SKIP;
      // Quick reject: span entirely outside range.
      const nodeRange = document.createRange();
      nodeRange.selectNode(node);
      if (
        range.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0 ||
        range.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0
      ) {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const toUnwrap: HTMLSpanElement[] = [];
  let current = walker.nextNode();
  while (current) {
    toUnwrap.push(current as HTMLSpanElement);
    current = walker.nextNode();
  }
  for (const span of toUnwrap) {
    const parent = span.parentNode;
    if (!parent) continue;
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  }
}
