// Garson paneli için minimal wrapper.
// Auth guard, /waiter/page.tsx ve /waiter/login/page.tsx'te ayrı ayrı yönetilir.
export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
