import { PrismaClient } from "../../src/generated/prisma/client";

export async function seedProductCategories(prisma: PrismaClient) {
  console.log("Seeding product categories...");

  const categories = [
    {
      code: "BREAD",
      name: "Bread",
      displayName: "نان",
      isActive: true,
    },
    {
      code: "PASTRY",
      name: "Pastry",
      displayName: "شیرینی",
      isActive: true,
    },
    {
      code: "CAKE",
      name: "Cake",
      displayName: "کیک",
      isActive: true,
    },
    {
      code: "COOKIE",
      name: "Cookie",
      displayName: "کلوچه",
      isActive: true,
    },
    {
      code: "DESSERT",
      name: "Dessert",
      displayName: "دسر",
      isActive: true,
    },
    {
      code: "DRINK",
      name: "Drink",
      displayName: "نوشیدنی",
      isActive: true,
    },
  ] as const;

  for (const category of categories) {
    await prisma.productCategory.upsert({
      where: {
        code: category.code,
      },
      update: {
        name: category.name,
        isActive: category.isActive,
      },
      create: category,
    });
  }

  console.log(`✓ ${categories.length} product categories seeded`);
}