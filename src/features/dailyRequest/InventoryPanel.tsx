import type { ReactNode } from "react";
import styles from "./InventoryPanel.module.css";

export default function InventoryPanel({ children }: { children: ReactNode }) {
    return <div className={styles.panel}>{children}</div>;
}
