/**
 * Each navigation moves a little along the thread: the new screen rises in with a water ease
 * (fade only under reduced motion). The keyframes end at transform:none, so fixed elements
 * such as the journey rail are never trapped in a transformed ancestor.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter">{children}</div>;
}
