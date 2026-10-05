"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { PhoneLinkModal } from "./PhoneLinkModal";
import { BlockedScreen, WarningStrip, useSubscription } from "./SubscriptionNotice";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const subscription = useSubscription();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar collapsed={collapsed} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Topbar onToggleSidebar={() => setCollapsed((v) => !v)} />
        <WarningStrip subscription={subscription} />
        {subscription?.blocked ? <BlockedScreen subscription={subscription} /> : children}
      </div>
      {!subscription?.blocked && <PhoneLinkModal />}
    </div>
  );
}
