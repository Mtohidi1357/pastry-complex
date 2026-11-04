"use client";
import type { ReactNode } from "react";
import styles from "./WorkflowFormFrame.module.css";
type Stage = "requested" | "production" | "receiving" | "new" | "page";
export default function WorkflowFormFrame({ stage, children }: { stage: Stage; children: ReactNode }) {
    return <div className={stage === "page" ? styles.page : styles.frame} data-workflow-stage={stage}>
        {children}
        {!["new", "page"].includes(stage) && <p className={styles.scrollHint}>On a small screen, swipe the table sideways to see all quantities and actions.</p>}
    </div>;
}
