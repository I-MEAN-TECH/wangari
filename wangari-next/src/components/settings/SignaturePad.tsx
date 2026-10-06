"use client";

import * as React from "react";
import { Eraser, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * SignaturePad — draw a signature with a finger, stylus, or mouse.
 * Optional by design: farmers can leave it empty and documents simply
 * print without a signature. Saves as a transparent PNG data URL.
 */
export function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const hasInk = React.useRef(false);
  const last = React.useRef({ x: 0, y: 0 });

  // Paint the saved signature back when the component mounts or value resets externally.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        hasInk.current = true;
      };
      img.src = value;
    }
  }, [value]);

  const posOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // scale pointer coords to canvas resolution
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = posOf(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = posOf(e);
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) {
      onChange(canvasRef.current?.toDataURL("image/png") || "");
    }
  };

  const clear = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    hasInk.current = false;
    onChange("");
  };

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-wangari-border bg-white hover:border-wangari-green-200 transition-colors">
        <canvas
          ref={canvasRef}
          width={560}
          height={160}
          className="w-full h-[140px] touch-none cursor-crosshair rounded-xl"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {!value && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-wangari-rule">
            <PenTool className="h-6 w-6 mb-1" />
            <p className="text-sm font-medium">Sign here with finger, pen, or mouse</p>
            <p className="text-xs">Optional — leave blank if you don't need a signature</p>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-wangari-subtle">Appears on invoices, quotes & receipts</p>
        <Button type="button" variant="outline" size="sm" onClick={clear} className="cursor-pointer rounded-lg">
          <Eraser className="h-3.5 w-3.5 mr-1.5" /> Clear
        </Button>
      </div>
    </div>
  );
}
