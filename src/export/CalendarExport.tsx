import { useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { CategoryRecord } from "../catalogue/categories.ts";
import type { ItemRecord } from "../catalogue/items.ts";
import type { ShopRecord } from "../catalogue/shops.ts";
import { Button } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { DIALOG_FORM_CLASS, DialogActions } from "../ui/DialogActions.tsx";
import { TextField } from "../ui/TextField.tsx";
import { TopAppBarActions } from "../shell/TopAppBar.tsx";
import { isExportDate, todayExportDate } from "./exportDate.ts";
import {
  exportShoppingList,
  type ShopFallbackLink,
} from "./exportShoppingList.ts";
import { pendingItemsByShop } from "./shopGroups.ts";

export interface CalendarExportProps {
  items: ItemRecord[];
  categories: CategoryRecord[];
  shops: ShopRecord[];
}

type ExportStatus =
  | { phase: "idle" }
  | { phase: "exporting" }
  | { phase: "exported" }
  | { phase: "fallback"; links: ShopFallbackLink[] }
  | { phase: "cancelled" }
  | { phase: "popup-blocked" }
  | { phase: "error"; message: string };

function pendingItems(count: number): string {
  return `${count} pending Item${count === 1 ? "" : "s"}`;
}

function needShopMessage(count: number): string {
  const [verb, pronoun] = count === 1 ? ["needs", "it"] : ["need", "they"];
  return `${pendingItems(count)} ${verb} a Shop before ${pronoun} can be exported.`;
}

/**
 * Export of the Shopping list to Calendar, opened from a top app bar action: one event per Shop, or a
 * deep link per Shop if the Calendar API or the token request fails; a cancelled or blocked Google
 * sign-in just says so, so Export can be retried. Works from the Items, Categories and Shops it is given.
 */
export function CalendarExport({
  items,
  categories,
  shops,
}: CalendarExportProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<ExportStatus>({ phase: "idle" });
  // A result that landed while the dialog was closed and has not been shown yet.
  const [unseenResult, setUnseenResult] = useState(false);
  // Mirrors `open` for the async export continuation, which needs the current value, not its render's.
  // Open and close only through `setDialogOpen`, or an unseen result is never flagged.
  const openRef = useRef(false);

  const { groups, unresolvedCount, nothingToBuy } = pendingItemsByShop(
    items,
    categories,
    shops,
  );

  // With nothing left to export, a pressed Export would replace the result's fallback links with an error.
  const exportDisabled =
    status.phase === "exporting" ||
    (nothingToBuy &&
      (status.phase === "exported" || status.phase === "fallback"));

  async function handleExport(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault();

    if (exportDisabled) return;

    if (!isExportDate(date)) {
      setStatus({ phase: "error", message: "Choose a date to export to." });
      return;
    }

    if (groups.length === 0) {
      setStatus({
        phase: "error",
        message:
          unresolvedCount > 0
            ? needShopMessage(unresolvedCount)
            : "No pending Items to export.",
      });
      return;
    }

    if (!navigator.onLine) {
      setStatus({
        phase: "error",
        message:
          "Exporting to Calendar needs a connection. Try again once you are online.",
      });
      return;
    }

    setStatus({ phase: "exporting" });
    const result = await exportShoppingList(groups, date);
    setStatus(
      result.status === "fallback"
        ? { phase: "fallback", links: result.links }
        : { phase: result.status },
    );
    if (!openRef.current) setUnseenResult(true);
  }

  function openDialog() {
    // An export still in flight keeps the dialog showing it, date included, so Export stays disabled and its
    // result lands beside the date it was made for.
    if (status.phase !== "exporting" && !unseenResult) {
      setDate(todayExportDate());
      setStatus({ phase: "idle" });
    }
    setUnseenResult(false);
    setDialogOpen(true);
  }

  function setDialogOpen(next: boolean) {
    openRef.current = next;
    setOpen(next);
  }

  return (
    <>
      <TopAppBarActions>
        <Button
          variant="text"
          disabled={nothingToBuy && !unseenResult}
          onClick={openDialog}
        >
          Export to Calendar
        </Button>
      </TopAppBarActions>
      <Dialog
        open={open}
        title="Export to Calendar"
        onClose={() => setDialogOpen(false)}
        closable
      >
        {status.phase === "error" && <p role="alert">{status.message}</p>}
        {status.phase === "exported" && (
          <p role="status">Exported to Calendar.</p>
        )}
        {status.phase === "cancelled" && (
          <p role="status">Google sign-in was cancelled.</p>
        )}
        {status.phase === "popup-blocked" && (
          <p role="status">
            Your browser blocked the Google sign-in window. Allow pop-ups and try
            again.
          </p>
        )}
        {status.phase === "fallback" && (
          <div role="status">
            <p>Couldn't reach Google Calendar. Add these events yourself:</p>
            <ul>
              {status.links.map((link) => (
                <li key={link.shopName}>
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.shopName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {unresolvedCount > 0 && groups.length > 0 && (
          <p>
            {pendingItems(unresolvedCount)} with no Shop to export under won't
            be included in the export.
          </p>
        )}
        <form
          class={DIALOG_FORM_CLASS}
          onSubmit={(event) => void handleExport(event)}
        >
          <TextField
            label="Date"
            type="date"
            value={date}
            onInput={(event) => setDate(event.currentTarget.value)}
          />

          <DialogActions>
            <Button variant="text" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={exportDisabled}>
              Export
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
