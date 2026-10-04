const mongoose = require("mongoose");

const migrateRepaymentAccountIndexes = async () => {
  const collection = require("../model/RepaymentAccountModel").collection;
  const indexes = await collection.listIndexes().toArray().catch((error) => {
    if (error.code === 26 || error.codeName === "NamespaceNotFound") {
      return [];
    }

    throw error;
  });

  const indexDefinitions = [
    {
      name: "provider_1_providerCustomerCode_1",
      key: { provider: 1, providerCustomerCode: 1 },
      field: "providerCustomerCode",
    },
    {
      name: "provider_1_providerAccountId_1",
      key: { provider: 1, providerAccountId: 1 },
      field: "providerAccountId",
    },
  ];

  for (const definition of indexDefinitions) {
    const existing = indexes.find((index) => index.name === definition.name);
    const hasCorrectFilter =
      existing?.partialFilterExpression?.[definition.field]?.$type === "string";

    if (existing && !hasCorrectFilter) {
      await collection.dropIndex(definition.name);
    }

    if (!hasCorrectFilter) {
      await collection.createIndex(
        definition.key,
        {
          name: definition.name,
          unique: true,
          partialFilterExpression: {
            [definition.field]: { $type: "string" },
          },
        },
      );
    }
  }
};

const connectDB = async () => {
  const uri = process.env.MONGO_URI || process.env.URI;

  if (!uri) {
    throw new Error("MONGO_URI environment variable is required for MongoDB connection.");
  }

  try {
    // console.log("Mongo URI:", uri);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });

    await migrateRepaymentAccountIndexes();

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection error:");
    console.error(error);
    process.exit(1);
  }
};

module.exports = connectDB;