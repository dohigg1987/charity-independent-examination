export function Logo({ inverse = false }: { inverse?: boolean }) {
  return <div className={`logo ${inverse ? "logo-inverse" : ""}`} aria-label="Clarity IE">
    <span className="logo-mark"><i /><i /><i /></span>
    <span><strong>clarity</strong><small>INDEPENDENT EXAMINATION</small></span>
  </div>;
}
