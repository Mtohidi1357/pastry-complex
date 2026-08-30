// components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TokenPayload {
  userName?: string;
  roleCode?: string;
  //picture?: string;
  //email?: string;
}

function getAvatarUrl(userName?: string) {
  const seed = encodeURIComponent(userName || "user");

  return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}`;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<TokenPayload | null>(null);
  const [expanded, setExpanded] = useState(false); // desktop: full vs icon-only  
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const token =
      localStorage.getItem("token") ||
      document.cookie
        .split("; ")
        .find((row) => row.startsWith("token="))
        ?.split("=")[1];
    //console.log(token);
    if (token) {
      try {
        const decoded = jwtDecode<{
          username: string;
          roleCode: string;
        }>(token);
        setUser({
          userName: decoded.username,
          roleCode: decoded.roleCode
        });
        //console.log(jwtDecode(token));
      } catch {
        console.error("Invalid token");
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; max-age=0";
    router.push("/login");
  };

  // Navigation links
  const navLinks = [
    { href: "/dashboard/inbox", label: "Inbox", icon: "📥" },
    { href: "/dashboard/follow", label: "Follow", icon: "👁️" },
    { href: "/dashboard/sent", label: "Sent", icon: "📤" },
    { href: "/dashboard/drafts", label: "Drafts", icon: "📝" },
    { href: "/dashboard/shared", label: "Shared", icon: "🔗" },
    { href: "/dashboard/archive", label: "Archive", icon: "🗄️" },
    { href: "/dashboard/trash", label: "Trash", icon: "🗑️" },
  ];

  // Action buttons (not navigation links)
  const actionButtons = [
    { label: "Refresh", icon: "🔄", action: () => window.location.reload() },
    { label: "Mark All Read", icon: "✅", action: () => console.log("Mark read") },
    { label: "Export", icon: "📄", action: () => console.log("Export") },
  ];

  const isActive = (href: string) => pathname === href;

  //Determine sidebar width and position
  const sidebarWidth = expanded ? "w-75" : "w-20";
  const sidebarPosition = isMobile
    ? `${isOpen ? "translate-x-0" : "-translate-x-full"}`
    : "translate-x-0";
  return (
    <>
      {/* Mobile overlay - only shows on mobile when sidebar is open */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`  
          fixed inset-y-0 left-0 z-50 bg-white shadow-xl  
          flex flex-col transition-all duration-300 ease-in-out
          overflow-hidden 
          max-w-full
          ${sidebarWidth} ${sidebarPosition}  
        `}
      >
        {/* ===== SIDEBAR HEADER / TOGGLE BUTTON ===== */}
        <div
          className={`  
            flex items-center h-16 shrink-0 border-b border-gray-200  
            ${expanded ? "justify-between px-4" : "justify-center"}  
          `}
        >
          {expanded && (
            <span className="text-lg font-bold text-gray-800">Dashboard</span>
          )}

          {/* Collapse/Expand toggle button */}
          <button
            onClick={() => {
              setExpanded(!expanded);
            }}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {expanded ? (
              /* Left chevron icon - shown when expanded, click to collapse */
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            ) : (
              /* Right chevron icon - shown when collapsed, click to expand */
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
        </div>
        {/* ===== PROFILE SECTION ===== */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div
              className={`
                ${expanded ? "w-14 h-14" : "w-10 h-10"}
                rounded-full
                overflow-hidden
                shrink-0
                border
                border-gray-200
              `}
            >
              <img
                src={getAvatarUrl(user?.userName)}
                alt={user?.userName || "User avatar"}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-white-900 truncate">
                {user?.userName || "User"}
              </p>
              <span className="inline-block px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-600 rounded-full">
                {user?.roleCode || "Member"}
              </span>
            </div>
          </div>
        </div>

        {/* ===== NAVIGATION LINKS ===== */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden ${expanded ? "px-4" : "px-2"} py-5 space-y-1`}>
          {expanded && <p className="px-3 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Navigation
          </p>}
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={`
                flex items-center px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors whitespace-nowrap
                ${isActive(link.href)
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                }
                ${expanded ? "px-3 py-2.5 justify-start" : "px-2 py-2.5justify-center"}
              `}
            >
              <span className="text-lg shrink-0">{link.icon}</span>

              {/* Label - fade out when collapsed, fade in when expanded */}
              <span
                className={`
                  ml-3 overflow-hidden transition-all duration-300
                  ${expanded ? "opacity-100 max-w-full" : "opacity-0 max-w-0 ml-0"}
                `}
              >
                {link.label}
              </span>
            </Link>
          ))}

          {/* ===== ACTION BUTTONS ===== */}
          {expanded && (<p className="px-3 pt-5 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Actions
          </p>)}
          {actionButtons.map((btn) => (
            <button
              key={btn.label}
              onClick={btn.action}
              className={`w-full flex items-center 
                ${expanded ? "px-3 py-2.5 justify-start" : "px-2 py-2.5 justify-center"} 
                whitespace-nowrap
                rounded-lg text-sm font-medium text-gray-700 
                hover:bg-indigo-50 hover:text-indigo-600 
                transition-colors`}
            >
              <span className="shrink-0 text-lg">{btn.icon}</span>
              <span
                className={`
                  overflow-hidden transition-all duration-300
                  ${expanded ? "opacity-100 max-w-full ml-3" : "opacity-0 max-w-0 ml-0"}
                `}>
                {btn.label}
              </span>
            </button>
          ))}

          {/* Compose - prominent action button */}
          <div className={expanded ? "mt-4" : "mt-4 flex justify-center"}>
            <button
              onClick={() => router.push("/dashboard/compose")}
              className={`w-full mt-4 bg-indigo-600 
              hover:bg-indigo-700 text-white 
              font-semibold 
              ${expanded ? "w-full py-3 px-4" : "w-11 h-11 items-center justify-center"} 
              rounded-xl shadow-md transition-all`}
              title="Compose New"
            >
              {expanded ? (
                <>✏️ Compose New</>) :
                (
                  <span className="text-lg">✏️</span>
                )}
            </button>
          </div>

        </nav>

        {/* ===== LOGOUT AT BOTTOM ===== */}
        <div className={`
            shrink-0 border-t border-gray-200
            ${expanded ? "p-4" : "p-2"}
          `}>
          <button
            onClick={handleLogout}
            className={`
              w-full flex items-center gap-2 bg-gray-100 hover:bg-red-50
              text-gray-700 hover:text-red-600 font-medium rounded-lg
              transition-colors whitespace-nowrap
              ${expanded ? "justify-center py-2.5 px-4" : "justify-center py-2.5"}
            `}
            title="Logout"
          >
            <span className="text-lg shrink-0">🚪</span>
            <span
              className={`
                overflow-hidden transition-all duration-300
                ${expanded ? "opacity-100 max-w-full" : "opacity-0 max-w-0"}
              `}
            >
              Logout
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}