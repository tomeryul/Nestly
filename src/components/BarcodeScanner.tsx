import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Modal } from "./ui";
import { lookupBarcode } from "../lib/prices";

/**
 * Scan a product's barcode with the camera and hand back its name. iPhone
 * Safari has no built-in barcode reader (BarcodeDetector), so decoding is done
 * by ZXing, loaded only when the scanner opens. The name comes from the chain's
 * catalogue, then Open Food Facts (see the prices function).
 */
export default function BarcodeScanner({ onFound, onClose }: { onFound: (name: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [stage, setStage] = useState<"starting" | "scanning" | "looking" | "missing" | "error">("starting");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  // Bumped by "scan again" to restart the camera.
  const [round, setRound] = useState(0);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        // Grocery barcodes only: fewer formats to try means a faster lock.
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);
        const reader = new BrowserMultiFormatReader(hints);
        if (cancelled || !video.current) return;
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current, async (result, _err, scanning) => {
          if (!result || cancelled) return;
          scanning.stop();
          const text = result.getText();
          setCode(text);
          setStage("looking");
          try {
            const item = await lookupBarcode(text);
            if (cancelled) return;
            if (item) onFound(item.name);
            else setStage("missing");
          } catch (e) {
            console.error("[nestly] barcode lookup failed", e);
            if (!cancelled) {
              setMessage("לא הצלחנו לחפש את המוצר. נסו שוב.");
              setStage("error");
            }
          }
        });
        stop = () => controls.stop();
        if (cancelled) stop();
        else setStage("scanning");
      } catch (e) {
        console.error("[nestly] camera failed", e);
        if (cancelled) return;
        const name = e instanceof Error ? e.name : "";
        setMessage(name === "NotAllowedError" ? "אין הרשאה למצלמה. אפשר לאשר אותה בהגדרות הדפדפן ולנסות שוב." : "לא הצלחנו לפתוח את המצלמה.");
        setStage("error");
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const again = () => {
    setCode("");
    setMessage("");
    setStage("starting");
    setRound((r) => r + 1);
  };

  return (
    <Modal open onClose={onClose} title="סריקת ברקוד">
      <div className="nst-fields">
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#000", aspectRatio: "4 / 3" }}>
          <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          {stage === "scanning" && (
            <div aria-hidden style={{ position: "absolute", left: "12%", right: "12%", top: "50%", height: 2, background: "var(--accent)", boxShadow: "0 0 12px var(--accent)" }} />
          )}
        </div>
        <p className="section-sub" role="status">
          {stage === "starting" && "פותח מצלמה…"}
          {stage === "scanning" && "כוונו את המצלמה לברקוד של המוצר."}
          {stage === "looking" && `מחפש את המוצר (${code})…`}
          {stage === "missing" && `לא מצאתי מוצר עם הברקוד ${code}. אפשר לכתוב את השם ידנית.`}
        </p>
        {stage === "error" && (
          <p className="alert qa-error" role="alert">
            <TriangleAlert /> {message}
          </p>
        )}
        {(stage === "missing" || stage === "error") && (
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={again}>
            סריקה נוספת
          </button>
        )}
      </div>
    </Modal>
  );
}
