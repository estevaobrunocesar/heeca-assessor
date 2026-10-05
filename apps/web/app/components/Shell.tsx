"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { PhoneLinkModal } from "./PhoneLinkModal";
import { BlockedScreen, WarningStrip, useSubscription } from "./SubscriptionNotice";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const subscription = useSubscription();

  // Public pages (sign-in, password recovery) have no menu.
  if (pathname === "/login" || pathname === "/esqueci-senha" || pathname === "/redefinir-senha") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <Sidebar collapsed={collapsed} subscription={subscription} />
      <div className="app-main-col">
        <Topbar onToggleSidebar={() => setCollapsed((v) => !v)} />
        <WarningStrip subscription={subscription} />
        {subscription?.blocked ? <BlockedScreen subscription={subscription} /> : children}
      </div>
      <MobileNav />
      {!subscription?.blocked && <PhoneLinkModal />}
    </div>
  );
}
