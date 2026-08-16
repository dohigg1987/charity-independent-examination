import Image from "next/image";

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`logo ${inverse ? "logo-inverse" : ""}`}>
      <Image
        className="brand-logo-image"
        src={inverse ? "/clarity-ie-logo-dark.svg" : "/clarity-ie-logo.svg"}
        alt="Clarity IE"
        width={350}
        height={80}
        priority
        unoptimized
      />
    </div>
  );
}
