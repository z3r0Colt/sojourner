import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import qrcode from "qrcode-generator";
import { Copy, KeyRound, MonitorSmartphone } from "lucide-react";
import { api } from "../../../api/client";
import type { RemoteStatus } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { confirmDialog } from "../../../components/ui/confirm";
import { toast } from "../../../components/ui/toast";

/**
 * Settings → Other devices: Sojourner in a browser on a phone, a tablet or a
 * television in another room, served by this computer while the app is open
 * (src-tauri/src/remote.rs). For family worship around the table or a study
 * with visitors. Everything is shared with this computer -- the notes, the
 * prayer journal, the guided study -- and what needs this computer's own
 * files or printer stays here.
 */
export function DevicesSection() {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ["remoteStatus"], queryFn: api.remoteStatus });
  const set = (s: RemoteStatus) => qc.setQueryData(["remoteStatus"], s);
  const toggle = useMutation({ mutationFn: api.remoteSetEnabled, onSuccess: set });
  const newKey = useMutation({ mutationFn: api.remoteNewKey, onSuccess: set });

  const renew = async () => {
    const ok = await confirmDialog({
      title: "Make a new link?",
      message: "Every device given the old link will be asked for the new one. Use this if someone who shouldn’t have it does.",
      confirmLabel: "Make a new link",
    });
    if (ok) newKey.mutate();
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Other devices</h2>
      <p className="mb-4 text-sm text-ink-2">
        Open Sojourner in the web browser of a phone, tablet or television on the same Wi-Fi: for family worship around the table, or a study with
        visitors. It works while Sojourner is open on this computer, and everything is shared with it: a note written on the tablet is here at once.
        Printing, backups and adding files stay on this computer.
      </p>

      <label className="mb-4 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="accent-accent"
          checked={!!status?.enabled}
          disabled={!status || toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />
        <MonitorSmartphone className="h-4 w-4 text-ink-4" aria-hidden="true" />
        Let other devices on this network open Sojourner
      </label>

      {status?.error && <p className="mb-3 text-sm text-danger">{status.error}</p>}

      {status?.running && status.links.length > 0 && <Links links={status.links} />}

      {status?.running && status.links.length === 0 && (
        <p className="text-sm text-ink-2">This computer doesn’t seem to be on a network. Connect it to the Wi-Fi the other devices use.</p>
      )}

      {status?.enabled && (
        <div className="mt-6 space-y-2 border-t border-line pt-4 text-sm text-ink-3">
          <p>
            The first time, Windows may ask whether to let Sojourner use the network. Allow it on <span className="text-ink-2">private networks</span>{" "}
            (your home Wi-Fi), not public ones.
          </p>
          <p>
            Anyone with the link can read and change what is in Sojourner, including the prayer journal. A device without it is asked for the key.
          </p>
          <Button size="sm" icon={KeyRound} onClick={renew} disabled={newKey.isPending}>
            Make a new link
          </Button>
        </div>
      )}
    </div>
  );
}

function Links({ links }: { links: string[] }) {
  const [shown, setShown] = useState(0);
  const link = links[Math.min(shown, links.length - 1)];
  const key = new URL(link).searchParams.get("key") ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn’t copy the link");
    }
  };
  return (
    <div className="flex flex-wrap items-start gap-5 rounded-lg border border-line bg-surface-2 p-4">
      <QrCode text={link} />
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm text-ink-2">Scan the code with a phone’s camera, or type this into a browser:</p>
        <p className="mt-2 select-all break-all font-mono text-base text-ink">{link}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon={Copy} onClick={copy}>
            Copy link
          </Button>
          {links.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => setShown((shown + 1) % links.length)}>
              {shown === 0 ? "Use this computer’s name instead" : "Use its address instead"}
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-3">
          A device that opens Sojourner without the link is asked for the key: <span className="font-mono text-ink-2">{key}</span>
        </p>
      </div>
    </div>
  );
}

/** A QR code drawn as SVG squares: always black on white, as scanners expect. */
function QrCode({ text }: { text: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const dark: [number, number][] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) dark.push([c, r]);
    return { n, dark };
  }, [text]);
  const margin = 2;
  const size = cells.n + margin * 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={160} height={160} role="img" aria-label="QR code for the link" className="shrink-0 rounded-md">
      <rect width={size} height={size} fill="#fff" />
      {cells.dark.map(([x, y]) => (
        <rect key={`${x},${y}`} x={x + margin} y={y + margin} width={1.02} height={1.02} fill="#000" />
      ))}
    </svg>
  );
}
