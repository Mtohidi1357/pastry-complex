import { PrismaClient } from "../../src/generated/prisma/client";
import { Unit } from "../../src/generated/prisma/client";

export async function seedProducts(prisma: PrismaClient) {
    console.log("Seeding priducts...");

    const categories = await prisma.productCategory.findMany();

    const categoryMap = new Map(
        categories.map(c => [c.code, c.id])
    );

    const products = [
        {
            code: "K001",
            name: "Popel Cookie",
            displayName: "کوکی پاپل",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 10,
            productionOrder: 10,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K002",
            name: "Walnut and Raisin Cookie",
            displayName: "کوکی کشمش و گردو",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 20,
            productionOrder: 20,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K003",
            name: "Cranberry Cookie",
            displayName: "کوکی کرنبری",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 30,
            productionOrder: 30,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K004",
            name: "Crunchy Cookie",
            displayName: "کوکی کرانچی",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 40,
            productionOrder: 40,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K005",
            name: "Coin Cookie",
            displayName: "کوکی سکه ای",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 50,
            productionOrder: 50,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K006",
            name: "Pistachio Cookie",
            displayName: "کوکی پسته ای",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 60,
            productionOrder: 60,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K007",
            name: "Chocolate Cookie",
            displayName: "کوکی شکلاتی",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 70,
            productionOrder: 70,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K008",
            name: "Snickers Cookie",
            displayName: "کوکی اسنیکرز",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 80,
            productionOrder: 80,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K009",
            name: "Izmir Bomb Cookie",
            displayName: "کوکی بمب ازمیر",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 90,
            productionOrder: 90,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K010",
            name: "Red Velvet Cookie",
            displayName: "کوکی ردولوت",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 100,
            productionOrder: 100,

            barcode: null,

            notes: null,

            isActive: true,
        },
        {
            code: "K011",
            name: "Slice Fudge Cookie",
            displayName: "کوکی اسلایس فاج",
            categoryCode: "COOKIE",

            unit: Unit.PCS,

            sortOrder: 110,
            productionOrder: 110,

            barcode: null,

            notes: null,

            isActive: true,
        },
    ] as const;

    for (const product of products) {
        const categoryId = categoryMap.get(
            product.categoryCode
        );

        if (!categoryId) {
            throw new Error(
                `Category ${product.categoryCode} not found`
            );
        }
        await prisma.product.upsert({
            where: {
                code: product.code,
            },

            update: {
                name: product.name,
                displayName: product.displayName,

                categoryId: categoryId,

                unit: product.unit,

                sortOrder: product.sortOrder,
                productionOrder: product.productionOrder,

                barcode: product.barcode,

                notes: product.notes,

                isActive: product.isActive,
            },

            create: {
                code: product.code,

                name: product.name,
                displayName: product.displayName,

                categoryId: categoryId,

                unit: product.unit,

                sortOrder: product.sortOrder,
                productionOrder: product.productionOrder,

                barcode: product.barcode,

                notes: product.notes,

                isActive: product.isActive,
            },
        });
    }

    console.log(`✓ ${products.length} products seeded`);
}