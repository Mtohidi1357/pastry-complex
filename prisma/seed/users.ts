import { PrismaClient } from "../../src/generated/prisma/client";
import bcrypt from "bcrypt";

export async function seedUsers(prisma: PrismaClient) {
    console.log("Seeding users...");
    const adminPassword = await bcrypt.hash("admin123", 10);
    const inventoryPassword = await bcrypt.hash("inv123", 10);
    const managerPassword = await bcrypt.hash("bm123", 10);
    const workshopPassword = await bcrypt.hash("wm123", 10);

    const adminRole = await prisma.role.findUnique({
        where: { code: "ADMIN" },
    });

    const inventoryRole = await prisma.role.findUnique({
        where: { code: "INV" },
    });

    const managerRole = await prisma.role.findUnique({
        where: { code: "BM" },
    });

    const workshopRole = await prisma.role.findUnique({
        where: { code: "WM" },
    });

    const salesBranch01 = await prisma.branch.findUnique({
        where: { code: "BR01" },
    });

    const salesBranch02 = await prisma.branch.findUnique({
        where: { code: "BR02" },
    });

    const bakeryBranch = await prisma.branch.findUnique({
        where: { code: "WS01" },
    });

    if (
        !adminRole ||
        !inventoryRole ||
        !managerRole ||
        !workshopRole ||
        !salesBranch01 ||
        !salesBranch02 ||
        !bakeryBranch
    ) {
        throw new Error("Required roles or branches were not found.");
    }

    const users = [
        {
            username: "admin",
            passwordHash: adminPassword,
            firstName: "System",
            lastName: "Administrator",
            roleId: adminRole.id,
            branchId: salesBranch01.id,
        },

        {
            username: "inventory",
            passwordHash: inventoryPassword,
            firstName: "Inventory",
            lastName: "User",
            roleId: inventoryRole.id,
            branchId: salesBranch01.id,
        },

        {
            username: "inventory2",
            passwordHash: inventoryPassword,
            firstName: "Inventory2",
            lastName: "User",
            roleId: inventoryRole.id,
            branchId: salesBranch02.id,
        },

        {
            username: "manager",
            passwordHash: managerPassword,
            firstName: "Branch",
            lastName: "Manager",
            roleId: managerRole.id,
            branchId: salesBranch01.id,
        },

        {
            username: "manager2",
            passwordHash: managerPassword,
            firstName: "Branch2",
            lastName: "Manager2",
            roleId: managerRole.id,
            branchId: salesBranch02.id,
        },

        {
            username: "workshop",
            passwordHash: workshopPassword,
            firstName: "Workshop",
            lastName: "Manager",
            roleId: workshopRole.id,
            branchId: bakeryBranch.id,
        },
    ] as const;

    for (const user of users) {
        await prisma.user.upsert({
            where: {
                username: user.username,
            },

            update: {
                firstName: user.firstName,
                lastName: user.lastName,
                passwordHash: user.passwordHash,
                roleId: user.roleId,
                branchId: user.branchId,
                isActive: true,
            },

            create: {
                ...user,
                isActive: true,
            },
        });
    }

    console.log(`✓ ${users.length} users seeded`);
}