/** Re-mounts on every navigation, so each website page fades in. */
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
