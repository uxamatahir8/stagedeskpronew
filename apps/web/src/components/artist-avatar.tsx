export function ArtistAvatar({ name, photoUrl, size = "md" }: { name: string; photoUrl: string | null; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "size-24 text-3xl" : "size-12 text-lg";
  return photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- served from /files
    <img src={photoUrl} alt="" className={`${cls} shrink-0 rounded-xl object-cover`} />
  ) : (
    <span className={`${cls} flex shrink-0 items-center justify-center rounded-xl bg-accent font-semibold text-accent-foreground`}>
      {name.replace(/^DJ\s+/i, "").charAt(0).toUpperCase()}
    </span>
  );
}
