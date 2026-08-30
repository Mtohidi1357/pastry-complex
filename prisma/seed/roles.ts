import { PrismaClient } from "../../src/generated/prisma/client";

export async function seedRoles(prisma: PrismaClient) {
  console.log("Seeding roles...");

  const roles = [
    {
      code: "ADMIN",
      name: "Administrator",
      displayName: "مدیر سیستم",
      description: "System administrator",
    },
    {
      code: "INV",
      name: "Inventory Person",
      displayName: "مسئول موجودی",
      description: "Reports daily inventory",
    },
    {
      code: "BM",
      name: "Branch Manager",
      displayName: "مدیر شعبه",
      description: "Creates daily production requests",
    },
    {
      code: "WM",
      name: "Workshop Manager",
      displayName: "مدیر کارگاه",
      description: "Produces and dispatches products",
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: {
        code: role.code,
      },
      update: {
        name: role.name,
        description: role.description,
      },
      create: role,
    });
  }

  console.log(`✓ ${roles.length} roles seeded`);
}