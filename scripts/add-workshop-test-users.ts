import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma";

async function main() {
    const name = process.env.DATABASE_NAME;
    if (!name) throw new Error("DATABASE_NAME is required.");
    console.log(`Target database: ${name}. Adds WS02 and test accounts only; no existing rows/passwords are updated.`);
    const apply = process.argv.includes("--apply"), target = process.argv.indexOf("--database");
    if (apply && (target < 0 || process.argv[target + 1] !== name)) throw new Error("Pass --database followed by the exact DATABASE_NAME to confirm the target.");
    if (apply && process.env.NODE_ENV === "production") throw new Error("Run this optional test setup only in your development/testing environment.");
    const password = process.env.WORKSHOP_TEST_PASSWORD;
    if (apply && (!password || password.length < 12)) throw new Error("Set WORKSHOP_TEST_PASSWORD to a private password of at least 12 characters.");
    const hash = apply ? await bcrypt.hash(password!, 10) : "";
    await prisma.$transaction(async tx => {
        const roles = await tx.role.findMany({ where: { code: { in: ["WM", "INV"] } } });
        if (roles.length !== 2) throw new Error("Existing WM and INV roles are required. The main seed will not be run.");
        let branch = await tx.branch.findUnique({ where: { code: "WS02" } });
        if (branch && (!branch.isActive || branch.type !== "BAKERY")) throw new Error("WS02 already exists but is not an active workshop. No changes made.");
        const names = [{ username: "wm_ws02_test", role: "WM" }, { username: "inv_ws02_test", role: "INV" }];
        for (const account of names) {
            const existing = await tx.user.findUnique({ where: { username: account.username }, include: { role: true } });
            if (existing && (!branch || existing.branchId !== branch.id || existing.role.code !== account.role || !existing.isActive)) throw new Error(`${account.username} already exists with another membership/status. No changes made.`);
        }
        if (!apply) { console.log("Check passed. Would add missing WS02, wm_ws02_test and inv_ws02_test. Existing matching accounts are retained."); return; }
        if (!branch) branch = await tx.branch.create({ data: { code: "WS02", name: "Workshop 02 (test)", displayName: "Workshop 02 (test)", type: "BAKERY" } });
        for (const account of names) {
            const existing = await tx.user.findUnique({ where: { username: account.username } });
            if (!existing) await tx.user.create({ data: { username: account.username, firstName: "Workshop 02", lastName: account.role === "WM" ? "Test manager" : "Test inventory", passwordHash: hash, branchId: branch.id, roleId: roles.find(role => role.code === account.role)!.id } });
            console.log(`${account.username}: ${existing ? "retained without password or ID changes" : "created"}`);
        }
    });
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Test setup failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
