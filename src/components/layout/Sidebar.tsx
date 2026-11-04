"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { notifyAuthChange, useStoredValue } from "@/hooks/useStoredValue";
import { canRestoreRequests } from "@/features/dailyRequest/requestRestorePolicy";
import { canCreateRequests } from "@/features/dailyRequest/requestCreationPolicy";
import { canViewStock } from "@/features/stock/stockPolicy";
import styles from "./Sidebar.module.css";

type Props = { isOpen: boolean; onClose: () => void };
type SymbolName = "waste" | "count" | "catalog" | "stock" | "inbox" | "monitor" | "trash" | "plus" | "refresh" | "logout" | "chevron" | "close";
function SidebarIcon({ name }: { name: SymbolName }) {
    const paths: Record<SymbolName, string> = {
        waste: "M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11l4 6 M14 11l-4 6",
        count: "M8 5H5v16h14V5h-3 M9 3h6v4H9z M8 11l1 1 2-2 M13 11h3 M8 16l1 1 2-2 M13 16h3",
        catalog: "M4 4h16v16H4z M4 10h16 M10 10v10 M14 7h3 M7 14v3 M14 14h3",
        stock: "M3 7l9-4 9 4-9 4-9-4 M3 7v10l9 4 9-4V7 M12 11v10",
        inbox: "M4 4h16v16H4z M4 13h5l2 3h2l2-3h5",
        monitor: "M4 19h16 M7 15v-4 M12 15V6 M17 15V9",
        trash: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
        plus: "M12 5v14 M5 12h14", refresh: "M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M4 15l2 3a7 7 0 0 0 12-1",
        logout: "M9 4H4v16h5 M10 12h10 M16 8l4 4-4 4", chevron: "M9 5l7 7-7 7", close: "M6 6l12 12 M18 6 6 18",
    };
    return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export default function Sidebar({ isOpen, onClose }: Props) {
    const router = useRouter(), pathname = usePathname();
    const token = useStoredValue("token");
    const [expanded, setExpanded] = useState(false);
    const container = useRef<HTMLElement>(null);
    let user: { username?: string; roleCode?: string } | null = null;
    if (token) { try { user = jwtDecode<{ username: string; roleCode: string }>(token); } catch { /* Login handles expired sessions. */ } }
    const username = user?.username ?? "User";
    const initials = username.slice(0, 2).toUpperCase();
    const roleNames: Record<string, string> = { ADMIN: "Administrator", BM: "Branch manager", INV: "Inventory", WM: "Workshop manager" };
    const links: { href: string; label: string; icon: SymbolName }[] = [
        { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
        ...(canViewStock(user?.roleCode) ? [{ href: "/dashboard/stock", label: "Receiving & stock", icon: "stock" as const }, { href: "/dashboard/stock-counts", label: "Physical stock counts", icon: "count" as const }, { href: "/dashboard/waste", label: "Waste & damage", icon: "waste" as const }] : []),
        ...(user?.roleCode === "ADMIN" ? [{ href: "/dashboard/monitor", label: "Request Monitor", icon: "monitor" as const }, { href: "/dashboard/products", label: "Products", icon: "catalog" as const }] : []),
        ...(canRestoreRequests(user?.roleCode) ? [{ href: "/dashboard/trash", label: "Deleted requests", icon: "trash" as const }] : []),
    ];
    useEffect(() => {
        if (!isOpen && !expanded) return;
        const mobile = window.matchMedia("(max-width: 1023px)").matches;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (isOpen && mobile) container.current?.querySelector<HTMLButtonElement>("button[data-mobile-close]")?.focus();
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") { setExpanded(false); onClose(); }
            if (event.key !== "Tab" || !isOpen || !mobile) return;
            const nodes = Array.from(container.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).filter(node => node.getClientRects().length > 0);
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
        document.addEventListener("keydown", handleKey);
        return () => { document.removeEventListener("keydown", handleKey); if (isOpen && mobile) previous?.focus(); };
    }, [isOpen, expanded, onClose]);
    function close() { setExpanded(false); onClose(); }
    function logout() {
        localStorage.removeItem("token"); localStorage.removeItem("user");
        document.cookie = "token=; path=/; max-age=0";
        notifyAuthChange(); close(); router.push("/login");
    }
    return <>
        {isOpen && <button type="button" className={styles.overlay} onClick={close} aria-label="Close navigation" />}
        <aside ref={container} className={`${styles.sidebar} ${expanded ? styles.expanded : ""} ${isOpen ? styles.open : ""}`} aria-label="Main navigation">
            <div className={styles.brand}><span className={styles.logo} aria-hidden="true">PC</span><div className={styles.label}><strong>Pastry Complex</strong><small>Branch operations</small></div>
                <button type="button" data-mobile-close className={styles.mobileClose} onClick={close} aria-label="Close navigation"><SidebarIcon name="close" /></button>
            </div>
            <button type="button" className={styles.toggle} onClick={() => setExpanded(value => !value)} aria-label={expanded ? "Collapse navigation" : "Expand navigation"} aria-expanded={expanded} title={expanded ? "Collapse navigation" : "Expand navigation"}>
                <span className={expanded ? styles.rotate : ""}><SidebarIcon name="chevron" /></span>
            </button>
            <div className={styles.profile} title={`${username} · ${roleNames[user?.roleCode ?? ""] ?? "Member"}`}><span className={styles.avatar}>{initials}</span>
                <div className={styles.label}><strong>{username}</strong><small>{roleNames[user?.roleCode ?? ""] ?? "Member"}</small></div>
            </div>
            <nav className={styles.navigation} aria-label="Workspace">
                <p className={styles.sectionLabel}>Workspace</p>
                {links.map(link => <Link key={link.href} href={link.href} onClick={close} title={link.label} aria-label={link.label} aria-current={pathname === link.href ? "page" : undefined}
                    className={`${styles.item} ${pathname === link.href ? styles.active : ""}`}><SidebarIcon name={link.icon} /><span className={styles.label}>{link.label}</span></Link>)}
                {canCreateRequests(user?.roleCode) && <Link href="/daily-request" onClick={close} title="New request" aria-label="New request" className={`${styles.item} ${styles.create}`}><SidebarIcon name="plus" /><span className={styles.label}>New request</span></Link>}
            </nav>
            <div className={styles.footer}>
                <button type="button" onClick={() => window.location.reload()} title="Refresh page" aria-label="Refresh page" className={styles.item}><SidebarIcon name="refresh" /><span className={styles.label}>Refresh page</span></button>
                <button type="button" onClick={logout} title="Sign out" aria-label="Sign out" className={`${styles.item} ${styles.logout}`}><SidebarIcon name="logout" /><span className={styles.label}>Sign out</span></button>
            </div>
        </aside>
    </>;
}
