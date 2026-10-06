import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ size = "md", showText = true }: LogoProps) {
  const sizes = { sm: 28, md: 36, lg: 48 };
  const px = sizes[size];

  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/images/wangari-real-logo.png"
        alt="Wangari"
        width={px}
        height={px}
        className="shrink-0 rounded-full"
        priority
      />
      {showText && (
        <div>
          <p className="text-base font-bold text-wangari-heading tracking-tight">Wangari</p>
          {size === "lg" && <p className="text-[10px] font-semibold uppercase tracking-widest text-wangari-muted">Farm OS</p>}
        </div>
      )}
    </div>
  );
}

export function LogoFull({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/images/wangari-real-logo.png"
      alt="Wangari"
      width={200}
      height={200}
      className={className}
      priority
    />
  );
}
